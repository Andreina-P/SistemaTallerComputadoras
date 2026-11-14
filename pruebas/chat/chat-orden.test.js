// HU-13: chat por orden en tiempo real. Necesita PostgreSQL con las migraciones aplicadas.
const http = require('http');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const app = require('../../src/app');
const { createSocketServer } = require('../../src/configuracion/tiempoReal');
const { Order, StatusHistory, Message } = require('../../src/configuracion/modelos');
const chatService = require('../../src/modulos/chat/chat.servicio');
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
let outsiderTechnician;
let customer;
let outsiderCustomer;
const clients = [];

// Conecta a un usuario con su sesión y guarda los eventos que le lleguen.
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
  return { client, messages, presence, person };
}

const join = (conn, orderId) => conn.client.emitWithAck('order:join', { orderId });
const send = (conn, orderId, text) =>
  conn.client.emitWithAck('message:new', { scope: 'order', orderId, text });
const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeOrder(overrides = {}) {
  const order = await Order.create({
    orderNumber: `OR-5${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`.slice(0, 12),
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
});

afterEach(() => {
  while (clients.length) clients.pop().close();
});

afterAll(async () => {
  io.close();
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-13 Chat por orden: acceso', () => {
  test('entran el cliente dueño, el técnico asignado y el administrador', async () => {
    const order = await makeOrder();
    for (const person of [customer, technician, admin]) {
      const conn = await connectAs(person);
      const res = await join(conn, order.id);
      expect(res.ok).toBe(true);
      expect(res.readOnly).toBe(false);
    }
  });

  test('un usuario sin acceso es rechazado y no recibe los mensajes de la sala', async () => {
    const order = await makeOrder();
    const owner = await connectAs(customer);
    await join(owner, order.id);

    for (const person of [outsiderCustomer, outsiderTechnician]) {
      const stranger = await connectAs(person);
      const res = await join(stranger, order.id);
      expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });

      // aunque intente escribir sin haberse unido, no puede
      expect(await send(stranger, order.id, 'hola')).toEqual({ ok: false, error: 'NOT_JOINED' });

      await send(owner, order.id, 'mensaje privado de la orden');
      await pause();
      expect(stranger.messages).toEqual([]);
    }
  });

  test('una orden que no existe se rechaza igual que una ajena', async () => {
    const conn = await connectAs(admin);
    expect(await join(conn, 99999999)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  test('datos inválidos al unirse se rechazan', async () => {
    const conn = await connectAs(admin);
    for (const payload of [
      undefined,
      null,
      {},
      { orderId: 'abc' },
      { orderId: -1 },
      { orderId: 1.5 },
    ]) {
      expect(await conn.client.emitWithAck('order:join', payload)).toEqual({
        ok: false,
        error: 'INVALID',
      });
    }
  });

  test('el acceso se vuelve a verificar al enviar: si reasignan la orden, el técnico ya no escribe', async () => {
    const order = await makeOrder();
    const tech = await connectAs(technician);
    await join(tech, order.id);
    expect((await send(tech, order.id, 'primer mensaje')).ok).toBe(true);

    await order.update({ technicianId: outsiderTechnician.user.id });
    expect(await send(tech, order.id, 'ya no debería poder')).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await Message.count({ where: { orderId: order.id } })).toBe(1);
  });
});

describe('HU-13 Chat por orden: mensajes', () => {
  test('el mensaje se guarda y se reenvía a todos los de la sala, con el autor', async () => {
    const order = await makeOrder();
    const owner = await connectAs(customer);
    const tech = await connectAs(technician);
    await join(owner, order.id);
    await join(tech, order.id);

    expect(await send(owner, order.id, 'Hola, ¿cómo va mi equipo?')).toEqual({ ok: true });
    await pause();

    for (const conn of [owner, tech]) {
      expect(conn.messages).toHaveLength(1);
      expect(conn.messages[0]).toMatchObject({
        scope: 'order',
        orderId: order.id,
        text: 'Hola, ¿cómo va mi equipo?',
        user: { id: customer.user.id, name: 'Usuario customer', role: 'customer' },
      });
    }
    const saved = await Message.findAll({ where: { orderId: order.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0].userId).toBe(customer.user.id);
  });

  test('el mensaje ya está guardado cuando llega a los demás (se guarda antes de reenviarse)', async () => {
    const order = await makeOrder();
    const owner = await connectAs(customer);
    const tech = await connectAs(technician);
    await join(owner, order.id);
    await join(tech, order.id);

    const countWhenReceived = new Promise((resolve) => {
      tech.client.on('message:new', async () => {
        resolve(await Message.count({ where: { orderId: order.id } }));
      });
    });
    await send(owner, order.id, 'guardado primero');

    await expect(countWhenReceived).resolves.toBe(1);
  });

  test('los mensajes de una orden no llegan a quien está en el chat de otra', async () => {
    const orderA = await makeOrder();
    const orderB = await makeOrder();
    const inA = await connectAs(admin);
    const inB = await connectAs(admin);
    await join(inA, orderA.id);
    await join(inB, orderB.id);

    await send(inA, orderA.id, 'solo para la orden A');
    await pause();

    expect(inA.messages).toHaveLength(1);
    expect(inB.messages).toEqual([]);
  });

  test('al abrir el chat se carga el historial', async () => {
    const order = await makeOrder();
    const owner = await connectAs(customer);
    await join(owner, order.id);
    await send(owner, order.id, 'mensaje uno');
    await send(owner, order.id, 'mensaje dos');

    const later = await connectAs(admin);
    const res = await join(later, order.id);

    expect(res.history.map((m) => m.text)).toEqual(['mensaje uno', 'mensaje dos']);
    expect(res.history[0].user.name).toBe('Usuario customer');
  });

  test('el historial devuelve como máximo los últimos 50 mensajes, en orden', async () => {
    const order = await makeOrder();
    for (let i = 1; i <= 55; i += 1) {
      await Message.create({ orderId: order.id, userId: admin.user.id, text: `m${i}` });
    }
    const history = await chatService.loadHistory(order.id);
    expect(history).toHaveLength(50);
    expect(history[0].text).toBe('m6');
    expect(history[49].text).toBe('m55');
  });

  test('un mensaje con HTML se guarda saneado', async () => {
    const order = await makeOrder();
    const conn = await connectAs(customer);
    await join(conn, order.id);

    await send(
      conn,
      order.id,
      '<b>hola</b><script>alert(1)</script> <img src=x onerror=alert(2)> ok',
    );
    await pause();

    const saved = await Message.findOne({ where: { orderId: order.id } });
    expect(saved.text).toBe('hola ok');
    expect(conn.messages[0].text).toBe('hola ok');
  });

  test.each([
    ['vacío', ''],
    ['solo espacios', '     '],
    ['solo etiquetas', '<b></b><i> </i>'],
    ['de 501 caracteres', 'a'.repeat(501)],
    ['demasiado grande', 'a'.repeat(5000)],
    ['que no es texto', { x: 1 }],
  ])('rechaza un mensaje %s', async (_nombre, text) => {
    const order = await makeOrder();
    const conn = await connectAs(customer);
    await join(conn, order.id);

    const res = await send(conn, order.id, text);
    expect(res.ok).toBe(false);
    expect(await Message.count({ where: { orderId: order.id } })).toBe(0);
  });

  test('acepta un mensaje de exactamente 500 caracteres', async () => {
    const order = await makeOrder();
    const conn = await connectAs(customer);
    await join(conn, order.id);
    expect((await send(conn, order.id, 'a'.repeat(500))).ok).toBe(true);
  });

  test('un texto con < y > sueltos se conserva (no es una etiqueta)', async () => {
    expect(chatService.sanitizeMessage('si 3 < 5 y 7 > 2')).toBe('si 3 < 5 y 7 > 2');
  });

  test('el saneamiento no se deja engañar por etiquetas anidadas', async () => {
    expect(chatService.sanitizeMessage('<<b>script>alert(1)<</b>/script>')).not.toMatch(
      /<\s*\/?script/i,
    );
    expect(chatService.sanitizeMessage('<scr<script></script>ipt>alert(1)</script>')).not.toMatch(
      /<\s*script/i,
    );
  });
});

describe('HU-13 Chat por orden: conectados y solo lectura', () => {
  test('se muestran los usuarios conectados y se actualizan al entrar y salir', async () => {
    const order = await makeOrder();
    const owner = await connectAs(customer);
    const tech = await connectAs(technician);

    const first = await join(owner, order.id);
    expect(first.users.map((u) => u.id)).toEqual([customer.user.id]);

    const second = await join(tech, order.id);
    expect(second.users.map((u) => u.id).sort()).toEqual(
      [customer.user.id, technician.user.id].sort(),
    );
    await pause();
    expect(owner.presence.at(-1).users).toHaveLength(2);

    tech.client.close();
    await pause(400);
    expect(owner.presence.at(-1).users.map((u) => u.id)).toEqual([customer.user.id]);
  });

  test('una persona con dos pestañas cuenta una sola vez', async () => {
    const order = await makeOrder();
    const tabOne = await connectAs(customer);
    const tabTwo = await connectAs(customer);
    await join(tabOne, order.id);
    const res = await join(tabTwo, order.id);
    expect(res.users).toHaveLength(1);
  });

  test.each(['delivered', 'cancelled'])(
    'si la orden está %s el chat es de solo lectura',
    async (status) => {
      const order = await makeOrder({ status });
      await Message.create({ orderId: order.id, userId: admin.user.id, text: 'mensaje anterior' });
      const conn = await connectAs(customer);

      const res = await join(conn, order.id);
      expect(res.ok).toBe(true);
      expect(res.readOnly).toBe(true);
      expect(res.history.map((m) => m.text)).toEqual(['mensaje anterior']);

      expect(await send(conn, order.id, 'ya no se puede')).toEqual({
        ok: false,
        error: 'READ_ONLY',
      });
      expect(await Message.count({ where: { orderId: order.id } })).toBe(1);
    },
  );
});

describe('HU-13 Chat por orden: pantalla', () => {
  test('el detalle de la orden incluye el chat para quien tiene acceso', async () => {
    const order = await makeOrder();
    const page = await (await loginAgent(app, customer.user.email)).get(`/ordenes/${order.id}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('id="chat"');
    expect(page.text).toContain(`data-chat-order-id="${order.id}"`);
    expect(page.text).toContain('/js/chat.js');
  });

  test('quien no tiene acceso a la orden no ve ni la página ni el chat', async () => {
    const order = await makeOrder();
    const page = await (
      await loginAgent(app, outsiderCustomer.user.email)
    ).get(`/ordenes/${order.id}`);
    expect(page.status).toBe(404);
    expect(page.text).not.toContain('id="chat"');
  });

  test('sin sesión no se puede abrir la conexión de tiempo real', async () => {
    const res = await request(app).get('/ordenes/1');
    expect(res.status).toBe(302);
  });
});
