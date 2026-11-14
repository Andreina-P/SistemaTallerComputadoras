// Funciones de apoyo para las pruebas que usan la aplicación y la base de datos.
const crypto = require('crypto');
const sequelize = require('../src/configuracion/baseDeDatos');
const { sessionPool } = require('../src/configuracion/sesion');
const { User } = require('../src/configuracion/modelos');

// Los correos de prueba empiezan con "test-" para poder borrarlos al terminar.
function uniqueEmail() {
  return `test-${crypto.randomBytes(5).toString('hex')}@reparus.test`;
}

function randomDigits(length) {
  return Array.from({ length }, () => crypto.randomInt(0, 10)).join('');
}

// Extrae el token CSRF del HTML de un formulario.
function extractCsrf(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error('La página no tiene token CSRF');
  return match[1];
}

// Pide la página y devuelve el token CSRF (el agente conserva las cookies).
async function csrfFrom(agent, path) {
  const res = await agent.get(path);
  return extractCsrf(res.text);
}

function validCustomerData(overrides = {}) {
  return {
    name: 'Ana Pérez',
    email: uniqueEmail(),
    password: 'Clave1234',
    national_id: randomDigits(10),
    phone: randomDigits(10),
    ...overrides,
  };
}

// Crea un usuario de prueba con la clave indicada y, si es cliente, su perfil.
async function createTestUser({ role = 'customer', password = 'Clave1234', active = true } = {}) {
  const bcrypt = require('bcryptjs');
  const { Customer } = require('../src/configuracion/modelos');
  const user = await User.create({
    name: `Usuario ${role}`,
    email: uniqueEmail(),
    passwordHash: await bcrypt.hash(password, 4),
    role,
    active,
  });
  let customer = null;
  if (role === 'customer') {
    customer = await Customer.create({
      userId: user.id,
      nationalId: randomDigits(10),
      phone: randomDigits(10),
    });
  }
  return { user, customer, password };
}

// Inicia sesión y devuelve un agente de supertest con la cookie de sesión.
async function loginAgent(app, email, password = 'Clave1234') {
  const request = require('supertest');
  const agent = request.agent(app);
  const token = await csrfFrom(agent, '/login');
  await agent.post('/login').type('form').send({ email, password, _csrf: token });
  return agent;
}

async function cleanTestUsers() {
  // Las órdenes de los clientes de prueba, o con historial escrito por usuarios de prueba, se borran
  // primero (su historial y mensajes se borran en cascada) porque users y customers están protegidos.
  await sequelize.query(`
    DELETE FROM orders WHERE
      customer_id IN (SELECT c.id FROM customers c JOIN users u ON u.id = c.user_id
                      WHERE u.email LIKE 'test-%@reparus.test')
      OR id IN (SELECT h.order_id FROM status_history h JOIN users u ON u.id = h.user_id
                WHERE u.email LIKE 'test-%@reparus.test')`);
  await sequelize.query(
    "DELETE FROM messages WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-%@reparus.test')",
  );
  await sequelize.query("DELETE FROM users WHERE email LIKE 'test-%@reparus.test'");
}

async function closeConnections() {
  await sequelize.close();
  await sessionPool.end();
}

module.exports = {
  User,
  uniqueEmail,
  randomDigits,
  extractCsrf,
  csrfFrom,
  validCustomerData,
  createTestUser,
  loginAgent,
  cleanTestUsers,
  closeConnections,
};
