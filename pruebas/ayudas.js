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

async function cleanTestUsers() {
  // customers, recovery_tokens y órdenes dependen de users (CASCADE en customers y recovery_tokens)
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
  cleanTestUsers,
  closeConnections,
};
