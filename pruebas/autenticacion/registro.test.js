// HU-01: registro de cliente. Necesita PostgreSQL con las migraciones aplicadas.
const request = require('supertest');
const app = require('../../src/app');
const { User, Customer } = require('../../src/configuracion/modelos');
const bcrypt = require('bcryptjs');
const { csrfFrom, validCustomerData, cleanTestUsers, closeConnections } = require('../ayudas');

async function postRegister(agent, data) {
  const token = await csrfFrom(agent, '/registro');
  return agent
    .post('/registro')
    .type('form')
    .send({ ...data, _csrf: token });
}

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-01 Registro de cliente', () => {
  test('crea el usuario con rol cliente, su perfil, y guarda la clave con hash', async () => {
    const data = validCustomerData();
    const res = await postRegister(request.agent(app), data);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');

    const user = await User.findOne({ where: { email: data.email } });
    expect(user.role).toBe('customer');
    expect(user.passwordHash).not.toBe(data.password);
    expect(await bcrypt.compare(data.password, user.passwordHash)).toBe(true);

    const customer = await Customer.findOne({ where: { userId: user.id } });
    expect(customer.nationalId).toBe(data.national_id);
  });

  test('el rol es siempre cliente aunque el formulario envíe otro', async () => {
    const data = validCustomerData();
    await postRegister(request.agent(app), { ...data, role: 'admin' });

    const user = await User.findOne({ where: { email: data.email } });
    expect(user.role).toBe('customer');
  });

  test.each([
    ['nombre muy corto', { name: 'Al' }, 'name'],
    ['nombre con números', { name: 'Ana 123' }, 'name'],
    ['correo inválido', { email: 'no-es-correo' }, 'email'],
    ['clave corta', { password: 'Ab1' }, 'password'],
    ['clave sin número', { password: 'SoloLetras' }, 'password'],
    ['clave sin letra', { password: '12345678' }, 'password'],
    ['cédula de 9 dígitos', { national_id: '123456789' }, 'national_id'],
    ['teléfono con letras', { phone: '09abc45678' }, 'phone'],
  ])('rechaza %s', async (_nombre, cambio, campo) => {
    const data = validCustomerData(cambio);
    const res = await postRegister(request.agent(app), data);

    expect(res.status).toBe(400);
    expect(res.text).toContain('is-invalid');
    expect(res.text).toContain(`name="${campo}"`);
    expect(await User.count({ where: { email: data.email } })).toBe(0);
  });

  test('rechaza un correo repetido y una cédula repetida', async () => {
    const first = validCustomerData();
    await postRegister(request.agent(app), first);

    const sameEmail = await postRegister(
      request.agent(app),
      validCustomerData({ email: first.email }),
    );
    expect(sameEmail.status).toBe(400);
    expect(sameEmail.text).toContain('Este correo ya está registrado.');

    const sameId = await postRegister(
      request.agent(app),
      validCustomerData({ national_id: first.national_id }),
    );
    expect(sameId.status).toBe(400);
    expect(sameId.text).toContain('Esta cédula ya está registrada.');
  });

  test('si falla el perfil de cliente no queda un usuario huérfano (transacción)', async () => {
    const data = validCustomerData();
    const spy = jest.spyOn(Customer, 'create').mockRejectedValueOnce(new Error('falla simulada'));

    const res = await postRegister(request.agent(app), data);
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(await User.count({ where: { email: data.email } })).toBe(0);
  });

  test('sin token CSRF el formulario se rechaza con 403', async () => {
    const res = await request(app).post('/registro').type('form').send(validCustomerData());
    expect(res.status).toBe(403);
  });
});
