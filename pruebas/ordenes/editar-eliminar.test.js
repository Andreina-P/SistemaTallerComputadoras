// HU-10: editar, asignar técnico y eliminar. Necesita PostgreSQL con las migraciones aplicadas.
const app = require('../../src/app');
const { Order, StatusHistory } = require('../../src/configuracion/modelos');
const { todayIso } = require('../../src/compartido/utilidades/formato');
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

async function makeOrder(overrides = {}) {
  const order = await Order.create({
    orderNumber: `OR-8${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`.slice(0, 12),
    customerId: customer.customer.id,
    deviceType: 'laptop',
    brand: 'Dell',
    model: 'Inspiron',
    reportedIssue: 'No enciende y hace un ruido extraño.',
    receivedAt: todayIso(),
    estimatedCost: 10,
    ...overrides,
  });
  await StatusHistory.create({
    orderId: order.id,
    previousStatus: null,
    newStatus: 'received',
    comment: 'Orden creada.',
    customerVisible: true,
    userId: admin.user.id,
  });
  return order;
}

function validEdit(overrides = {}) {
  return {
    device_type: 'desktop',
    brand: 'HP',
    model: 'ProDesk 400',
    serial_number: 'SN-999',
    reported_issue: 'Se reinicia solo cada pocos minutos de uso.',
    received_at: todayIso(),
    estimated_cost: '40',
    technician_id: String(technician.user.id),
    ...overrides,
  };
}

async function postEdit(agent, orderId, data) {
  const token = await csrfFrom(agent, `/ordenes/${orderId}/editar`);
  return agent
    .post(`/ordenes/${orderId}/editar`)
    .type('form')
    .send({ ...data, _csrf: token });
}

