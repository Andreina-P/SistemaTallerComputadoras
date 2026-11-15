// HU-16: perfil del cliente. Necesita PostgreSQL con las migraciones aplicadas.
const request = require('supertest');
const app = require('../../src/app');
const {
  csrfFrom,
  createTestUser,
  loginAgent,
  cleanTestUsers,
  closeConnections,
} = require('../ayudas');

let customer;
let other;
let agent;

const validProfile = (overrides = {}) => ({
  name: 'María Fernanda Torres',
  phone: '0991234567',
  address: 'Av. 6 de Diciembre N34, Quito',
  ...overrides,
});

async function postProfile(client, data) {
  const token = await csrfFrom(client, '/perfil');
  return client
    .post('/perfil')
    .type('form')
    .send({ ...data, _csrf: token });
}

beforeAll(async () => {
  customer = await createTestUser({ role: 'customer' });
  other = await createTestUser({ role: 'customer' });
  agent = await loginAgent(app, customer.user.email);
});

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-16 Perfil del cliente', () => {
  test('sin sesión redirige al login', async () => {
    const res = await request(app).get('/perfil');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('el personal no tiene perfil de cliente (403)', async () => {
    for (const role of ['technician', 'admin']) {
      const staff = await createTestUser({ role });
      const staffAgent = await loginAgent(app, staff.user.email);
      expect((await staffAgent.get('/perfil')).status).toBe(403);
      const token = await csrfFrom(staffAgent, '/ordenes');
      const res = await staffAgent
        .post('/perfil')
        .type('form')
        .send({ ...validProfile(), _csrf: token });
      expect(res.status).toBe(403);
    }
  });

  test('muestra los datos del cliente; correo y cédula no son editables', async () => {
    const res = await agent.get('/perfil');
    expect(res.status).toBe(200);
    expect(res.text).toContain(customer.user.email);
    expect(res.text).toContain(customer.customer.nationalId);
    expect(res.text).toContain('name="name"');
    expect(res.text).toContain('name="phone"');
    expect(res.text).toContain('name="address"');
    expect(res.text).not.toContain('name="national_id"');
    expect(res.text).not.toContain('name="email"');
    expect(res.text).not.toContain('name="role"');
  });

  test('guarda nombre, teléfono y dirección válidos', async () => {
    const res = await postProfile(agent, validProfile());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/perfil');

    await customer.user.reload();
    await customer.customer.reload();
    expect(customer.user.name).toBe('María Fernanda Torres');
    expect(customer.customer.phone).toBe('0991234567');
    expect(customer.customer.address).toBe('Av. 6 de Diciembre N34, Quito');

    // el menú ya muestra el nombre nuevo sin volver a iniciar sesión
    const page = await agent.get('/perfil');
    expect(page.text).toContain('Tu perfil se actualizó');
    expect(page.text).toContain('María Fernanda Torres · Cliente');
  });

  test('una dirección vacía se guarda como sin dirección', async () => {
    const res = await postProfile(agent, validProfile({ address: '  ' }));
    expect(res.status).toBe(302);
    await customer.customer.reload();
    expect(customer.customer.address).toBeNull();
  });

  test('rechaza datos inválidos y no guarda nada', async () => {
    const cases = [
      [{ name: 'Al' }, 'entre 3 y 80'],
      [{ name: 'Maria 123' }, 'solo puede tener letras'],
      [{ phone: '12345' }, 'El teléfono debe tener 10 dígitos'],
      [{ phone: 'abcdefghij' }, 'El teléfono debe tener 10 dígitos'],
      [{ address: 'a'.repeat(151) }, 'máximo 150'],
    ];
    for (const [change, message] of cases) {
      const res = await postProfile(agent, validProfile(change));
      expect(res.status).toBe(400);
      expect(res.text).toContain(message);
    }
    await customer.user.reload();
    await customer.customer.reload();
    expect(customer.user.name).toBe('María Fernanda Torres');
    expect(customer.customer.phone).toBe('0991234567');
  });

  test('no puede cambiar el rol, la cédula ni el correo aunque los envíe', async () => {
    const nationalId = customer.customer.nationalId;
    const email = customer.user.email;
    const res = await postProfile(
      agent,
      validProfile({
        role: 'admin',
        national_id: '1111111111',
        nationalId: '1111111111',
        email: 'otro@reparus.test',
        user_id: String(other.user.id),
      }),
    );
    expect(res.status).toBe(302);

    await customer.user.reload();
    await customer.customer.reload();
    expect(customer.user.role).toBe('customer');
    expect(customer.user.email).toBe(email);
    expect(customer.customer.nationalId).toBe(nationalId);
    expect((await agent.get('/ordenes/nueva')).status).toBe(403); // sigue siendo cliente
  });

  test('solo edita su propio perfil: no afecta a otro cliente', async () => {
    const before = { name: other.user.name, phone: other.customer.phone };
    await postProfile(agent, validProfile({ id: String(other.customer.id) }));
    await other.user.reload();
    await other.customer.reload();
    expect(other.user.name).toBe(before.name);
    expect(other.customer.phone).toBe(before.phone);
  });

  test('sin token CSRF el POST se rechaza con 403', async () => {
    const res = await agent
      .post('/perfil')
      .type('form')
      .send(validProfile({ phone: '0900000000' }));
    expect(res.status).toBe(403);
    await customer.customer.reload();
    expect(customer.customer.phone).not.toBe('0900000000');
  });
});
