// HU-06: listado, búsqueda y edición de clientes. Necesita PostgreSQL con las migraciones aplicadas.
const request = require('supertest');
const app = require('../../src/app');
const { Customer } = require('../../src/configuracion/modelos');
const {
  csrfFrom,
  createTestUser,
  loginAgent,
  cleanTestUsers,
  closeConnections,
} = require('../ayudas');

let admin;
let technician;
let customer;
let adminAgent;

async function postEdit(agent, id, data, { token } = {}) {
  const csrf = token ?? (await csrfFrom(agent, `/clientes/${id}/editar`));
  return agent
    .post(`/clientes/${id}/editar`)
    .type('form')
    .send({ ...data, _csrf: csrf });
}

beforeAll(async () => {
  admin = await createTestUser({ role: 'admin' });
  technician = await createTestUser({ role: 'technician' });
  customer = await createTestUser({ role: 'customer' });
  await customer.user.update({ name: 'Zulema Quispe Unica' });
  adminAgent = await loginAgent(app, admin.user.email);
});

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-06 Acceso', () => {
  test('sin sesión redirige al login', async () => {
    const res = await request(app).get('/clientes');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('el técnico y el cliente reciben 403', async () => {
    for (const user of [technician, customer]) {
      const agent = await loginAgent(app, user.user.email);
      expect((await agent.get('/clientes')).status).toBe(403);
      expect((await agent.get(`/clientes/${customer.customer.id}/editar`)).status).toBe(403);
    }
  });

  test('el técnico no puede editar por POST', async () => {
    const agent = await loginAgent(app, technician.user.email);
    const token = await csrfFrom(agent, '/ordenes');
    const res = await agent
      .post(`/clientes/${customer.customer.id}/editar`)
      .type('form')
      .send({ phone: '0999999999', address: 'X', _csrf: token });
    expect(res.status).toBe(403);
    await customer.customer.reload();
    expect(customer.customer.phone).not.toBe('0999999999');
  });

  test('el administrador ve el listado con los datos del cliente', async () => {
    const res = await adminAgent.get(`/clientes?q=${customer.customer.nationalId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Zulema Quispe Unica');
    expect(res.text).toContain(customer.user.email);
    expect(res.text).toContain(customer.customer.nationalId);
    expect(res.text).toContain(`/clientes/${customer.customer.id}/editar`);
  });
});

describe('HU-06 Búsqueda y paginación', () => {
  test('busca por cédula', async () => {
    const res = await adminAgent.get(`/clientes?q=${customer.customer.nationalId}`);
    expect(res.text).toContain('Zulema Quispe Unica');
    expect(res.text).toContain('1 cliente(s)');
  });

  test('busca por nombre sin distinguir mayúsculas', async () => {
    const res = await adminAgent.get('/clientes?q=zulema%20QUISPE');
    expect(res.text).toContain('Zulema Quispe Unica');
  });

  test('sin coincidencias muestra un mensaje', async () => {
    const res = await adminAgent.get('/clientes?q=NoExisteNadieAsi');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No hay clientes que coincidan');
  });

  test('el % se busca de forma literal y no como comodín', async () => {
    const res = await adminAgent.get('/clientes?q=%25');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Zulema Quispe Unica');
  });

  test('pagina de 10 en 10', async () => {
    const created = [];
    for (let i = 0; i < 12; i += 1) {
      const item = await createTestUser({ role: 'customer' });
      await item.user.update({ name: `Paginacion Prueba ${i}` });
      created.push(item);
    }

    const first = await adminAgent.get('/clientes?q=Paginacion%20Prueba');
    expect(first.text).toContain('12 cliente(s)');
    expect(first.text).toContain('página 1 de 2');
    expect(first.text.match(/Paginacion Prueba \d+/g)).toHaveLength(10);

    const second = await adminAgent.get('/clientes?q=Paginacion%20Prueba&pagina=2');
    expect(second.text).toContain('página 2 de 2');
    expect(second.text.match(/Paginacion Prueba \d+/g)).toHaveLength(2);

    // una página fuera de rango se ajusta a la última
    const beyond = await adminAgent.get('/clientes?q=Paginacion%20Prueba&pagina=99');
    expect(beyond.text).toContain('página 2 de 2');
  });
});

describe('HU-06 Edición', () => {
  test('el formulario muestra los datos y no permite cambiar la cédula', async () => {
    const res = await adminAgent.get(`/clientes/${customer.customer.id}/editar`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(customer.customer.nationalId);
    expect(res.text).toContain('name="phone"');
    expect(res.text).toContain('name="address"');
    expect(res.text).not.toContain('name="national_id"');
    expect(res.text).not.toContain('name="name"');
  });

  test('guarda teléfono y dirección válidos', async () => {
    const res = await postEdit(adminAgent, customer.customer.id, {
      phone: '0987654321',
      address: 'Av. Amazonas N24 y Colón, Quito',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/clientes');

    await customer.customer.reload();
    expect(customer.customer.phone).toBe('0987654321');
    expect(customer.customer.address).toBe('Av. Amazonas N24 y Colón, Quito');

    const list = await adminAgent.get(`/clientes?q=${customer.customer.nationalId}`);
    expect(list.text).toContain('actualizados');
  });

  test('una dirección vacía se guarda como sin dirección', async () => {
    const res = await postEdit(adminAgent, customer.customer.id, {
      phone: '0987654321',
      address: '   ',
    });
    expect(res.status).toBe(302);
    await customer.customer.reload();
    expect(customer.customer.address).toBeNull();
  });

  test('rechaza un teléfono inválido y no guarda nada', async () => {
    const before = customer.customer.phone;
    for (const phone of ['12345', 'abcdefghij', '09876543210', '']) {
      const res = await postEdit(adminAgent, customer.customer.id, { phone, address: 'Calle 1' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('El teléfono debe tener 10 dígitos');
    }
    await customer.customer.reload();
    expect(customer.customer.phone).toBe(before);
  });

  test('rechaza una dirección de más de 150 caracteres', async () => {
    const before = customer.customer.phone;
    const res = await postEdit(adminAgent, customer.customer.id, {
      phone: '0911111111',
      address: 'a'.repeat(151),
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('máximo 150 caracteres');
    await customer.customer.reload();
    expect(customer.customer.phone).toBe(before);
  });

  test('la cédula y el nombre no cambian aunque se envíen en la petición', async () => {
    const nationalId = customer.customer.nationalId;
    const res = await postEdit(adminAgent, customer.customer.id, {
      phone: '0922222222',
      address: 'Calle 2',
      national_id: '1111111111',
      nationalId: '1111111111',
      name: 'Otro Nombre',
    });
    expect(res.status).toBe(302);

    const stored = await Customer.findByPk(customer.customer.id);
    expect(stored.nationalId).toBe(nationalId);
    expect(stored.phone).toBe('0922222222');
    await customer.user.reload();
    expect(customer.user.name).toBe('Zulema Quispe Unica');
  });

  test('un cliente inexistente o con id inválido responde 404', async () => {
    expect((await adminAgent.get('/clientes/99999999/editar')).status).toBe(404);
    expect((await adminAgent.get('/clientes/abc/editar')).status).toBe(404);
    const res = await postEdit(
      adminAgent,
      99999999,
      { phone: '0933333333' },
      {
        token: await csrfFrom(adminAgent, '/clientes'),
      },
    );
    expect(res.status).toBe(404);
  });

  test('sin token CSRF el POST se rechaza con 403', async () => {
    const res = await adminAgent
      .post(`/clientes/${customer.customer.id}/editar`)
      .type('form')
      .send({ phone: '0944444444', address: 'X' });
    expect(res.status).toBe(403);
    await customer.customer.reload();
    expect(customer.customer.phone).not.toBe('0944444444');
  });
});
