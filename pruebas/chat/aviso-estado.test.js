// HU-12: aviso en tiempo real del cambio de estado. Necesita PostgreSQL con las migraciones aplicadas.
const http = require('http');
const { io: connect } = require('socket.io-client');
const app = require('../../src/app');
const { createSocketServer } = require('../../src/configuracion/tiempoReal');
const { Order, StatusHistory } = require('../../src/configuracion/modelos');
const avisos = require('../../src/compartido/utilidades/avisos');
const { todayIso } = require('../../src/compartido/utilidades/formato');
const {
  csrfFrom,
  createTestUser,
  loginAgent,
  cookieOf,
  cleanTestUsers,
  closeConnections,
} = require('../ayudas');

let server;
let io;
let url;
let admin; // quien hace el cambio
let otherAdmin;
let technician;
let outsiderTechnician;
let customer;
let outsiderCustomer;
const clients = [];

// Conecta un usuario y guarda los avisos que le lleguen.
async function listen(person) {
  const agent = await loginAgent(app, person.user.email);
  const client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: { cookie: cookieOf(agent) },
  });
  clients.push(client);
  const received = [];
  client.on('order:status-changed', (data) => received.push(data));
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });
  return { agent, client, received };
}

const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeOrder(overrides = {}) {
  const order = await Order.create({
    orderNumber: `OR-6${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`.slice(0, 12),
    customerId: customer.customer.id,
    technicianId: technician.user.id,
    deviceType: 'laptop',
    brand: 'Dell',
    model: 'Inspiron',
    reportedIssue: 'No enciende y hace un ruido extraño.',
    receivedAt: todayIso(),
    estimatedCost: 50,
    ...overrides,
  });
  await StatusHistory.create({
    orderId: order.id,
    previousStatus: null,
    newStatus: order.status,
    comment: 'Orden creada.',
    customerVisible: true,
    userId: admin.user.id,
  });
  return order;
}

async function changeStatus(agent, orderId, data) {
  const token = await csrfFrom(agent, `/ordenes/${orderId}`);
  return agent
    .post(`/ordenes/${orderId}/estado`)
    .type('form')
    .send({ ...data, _csrf: token });
}

beforeAll(async () => {
  server = http.createServer(app);
  io = createSocketServer(server, app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  admin = await createTestUser({ role: 'admin' });
  otherAdmin = await createTestUser({ role: 'admin' });
  technician = await createTestUser({ role: 'technician' });
  outsiderTechnician = await createTestUser({ role: 'technician' });
  customer = await createTestUser({ role: 'customer' });
  outsiderCustomer = await createTestUser({ role: 'customer' });
});

afterEach(() => {
  while (clients.length) clients.pop().close();
});

afterAll(async () => {
  io.close();
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-12 Aviso en tiempo real del cambio de estado', () => {
  test('lo reciben el cliente dueño, el técnico asignado y los administradores, con número de orden y estado nuevo', async () => {
    const order = await makeOrder();
    const actor = await listen(admin);
    const [owner, assigned, adminWatcher] = await Promise.all([
      listen(customer),
      listen(technician),
      listen(otherAdmin),
    ]);

    await changeStatus(actor.agent, order.id, { new_status: 'diagnosing' });
    await pause();

    for (const watcher of [owner, assigned, adminWatcher]) {
      expect(watcher.received).toHaveLength(1);
      expect(watcher.received[0]).toMatchObject({
        orderId: order.id,
        orderNumber: order.orderNumber,
        previousStatus: 'received',
        newStatus: 'diagnosing',
        newStatusLabel: 'En diagnóstico',
      });
    }
  });

  test('un usuario sin relación con la orden no lo recibe', async () => {
    const order = await makeOrder();
    const actor = await listen(admin);
    const [stranger, otherTechnician, owner] = await Promise.all([
      listen(outsiderCustomer),
      listen(outsiderTechnician),
      listen(customer),
    ]);

    await changeStatus(actor.agent, order.id, { new_status: 'diagnosing' });
    await pause();

    expect(owner.received).toHaveLength(1);
    expect(stranger.received).toEqual([]);
    expect(otherTechnician.received).toEqual([]);
  });

  test('quien hace el cambio no recibe su propio aviso', async () => {
    const order = await makeOrder();
    const actor = await listen(admin);

    await changeStatus(actor.agent, order.id, { new_status: 'diagnosing' });
    await pause();

    expect(actor.received).toEqual([]);
  });

  test('el aviso no incluye el comentario, que puede ser una nota interna', async () => {
    const order = await makeOrder();
    const actor = await listen(admin);
    const owner = await listen(customer);

    await changeStatus(actor.agent, order.id, {
      new_status: 'diagnosing',
      comment: 'NOTA-INTERNA-SECRETA',
    });
    await pause();

    expect(JSON.stringify(owner.received)).not.toContain('NOTA-INTERNA-SECRETA');
    expect(owner.received[0]).not.toHaveProperty('comment');
  });

  test('se emite después de guardar: al recibir el aviso, la base de datos ya tiene el estado nuevo', async () => {
    const order = await makeOrder();
    const actor = await listen(admin);
    const owner = await listen(customer);

    const statusWhenReceived = new Promise((resolve) => {
      owner.client.on('order:status-changed', async () => {
        resolve((await Order.findByPk(order.id)).status);
      });
    });

    await changeStatus(actor.agent, order.id, { new_status: 'diagnosing' });
    await expect(statusWhenReceived).resolves.toBe('diagnosing');
  });

  test('un cambio rechazado no genera aviso', async () => {
    const order = await makeOrder();
    const actor = await listen(admin);
    const owner = await listen(customer);

    const res = await changeStatus(actor.agent, order.id, {
      new_status: 'ready',
      comment: 'Salto',
    });
    await pause();

    expect(res.status).toBe(409);
    expect(owner.received).toEqual([]);
  });

  test('si el aviso falla, el cambio de estado igual queda guardado', async () => {
    const order = await makeOrder();
    const actor = await listen(admin);
    const spy = jest.spyOn(avisos, 'emitToUsers').mockImplementation(() => {
      throw new Error('falla simulada');
    });
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await changeStatus(actor.agent, order.id, { new_status: 'diagnosing' });
    spy.mockRestore();
    logSpy.mockRestore();

    expect(res.status).toBe(302);
    expect((await Order.findByPk(order.id)).status).toBe('diagnosing');
  });

  test('la página incluye el contenedor de avisos y los scripts solo con sesión iniciada', async () => {
    const request = require('supertest');
    const logged = await (await loginAgent(app, customer.user.email)).get('/');
    expect(logged.text).toContain('id="avisos"');
    expect(logged.text).toContain('/js/avisos.js');

    const anonymous = await request(app).get('/');
    expect(anonymous.text).not.toContain('id="avisos"');
  });
});
