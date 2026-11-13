// HU-03: recuperación de clave. Necesita PostgreSQL con las migraciones aplicadas.
// El envío de correo se simula con un mock: se lee el enlace que se habría enviado.
jest.mock('../../src/compartido/utilidades/correo', () => ({ sendMail: jest.fn() }));

const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const { sendMail } = require('../../src/compartido/utilidades/correo');
const authService = require('../../src/modulos/autenticacion/autenticacion.servicio');
const { User, RecoveryToken } = require('../../src/configuracion/modelos');
const { csrfFrom, uniqueEmail, cleanTestUsers, closeConnections } = require('../ayudas');

const OLD_PASSWORD = 'Clave1234';
const NEW_PASSWORD = 'NuevaClave99';
let user;

beforeAll(async () => {
  user = await User.create({
    name: 'Recupera Prueba',
    email: uniqueEmail(),
    passwordHash: await authService.hashPassword(OLD_PASSWORD),
    role: 'customer',
  });
});

beforeEach(() => sendMail.mockClear());

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

async function requestLink(email) {
  const agent = request.agent(app);
  const token = await csrfFrom(agent, '/recuperar');
  return agent.post('/recuperar').type('form').send({ email, _csrf: token });
}

// Pide el enlace y devuelve el token que viajó en el correo.
async function requestToken() {
  await requestLink(user.email);
  const text = sendMail.mock.calls[0][0].text;
  return text.match(/token=([a-f0-9]{64})/)[1];
}

async function submitNewPassword(token, password = NEW_PASSWORD) {
  const agent = request.agent(app);
  const csrf = await csrfFrom(agent, `/restablecer?token=${token}`).catch(() =>
    csrfFrom(agent, '/recuperar'),
  );
  return agent.post('/restablecer').type('form').send({ token, password, _csrf: csrf });
}

describe('HU-03 Recuperación de clave', () => {
  test('envía un enlace con token y guarda solo su hash, con caducidad de 30 minutos', async () => {
    const token = await requestToken();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe(user.email);

    const rows = await RecoveryToken.findAll({ where: { userId: user.id, usedAt: null } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(rows[0].tokenHash).not.toBe(token);

    const minutes = (rows[0].expiresAt - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(28);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  test('responde igual si el correo existe o no, y no envía correo si no existe', async () => {
    const exists = await requestLink(user.email);
    sendMail.mockClear();
    const unknown = await requestLink(uniqueEmail());

    expect(unknown.status).toBe(exists.status);
    expect(unknown.headers.location).toBe(exists.headers.location);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('con un token válido cambia la clave, y la clave nueva permite iniciar sesión', async () => {
    const token = await requestToken();
    const res = await submitNewPassword(token);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');

    expect(await authService.authenticate(user.email, NEW_PASSWORD)).not.toBeNull();
    expect(await authService.authenticate(user.email, OLD_PASSWORD)).toBeNull();
  });

  test('un token ya usado se rechaza', async () => {
    const token = await requestToken();
    await submitNewPassword(token, 'PrimeraClave1');

    const second = await submitNewPassword(token, 'SegundaClave2');
    expect(second.status).toBe(400);
    expect(second.text).toContain('Enlace no válido');
    expect(await authService.authenticate(user.email, 'SegundaClave2')).toBeNull();
    expect(await authService.authenticate(user.email, 'PrimeraClave1')).not.toBeNull();
  });

  test('un token vencido se rechaza', async () => {
    const token = await requestToken();
    await RecoveryToken.update(
      { expiresAt: new Date(Date.now() - 60 * 1000) },
      { where: { userId: user.id, usedAt: null } },
    );

    const page = await request(app).get(`/restablecer?token=${token}`);
    expect(page.status).toBe(400);

    const res = await submitNewPassword(token, 'ClaveTardia1');
    expect(res.status).toBe(400);
    expect(res.text).toContain('Enlace no válido');
    expect(await authService.authenticate(user.email, 'ClaveTardia1')).toBeNull();
  });

  test('un token inventado o con formato incorrecto se rechaza', async () => {
    for (const token of ['abc', 'a'.repeat(64), '']) {
      const res = await request(app).get(`/restablecer?token=${token}`);
      expect(res.status).toBe(400);
    }
  });

  test('la clave nueva debe cumplir las reglas del registro', async () => {
    const token = await requestToken();
    const res = await submitNewPassword(token, 'corta');
    expect(res.status).toBe(400);
    expect(res.text).toContain('is-invalid');

    // el token sigue sirviendo porque la clave no se cambió
    const ok = await submitNewPassword(token, 'ClaveValida1');
    expect(ok.status).toBe(302);
  });

  test('pedir un enlace nuevo invalida el anterior', async () => {
    const first = await requestToken();
    sendMail.mockClear();
    await requestLink(user.email);

    const res = await submitNewPassword(first, 'ClaveAntigua1');
    expect(res.status).toBe(400);
  });
});
