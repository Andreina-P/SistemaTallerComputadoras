// HU-02: inicio de sesión. Necesita PostgreSQL con las migraciones aplicadas.
const request = require('supertest');
const express = require('express');
const app = require('../../src/app');
const { SESSION_COOKIE_NAME } = require('../../src/configuracion/sesion');
const { createLimiter } = require('../../src/compartido/middlewares/limitador');
const authService = require('../../src/modulos/autenticacion/autenticacion.servicio');
const { User } = require('../../src/configuracion/modelos');
const { csrfFrom, uniqueEmail, cleanTestUsers, closeConnections } = require('../ayudas');

const PASSWORD = 'Clave1234';
let customer;
let inactive;

async function postLogin(agent, email, password) {
  const token = await csrfFrom(agent, '/login');
  return agent.post('/login').type('form').send({ email, password, _csrf: token });
}

beforeAll(async () => {
  const hash = await authService.hashPassword(PASSWORD);
  customer = await User.create({
    name: 'Cliente Prueba',
    email: uniqueEmail(),
    passwordHash: hash,
    role: 'customer',
  });
  inactive = await User.create({
    name: 'Inactivo Prueba',
    email: uniqueEmail(),
    passwordHash: hash,
    role: 'customer',
    active: false,
  });
});

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-02 Inicio de sesión', () => {
  test('con credenciales correctas abre sesión y redirige a las órdenes', async () => {
    const agent = request.agent(app);
    const res = await postLogin(agent, customer.email, PASSWORD);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ordenes');

    const home = await agent.get('/');
    expect(home.text).toContain('Cliente Prueba');
  });

  test('la cookie de sesión es httpOnly y sameSite', async () => {
    const agent = request.agent(app);
    const res = await postLogin(agent, customer.email, PASSWORD);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test('la sesión se guarda en PostgreSQL', async () => {
    const { sessionPool } = require('../../src/configuracion/sesion');
    const agent = request.agent(app);
    await postLogin(agent, customer.email, PASSWORD);

    const { rows } = await sessionPool.query(
      "SELECT 1 FROM session WHERE sess::text LIKE '%' || $1 || '%'",
      [customer.email],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test('clave incorrecta, correo inexistente y usuario inactivo dan el mismo mensaje genérico', async () => {
    const wrongPassword = await postLogin(request.agent(app), customer.email, 'OtraClave99');
    const unknownEmail = await postLogin(request.agent(app), uniqueEmail(), PASSWORD);
    const inactiveUser = await postLogin(request.agent(app), inactive.email, PASSWORD);

    for (const res of [wrongPassword, unknownEmail, inactiveUser]) {
      expect(res.status).toBe(401);
      expect(res.text).toContain('Correo o contraseña incorrectos.');
    }
  });

  test('un usuario inactivo no queda con sesión abierta', async () => {
    const agent = request.agent(app);
    await postLogin(agent, inactive.email, PASSWORD);
    const home = await agent.get('/');
    expect(home.text).not.toContain('Inactivo Prueba');
  });

  test('no acepta redirecciones a otros sitios después de iniciar sesión', async () => {
    const agent = request.agent(app);
    const res = await postLogin(agent, customer.email, PASSWORD);
    expect(res.headers.location.startsWith('/')).toBe(true);
    expect(res.headers.location.startsWith('//')).toBe(false);
  });

  test('el limitador bloquea tras demasiados intentos fallidos', async () => {
    const mini = express();
    mini.set('view engine', 'ejs');
    mini.set('views', require('path').join(__dirname, '../../src/vistas'));
    mini.post('/intento', createLimiter({ windowMs: 60000, limit: 2 }), (req, res) =>
      res.status(401).send('mal'),
    );

    expect((await request(mini).post('/intento')).status).toBe(401);
    expect((await request(mini).post('/intento')).status).toBe(401);
    expect((await request(mini).post('/intento')).status).toBe(429);
  });
});
