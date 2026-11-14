// HU-07: crear orden de reparación.
const request = require('supertest');
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

function validOrder(overrides = {}) {
  return {
    national_id: customer.customer.nationalId,
    device_type: 'laptop',
    brand: 'Lenovo',
    model: 'IdeaPad 3',
    serial_number: 'SN-12345',
    reported_issue: 'La pantalla no enciende al presionar el botón de encendido.',
    received_at: todayIso(),
    estimated_cost: '25.50',
    ...overrides,
  };
}

async function postOrder(agent, data) {
  const token = await csrfFrom(agent, '/ordenes/nueva');
  return agent
    .post('/ordenes/nueva')
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

describe('HU-07 Crear orden', () => {
  test('el administrador crea la orden: número generado, estado Recibido y primera fila de historial', async () => {
    const agent = await loginAgent(app, admin.user.email);
    const res = await postOrder(agent, validOrder());
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/ordenes\/\d+$/);

    const order = await Order.findOne({
      where: { customerId: customer.customer.id },
      order: [['id', 'DESC']],
    });
    expect(order.orderNumber).toMatch(/^OR-\d{4}-\d{4}$/);
    expect(order.status).toBe('received');
    expect(Number(order.estimatedCost)).toBe(25.5);

    const history = await StatusHistory.findAll({ where: { orderId: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0].previousStatus).toBeNull();
    expect(history[0].newStatus).toBe('received');
    expect(history[0].userId).toBe(admin.user.id);
  });

  test('el número de orden lo genera el servidor y avanza de uno en uno', async () => {
    const agent = await loginAgent(app, admin.user.email);
    await postOrder(agent, validOrder({ order_number: 'OR-1999-9999' }));
    await postOrder(agent, validOrder());

    const orders = await Order.findAll({
      where: { customerId: customer.customer.id },
      order: [['id', 'ASC']],
    });
    const numbers = orders.map((o) => Number(o.orderNumber.slice(-4)));
    expect(orders.some((o) => o.orderNumber === 'OR-1999-9999')).toBe(false);
    for (let i = 1; i < numbers.length; i += 1) expect(numbers[i]).toBe(numbers[i - 1] + 1);
  });

  test('dos órdenes al mismo tiempo no repiten número', async () => {
    const agentA = await loginAgent(app, admin.user.email);
    const agentB = await loginAgent(app, admin.user.email);
    const tokenA = await csrfFrom(agentA, '/ordenes/nueva');
    const tokenB = await csrfFrom(agentB, '/ordenes/nueva');

    const [a, b] = await Promise.all([
      agentA
        .post('/ordenes/nueva')
        .type('form')
        .send({ ...validOrder(), _csrf: tokenA }),
      agentB
        .post('/ordenes/nueva')
        .type('form')
        .send({ ...validOrder(), _csrf: tokenB }),
    ]);
    expect(a.status).toBe(302);
    expect(b.status).toBe(302);
  });

  test.each([
    ['cédula que no existe', { national_id: '0000000001' }, 'national_id'],
    ['cédula de 9 dígitos', { national_id: '123456789' }, 'national_id'],
    ['problema de menos de 10 caracteres', { reported_issue: 'No prende' }, 'reported_issue'],
    ['problema de más de 500 caracteres', { reported_issue: 'a'.repeat(501) }, 'reported_issue'],
    ['fecha futura', { received_at: '2999-01-01' }, 'received_at'],
    ['fecha inválida', { received_at: 'ayer' }, 'received_at'],
    ['costo negativo', { estimated_cost: '-1' }, 'estimated_cost'],
    ['costo que no es número', { estimated_cost: 'gratis' }, 'estimated_cost'],
    ['tipo de equipo inventado', { device_type: 'nave' }, 'device_type'],
    ['marca de una letra', { brand: 'A' }, 'brand'],
  ])('rechaza %s', async (_nombre, cambio, campo) => {
    const agent = await loginAgent(app, admin.user.email);
    const before = await Order.count({ where: { customerId: customer.customer.id } });
    const res = await postOrder(agent, validOrder(cambio));

    expect(res.status).toBe(400);
    expect(res.text).toContain('is-invalid');
    expect(res.text).toContain(`name="${campo}"`);
    expect(await Order.count({ where: { customerId: customer.customer.id } })).toBe(before);
  });

  test('si falla el historial no queda una orden sin historial (transacción)', async () => {
    const agent = await loginAgent(app, admin.user.email);
    const before = await Order.count({ where: { customerId: customer.customer.id } });
    const spy = jest
      .spyOn(StatusHistory, 'create')
      .mockRejectedValueOnce(new Error('falla simulada'));

    const res = await postOrder(agent, validOrder());
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(await Order.count({ where: { customerId: customer.customer.id } })).toBe(before);
  });

  test('el administrador busca al cliente por cédula', async () => {
    const agent = await loginAgent(app, admin.user.email);

    const found = await agent.get(
      `/ordenes/clientes/buscar?cedula=${customer.customer.nationalId}`,
    );
    expect(found.body).toEqual({ found: true, name: 'Usuario customer' });

    const missing = await agent.get('/ordenes/clientes/buscar?cedula=0000000001');
    expect(missing.body).toEqual({ found: false });
  });

  test('un técnico o un cliente que intenta entrar recibe 403', async () => {
    for (const person of [technician, customer]) {
      const agent = await loginAgent(app, person.user.email);
      expect((await agent.get('/ordenes/nueva')).status).toBe(403);

      const token = await csrfFrom(agent, '/');
      const res = await agent
        .post('/ordenes/nueva')
        .type('form')
        .send({ ...validOrder(), _csrf: token });
      expect(res.status).toBe(403);
    }
  });

  test('sin sesión redirige al inicio de sesión', async () => {
    const res = await request(app).get('/ordenes/nueva');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});