beforeAll(async () => {
  admin = await createTestUser({ role: 'admin' });
  technician = await createTestUser({ role: 'technician' });
  customer = await createTestUser({ role: 'customer' });
});

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-10 Editar orden y asignar técnico', () => {
  test('el administrador edita los datos y asigna un técnico', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);

    const res = await postEdit(agent, order.id, validEdit());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/ordenes/${order.id}`);

    await order.reload();
    expect(order.brand).toBe('HP');
    expect(order.deviceType).toBe('desktop');
    expect(Number(order.estimatedCost)).toBe(40);
    expect(order.technicianId).toBe(technician.user.id);
    expect(order.status).toBe('received'); // el estado no cambia desde aquí
  });

  test('el formulario de edición muestra los datos actuales y el selector de técnico', async () => {
    const order = await makeOrder({ brand: 'MarcaActual' });
    const agent = await loginAgent(app, admin.user.email);
    const res = await agent.get(`/ordenes/${order.id}/editar`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('MarcaActual');
    expect(res.text).toContain('name="technician_id"');
    expect(res.text).toContain(technician.user.name);
  });

  test('se puede quitar el técnico asignado', async () => {
    const order = await makeOrder({ technicianId: technician.user.id });
    const agent = await loginAgent(app, admin.user.email);
    await postEdit(agent, order.id, validEdit({ technician_id: '' }));

    await order.reload();
    expect(order.technicianId).toBeNull();
  });

  test('el técnico asignado debe tener rol técnico', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);

    for (const wrong of [customer.user.id, admin.user.id, 99999999]) {
      const res = await postEdit(agent, order.id, validEdit({ technician_id: String(wrong) }));
      expect(res.status).toBe(400);
      expect(res.text).toContain('El técnico asignado debe tener rol técnico.');
    }
    await order.reload();
    expect(order.technicianId).toBeNull();
  });

  test.each([
    ['problema corto', { reported_issue: 'corto' }, 'reported_issue'],
    ['fecha futura', { received_at: '2999-01-01' }, 'received_at'],
    ['costo negativo', { estimated_cost: '-5' }, 'estimated_cost'],
    ['marca de una letra', { brand: 'A' }, 'brand'],
  ])('aplica las reglas de HU-07: rechaza %s', async (_nombre, cambio, campo) => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);
    const res = await postEdit(agent, order.id, validEdit(cambio));

    expect(res.status).toBe(400);
    expect(res.text).toContain(`name="${campo}"`);
    await order.reload();
    expect(order.brand).toBe('Dell');
  });

  test.each(['delivered', 'cancelled'])('una orden %s no se puede editar', async (status) => {
    const order = await makeOrder({ status });
    const agent = await loginAgent(app, admin.user.email);

    expect((await agent.get(`/ordenes/${order.id}/editar`)).status).toBe(409);
    // el formulario no se puede abrir, así que se envía con un token tomado de otra página
    const token = await csrfFrom(agent, '/ordenes/nueva');
    const direct = await agent
      .post(`/ordenes/${order.id}/editar`)
      .type('form')
      .send({ ...validEdit(), _csrf: token });
    expect(direct.status).toBe(409);

    await order.reload();
    expect(order.brand).toBe('Dell');
  });

  test('editar una orden que no existe responde 404', async () => {
    const agent = await loginAgent(app, admin.user.email);
    expect((await agent.get('/ordenes/99999999/editar')).status).toBe(404);
  });

  test('solo el administrador accede: técnico y cliente reciben 403', async () => {
    const order = await makeOrder();
    for (const person of [technician, customer]) {
      const agent = await loginAgent(app, person.user.email);
      expect((await agent.get(`/ordenes/${order.id}/editar`)).status).toBe(403);

      const token = await csrfFrom(agent, '/');
      const res = await agent
        .post(`/ordenes/${order.id}/editar`)
        .type('form')
        .send({ ...validEdit(), _csrf: token });
      expect(res.status).toBe(403);

      const del = await agent
        .post(`/ordenes/${order.id}`)
        .type('form')
        .send({ _method: 'DELETE', _csrf: token });
      expect(del.status).toBe(403);
    }
    expect(await Order.count({ where: { id: order.id } })).toBe(1);
  });
});

describe('HU-10 Eliminar orden', () => {
  test('la pantalla de detalle pide confirmación antes de eliminar', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);
    const res = await agent.get(`/ordenes/${order.id}`);

    expect(res.text).toContain('id="modalEliminar"');
    expect(res.text).toContain('Sí, eliminar');
    expect(res.text).toContain('name="_method" value="DELETE"');
    expect(res.text).toContain('name="_csrf"');
  });

  test('elimina la orden y su historial', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);
    const token = await csrfFrom(agent, `/ordenes/${order.id}`);

    const res = await agent
      .post(`/ordenes/${order.id}`)
      .type('form')
      .send({ _method: 'DELETE', _csrf: token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ordenes');

    expect(await Order.count({ where: { id: order.id } })).toBe(0);
    expect(await StatusHistory.count({ where: { orderId: order.id } })).toBe(0);
  });

  test('también funciona con una petición DELETE y la cabecera x-csrf-token', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);
    const token = await csrfFrom(agent, `/ordenes/${order.id}`);

    const res = await agent.delete(`/ordenes/${order.id}`).set('x-csrf-token', token);
    expect(res.status).toBe(302);
    expect(await Order.count({ where: { id: order.id } })).toBe(0);
  });

  test('sin token CSRF no elimina', async () => {
    const order = await makeOrder();
    const agent = await loginAgent(app, admin.user.email);
    const res = await agent.post(`/ordenes/${order.id}`).type('form').send({ _method: 'DELETE' });

    expect(res.status).toBe(403);
    expect(await Order.count({ where: { id: order.id } })).toBe(1);
  });

  test('eliminar una orden que no existe responde 404', async () => {
    const agent = await loginAgent(app, admin.user.email);
    const token = await csrfFrom(agent, '/ordenes/nueva');
    const res = await agent
      .post('/ordenes/99999999')
      .type('form')
      .send({ _method: 'DELETE', _csrf: token });
    expect(res.status).toBe(404);
  });
});
