// Conexión base de Socket.IO: autenticación con la sesión en el handshake y sala personal por usuario.
// Necesita PostgreSQL con las migraciones aplicadas.
const http = require('http');
const { io: connect } = require('socket.io-client');
const app = require('../../src/app');
const { createSocketServer } = require('../../src/configuracion/tiempoReal');
const { userRoom } = require('../../src/compartido/utilidades/salas');
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
let ana;
let beto;
const clients = [];

// Abre una conexión y espera el resultado: 'connected' o el mensaje de error.
function open(cookie) {
  const client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: cookie ? { cookie } : {},
  });
  clients.push(client);
  return new Promise((resolve) => {
    client.on('connect', () => resolve({ client, result: 'connected' }));
    client.on('connect_error', (error) => resolve({ client, result: error.message }));
  });
}

beforeAll(async () => {
  server = http.createServer(app);
  io = createSocketServer(server, app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  ana = await createTestUser({ role: 'customer' });
  beto = await createTestUser({ role: 'technician' });
});

afterEach(() => {
  while (clients.length) clients.pop().close();
});

afterAll(async () => {
  io.close();
  await cleanTestUsers();
  await closeConnections();
});

describe('Socket.IO: conexión base', () => {
  test('sin sesión la conexión se rechaza', async () => {
    const { result } = await open();
    expect(result).toBe('No autenticado');
  });

  test('con una cookie de sesión falsa la conexión se rechaza', async () => {
    const { result } = await open('reparus.sid=s%3Afalsa.firma-inventada');
    expect(result).toBe('No autenticado');
  });

  test('con la sesión iniciada la conexión se acepta y entra a su sala personal', async () => {
    const agent = await loginAgent(app, ana.user.email);
    const { result } = await open(cookieOf(agent));
    expect(result).toBe('connected');

    const inRoom = await io.in(userRoom(ana.user.id)).fetchSockets();
    expect(inRoom).toHaveLength(1);
    expect(inRoom[0].data.user.id).toBe(ana.user.id);
    expect(inRoom[0].data.user.role).toBe('customer');
  });

  test('un aviso a la sala personal lo recibe solo su dueño', async () => {
    const [anaConn, betoConn] = await Promise.all([
      loginAgent(app, ana.user.email).then((agent) => open(cookieOf(agent))),
      loginAgent(app, beto.user.email).then((agent) => open(cookieOf(agent))),
    ]);

    const received = { ana: [], beto: [] };
    anaConn.client.on('test:aviso', (data) => received.ana.push(data));
    betoConn.client.on('test:aviso', (data) => received.beto.push(data));

    io.to(userRoom(ana.user.id)).emit('test:aviso', { texto: 'solo para Ana' });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(received.ana).toEqual([{ texto: 'solo para Ana' }]);
    expect(received.beto).toEqual([]);
  });

  test('un usuario no puede unirse a la sala personal de otro desde el navegador', async () => {
    const agent = await loginAgent(app, beto.user.email);
    const { client } = await open(cookieOf(agent));

    client.emit('join', userRoom(ana.user.id));
    client.emit('room:join', userRoom(ana.user.id));
    await new Promise((resolve) => setTimeout(resolve, 150));

    const inAnaRoom = await io.in(userRoom(ana.user.id)).fetchSockets();
    expect(inAnaRoom).toHaveLength(0);
  });

  test('al cerrar sesión se cierran las conexiones de tiempo real del usuario', async () => {
    const agent = await loginAgent(app, ana.user.email);
    const { client } = await open(cookieOf(agent));
    const disconnected = new Promise((resolve) => client.on('disconnect', resolve));

    const page = await agent.get('/');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    await agent.post('/logout').type('form').send({ _csrf: csrf });

    await expect(disconnected).resolves.toBe('io server disconnect');
  });
});
