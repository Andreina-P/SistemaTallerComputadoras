// HU-15: aviso de mensaje nuevo en otra pantalla. Necesita PostgreSQL con las migraciones aplicadas.
const http = require('http');
const { io: connect } = require('socket.io-client');
const app = require('../../src/app');
const { createSocketServer } = require('../../src/configuracion/tiempoReal');
const { Order, Message } = require('../../src/configuracion/modelos');
const { todayIso } = require('../../src/compartido/utilidades/formato');
const {
  createTestUser,
  loginAgent,
  cookieOf,
  cleanTestUsers,
  closeConnections,
} = require('../ayudas');

let server;
let io;
let url;
let admin;
let technician;
let customer;
let outsiderTechnician;
let outsiderCustomer;
let order;
const clients = [];

async function connectAs(person) {
  const agent = await loginAgent(app, person.user.email);
  const client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: { cookie: cookieOf(agent) },
  });
  clients.push(client);
  const unread = [];
  client.on('message:unread', (data) => unread.push(data));
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });
  return { agent, client, unread };
}

const join = (conn) => conn.client.emitWithAck('order:join', { orderId: order.id });
const send = (conn, text) =>
  conn.client.emitWithAck('message:new', { scope: 'order', orderId: order.id, text });
const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  server = http.createServer(app);
  io = createSocketServer(server, app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  admin = await createTestUser({ role: 'admin' });
  technician = await createTestUser({ role: 'technician' });
  outsiderTechnician = await createTestUser({ role: 'technician' });
  customer = await createTestUser({ role: 'customer' });
  outsiderCustomer = await createTestUser({ role: 'customer' });
  order = await Order.create({
    orderNumber: `OR-5${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`.slice(0, 12),
    customerId: customer.customer.id,
    technicianId: technician.user.id,
    deviceType: 'laptop',
    brand: 'Dell',
    model: 'Inspiron',
    reportedIssue: 'No enciende y hace un ruido extraño.',
    receivedAt: todayIso(),
    estimatedCost: 50,
  });
});

afterEach(() => {
  while (clients.length) clients.pop().close();
});

afterAll(async () => {
  io.close();
  await Message.destroy({ where: { orderId: order.id } });
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-15 Aviso de mensaje nuevo', () => {
  test('el cliente, el técnico y los administradores sin el chat abierto reciben el aviso', async () => {
    const writer = await connectAs(customer);
    const tech = await connectAs(technician);
    const boss = await connectAs(admin);
    await join(writer);

    expect((await send(writer, 'Hola, ¿cómo va mi equipo?')).ok).toBe(true);
    await pause();

    for (const conn of [tech, boss]) {
      expect(conn.unread).toHaveLength(1);
      expect(conn.unread[0]).toMatchObject({
        orderId: order.id,
        orderNumber: order.orderNumber,
        from: customer.user.name,
      });
    }
  });

  test('quien escribe no recibe el aviso de su propio mensaje', async () => {
    const writer = await connectAs(technician);
    await join(writer);
    await send(writer, 'Ya revisé el equipo.');
    await pause();
    expect(writer.unread).toHaveLength(0);
  });

  test('no lo recibe quien tiene abierto el chat de esa orden', async () => {
    const writer = await connectAs(customer);
    const reader = await connectAs(technician);
    await join(writer);
    await join(reader);

    await send(writer, 'Mensaje con el chat abierto en ambos lados.');
    await pause();
    expect(reader.unread).toHaveLength(0);

    // al salir del chat vuelve a recibir los avisos
    await reader.client.emitWithAck('order:leave', { orderId: order.id });
    await send(writer, 'Ahora sí debería avisarte.');
    await pause();
    expect(reader.unread).toHaveLength(1);
  });

  test('un usuario sin relación con la orden no recibe el aviso', async () => {
    const writer = await connectAs(customer);
    const strangerTech = await connectAs(outsiderTechnician);
    const strangerCustomer = await connectAs(outsiderCustomer);
    await join(writer);

    await send(writer, 'Mensaje privado de esta orden.');
    await pause();
    expect(strangerTech.unread).toHaveLength(0);
    expect(strangerCustomer.unread).toHaveLength(0);
  });

  test('el aviso se emite después de guardar el mensaje', async () => {
    const writer = await connectAs(customer);
    const tech = await connectAs(technician);
    await join(writer);

    const stored = new Promise((resolve) => {
      tech.client.on('message:unread', async () => {
        resolve(await Message.count({ where: { orderId: order.id, text: 'Guardado primero.' } }));
      });
    });
    await send(writer, 'Guardado primero.');
    expect(await stored).toBe(1);
  });

  test('un mensaje rechazado no genera aviso', async () => {
    const writer = await connectAs(customer);
    const tech = await connectAs(technician);
    await join(writer);

    expect((await send(writer, '   ')).ok).toBe(false);
    await pause();
    expect(tech.unread).toHaveLength(0);
  });

  test('los mensajes de la sala general no generan este aviso', async () => {
    const staff = await connectAs(admin);
    const other = await connectAs(technician);
    await staff.client.emitWithAck('general:join', {});
    await staff.client.emitWithAck('message:new', { scope: 'general', text: 'Aviso interno' });
    await pause();
    expect(other.unread).toHaveLength(0);
    await Message.destroy({ where: { orderId: null, userId: admin.user.id } });
  });
});

describe('HU-15 Indicadores en pantalla', () => {
  test('el menú y el listado incluyen los lugares donde aparece la marca', async () => {
    const agent = await loginAgent(app, customer.user.email);
    const res = await agent.get('/ordenes');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="menu-sin-leer"');
    expect(res.text).toContain(`data-sin-leer="${order.id}"`);
    expect(res.text).toContain(`data-usuario="${customer.user.id}"`);
  });
});
