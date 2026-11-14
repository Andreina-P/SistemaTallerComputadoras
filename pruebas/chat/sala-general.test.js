// HU-14: sala general del personal. Necesita PostgreSQL con las migraciones aplicadas.
const http = require('http');
const request = require('supertest');
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
let previousAuthor;
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
  const messages = [];
  const presence = [];
  client.on('message:new', (message) => messages.push(message));
  client.on('presence:update', (update) => presence.push(update));
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });
  return { client, messages, presence };
}

const joinGeneral = (conn) => conn.client.emitWithAck('general:join', {});
const sendGeneral = (conn, text) =>
  conn.client.emitWithAck('message:new', { scope: 'general', text });
const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  server = http.createServer(app);
  io = createSocketServer(server, app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  admin = await createTestUser({ role: 'admin' });
  technician = await createTestUser({ role: 'technician' });
  customer = await createTestUser({ role: 'customer' });

  // Un mensaje anterior de otra persona, como los de los datos de prueba (seed): los tests no dependen
  // de que la sala esté vacía.
  previousAuthor = await createTestUser({ role: 'admin' });
  await Message.create({
    orderId: null,
    userId: previousAuthor.user.id,
    text: 'mensaje previo ajeno',
  });
});

beforeEach(async () => {
  // La sala general es compartida: se limpian sus mensajes de prueba para que cada test parta de cero.
  await Message.destroy({ where: { orderId: null, userId: [admin.user.id, technician.user.id] } });
});

afterEach(() => {
  while (clients.length) clients.pop().close();
});

afterAll(async () => {
  await Message.destroy({ where: { orderId: null, userId: [admin.user.id, technician.user.id] } });
  io.close();
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-14 Sala general del personal', () => {
  test('administradores y técnicos pueden unirse', async () => {
    for (const person of [admin, technician]) {
      const res = await joinGeneral(await connectAs(person));
      expect(res.ok).toBe(true);
      expect(res.readOnly).toBe(false);
    }
  });

  test('un cliente que intenta unirse es rechazado', async () => {
    const conn = await connectAs(customer);
    expect(await joinGeneral(conn)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  test('un cliente no puede escribir ni recibe los mensajes de la sala', async () => {
    const staff = await connectAs(admin);
    const outsider = await connectAs(customer);
    await joinGeneral(staff);
    await joinGeneral(outsider); // rechazado

    expect(await sendGeneral(outsider, 'intento')).toEqual({ ok: false, error: 'NOT_JOINED' });
    await sendGeneral(staff, 'mensaje interno del taller');
    await pause();

    expect(outsider.messages).toEqual([]);
    expect(await Message.count({ where: { userId: customer.user.id } })).toBe(0);
  });

  test('el mensaje se guarda con order_id nulo y lo reciben los del personal', async () => {
    const adminConn = await connectAs(admin);
    const techConn = await connectAs(technician);
    await joinGeneral(adminConn);
    await joinGeneral(techConn);

    expect(await sendGeneral(adminConn, 'Reunión a las 3 pm')).toEqual({ ok: true });
    await pause();

    for (const conn of [adminConn, techConn]) {
      expect(conn.messages).toHaveLength(1);
      expect(conn.messages[0]).toMatchObject({
        scope: 'general',
        orderId: null,
        text: 'Reunión a las 3 pm',
        user: { id: admin.user.id, role: 'admin' },
      });
    }
    const saved = await Message.findAll({ where: { userId: admin.user.id, orderId: null } });
    expect(saved).toHaveLength(1);
    expect(saved[0].orderId).toBeNull();
  });

  test('al unirse se carga el historial de la sala', async () => {
    const adminConn = await connectAs(admin);
    await joinGeneral(adminConn);
    await sendGeneral(adminConn, 'primero');
    await sendGeneral(adminConn, 'segundo');

    const res = await joinGeneral(await connectAs(technician));
    expect(res.history.slice(-2).map((m) => m.text)).toEqual(['primero', 'segundo']);
  });

  test('se muestran los usuarios conectados y se actualizan', async () => {
    const adminConn = await connectAs(admin);
    const techConn = await connectAs(technician);

    const first = await joinGeneral(adminConn);
    expect(first.users.map((u) => u.id)).toEqual([admin.user.id]);

    const second = await joinGeneral(techConn);
    expect(second.users).toHaveLength(2);
    await pause();
    expect(adminConn.presence.at(-1)).toMatchObject({ scope: 'general' });
    expect(adminConn.presence.at(-1).users).toHaveLength(2);

    techConn.client.close();
    await pause(400);
    expect(adminConn.presence.at(-1).users.map((u) => u.id)).toEqual([admin.user.id]);
  });

  test('aplica el mismo saneamiento y los mismos límites que el chat de orden', async () => {
    const conn = await connectAs(admin);
    await joinGeneral(conn);

    await sendGeneral(conn, '<script>alert(1)</script><b>hola</b>');
    await pause();
    expect(conn.messages[0].text).toBe('hola');

    expect((await sendGeneral(conn, '')).ok).toBe(false);
    expect((await sendGeneral(conn, 'a'.repeat(501))).ok).toBe(false);
    expect((await sendGeneral(conn, 'a'.repeat(500))).ok).toBe(true);
  });

  test('sin haberse unido no se puede escribir', async () => {
    const conn = await connectAs(admin);
    expect(await sendGeneral(conn, 'hola')).toEqual({ ok: false, error: 'NOT_JOINED' });
  });

  test('la sala general y los chats de orden están separados', async () => {
    const order = await Order.create({
      orderNumber: `OR-4${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`.slice(0, 12),
      customerId: customer.customer.id,
      technicianId: technician.user.id,
      deviceType: 'laptop',
      brand: 'Dell',
      model: 'Inspiron',
      reportedIssue: 'No enciende y hace un ruido extraño.',
      receivedAt: todayIso(),
    });
    const general = await connectAs(admin);
    const inOrder = await connectAs(technician);
    await joinGeneral(general);
    await inOrder.client.emitWithAck('order:join', { orderId: order.id });

    await sendGeneral(general, 'solo para el personal');
    await pause();

    expect(inOrder.messages).toEqual([]);
    const history = await inOrder.client.emitWithAck('order:join', { orderId: order.id });
    expect(history.history).toEqual([]);
  });

  test('la pantalla de la sala general: personal sí, cliente 403, sin sesión al login', async () => {
    const staffPage = await (await loginAgent(app, technician.user.email)).get('/chat/general');
    expect(staffPage.status).toBe(200);
    expect(staffPage.text).toContain('data-chat-scope="general"');

    const customerPage = await (await loginAgent(app, customer.user.email)).get('/chat/general');
    expect(customerPage.status).toBe(403);
    expect(customerPage.text).not.toContain('id="chat"');

    const anonymous = await request(app).get('/chat/general');
    expect(anonymous.headers.location).toBe('/login');
  });
});
