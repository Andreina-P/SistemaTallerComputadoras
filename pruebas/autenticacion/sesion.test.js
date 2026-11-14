// HU-04 y HU-05: rutas protegidas, cerrar sesión, roles y creación de personal.
const request = require('supertest');
const app = require('../../src/app');
const bcrypt = require('bcryptjs');
const authService = require('../../src/modulos/autenticacion/autenticacion.servicio');
const { requireRole } = require('../../src/compartido/middlewares/sesion');
const { User } = require('../../src/configuracion/modelos');
const { csrfFrom, uniqueEmail, cleanTestUsers, closeConnections } = require('../ayudas');

const PASSWORD = 'Clave1234';
const users = {};

async function loginAs(role) {
  const agent = request.agent(app);
  const token = await csrfFrom(agent, '/login');
  await agent
    .post('/login')
    .type('form')
    .send({ email: users[role].email, password: PASSWORD, _csrf: token });
  return agent;
}

beforeAll(async () => {
  const passwordHash = await authService.hashPassword(PASSWORD);
  for (const role of ['admin', 'technician', 'customer']) {
    users[role] = await User.create({
      name: `Usuario ${role}`,
      email: uniqueEmail(),
      passwordHash,
      role,
    });
  }
});

afterAll(async () => {
  await cleanTestUsers();
  await closeConnections();
});

describe('HU-04 Rutas protegidas y cierre de sesión', () => {
  test('sin sesión, una ruta protegida redirige al inicio de sesión', async () => {
    const res = await request(app).get('/admin/usuarios');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('después de iniciar sesión vuelve a la página que se pidió', async () => {
    const agent = request.agent(app);
    await agent.get('/admin/usuarios');
    const token = await csrfFrom(agent, '/login');
    const res = await agent
      .post('/login')
      .type('form')
      .send({ email: users.admin.email, password: PASSWORD, _csrf: token });
    expect(res.headers.location).toBe('/admin/usuarios');
  });

  test('un rol sin permiso recibe 403', async () => {
    for (const role of ['customer', 'technician']) {
      const agent = await loginAs(role);
      const res = await agent.get('/admin/usuarios');
      expect(res.status).toBe(403);
    }
  });

  test('requireRole es reutilizable: deja pasar al rol permitido y bloquea a los demás', () => {
    const middleware = requireRole('technician', 'admin');
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), render: jest.fn() };

    middleware({ session: { user: { role: 'technician' } } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware({ session: { user: { role: 'customer' } } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('el menú cambia según el rol', async () => {
    const adminPage = (await (await loginAs('admin')).get('/')).text;
    const customerPage = (await (await loginAs('customer')).get('/')).text;
    const anonymousPage = (await request(app).get('/')).text;

    expect(adminPage).toContain('/admin/usuarios');
    expect(adminPage).toContain('Cerrar sesión');
    expect(customerPage).toContain('Mis órdenes');
    expect(customerPage).not.toContain('/admin/usuarios');
    expect(anonymousPage).toContain('Iniciar sesión');
    expect(anonymousPage).not.toContain('Cerrar sesión');
  });

  test('cerrar sesión destruye la sesión del servidor y borra la cookie', async () => {
    const agent = await loginAs('customer');
    const token = await csrfFrom(agent, '/');
    const res = await agent.post('/logout').type('form').send({ _csrf: token });

    expect(res.status).toBe(302);
    expect(res.headers['set-cookie'].join(';')).toMatch(/reparus\.sid=;/);

    const after = await agent.get('/admin/usuarios');
    expect(after.headers.location).toBe('/login');
  });

  test('un usuario con sesión no ve el login ni el registro', async () => {
    const agent = await loginAs('customer');
    expect((await agent.get('/login')).status).toBe(302);
    expect((await agent.get('/registro')).status).toBe(302);
  });
});

describe('HU-05 Crear usuarios del personal', () => {
  async function postStaff(agent, data) {
    const token = await csrfFrom(agent, '/admin/usuarios');
    return agent
      .post('/admin/usuarios')
      .type('form')
      .send({ ...data, _csrf: token });
  }

  test('el administrador crea un técnico y un administrador', async () => {
    const agent = await loginAs('admin');

    for (const role of ['technician', 'admin']) {
      const email = uniqueEmail();
      const res = await postStaff(agent, {
        name: 'Personal Nuevo',
        email,
        password: PASSWORD,
        role,
      });
      expect(res.status).toBe(302);

      const created = await User.findOne({ where: { email } });
      expect(created.role).toBe(role);
      expect(await bcrypt.compare(PASSWORD, created.passwordHash)).toBe(true);
    }
  });

  test('no permite crear clientes ni roles inventados desde esta pantalla', async () => {
    const agent = await loginAs('admin');
    for (const role of ['customer', 'superadmin', '']) {
      const email = uniqueEmail();
      const res = await postStaff(agent, {
        name: 'Personal Nuevo',
        email,
        password: PASSWORD,
        role,
      });
      expect(res.status).toBe(400);
      expect(await User.count({ where: { email } })).toBe(0);
    }
  });

  test('aplica las validaciones del registro y el correo único', async () => {
    const agent = await loginAs('admin');

    const weak = await postStaff(agent, {
      name: 'X',
      email: uniqueEmail(),
      password: '123',
      role: 'technician',
    });
    expect(weak.status).toBe(400);

    const repeated = await postStaff(agent, {
      name: 'Personal Nuevo',
      email: users.technician.email,
      password: PASSWORD,
      role: 'technician',
    });
    expect(repeated.status).toBe(400);
    expect(repeated.text).toContain('Este correo ya está registrado.');
  });

  test('solo el administrador puede enviar el formulario (los demás reciben 403)', async () => {
    const agent = await loginAs('technician');
    const token = await csrfFrom(agent, '/');
    const email = uniqueEmail();
    const res = await agent
      .post('/admin/usuarios')
      .type('form')
      .send({ name: 'Personal Nuevo', email, password: PASSWORD, role: 'admin', _csrf: token });

    expect(res.status).toBe(403);
    expect(await User.count({ where: { email } })).toBe(0);
  });

  test('el formulario incluye token CSRF y sin él se rechaza', async () => {
    const agent = await loginAs('admin');
    const page = await agent.get('/admin/usuarios');
    expect(page.text).toContain('name="_csrf"');

    const res = await agent
      .post('/admin/usuarios')
      .type('form')
      .send({ name: 'Personal Nuevo', email: uniqueEmail(), password: PASSWORD, role: 'admin' });
    expect(res.status).toBe(403);
  });
});
