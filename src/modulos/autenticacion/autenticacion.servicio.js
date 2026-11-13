// Lógica de negocio de autenticación: registro, verificación de credenciales,
// tokens de recuperación y creación de usuarios del personal.
// Otros módulos que necesiten datos de usuarios deben pedirlos a funciones de este archivo.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sequelize = require('../../configuracion/baseDeDatos');
// Excepción a la regla "un módulo no importa modelos de otro": el registro (HU-01) debe crear
// el usuario y su perfil de cliente en una sola transacción, por eso se pide Customer al registro central.
const { User, Customer, RecoveryToken } = require('../../configuracion/modelos');
const { appUrl } = require('../../configuracion/entorno');
const { sendMail } = require('../../compartido/utilidades/correo');
const { ROLES } = require('../../compartido/constantes');

const BCRYPT_ROUNDS = 10;
const RECOVERY_TOKEN_MINUTES = 30;

// Hash falso para comparar cuando el correo no existe (el tiempo de respuesta es parecido y no se revela si existe).
const DUMMY_HASH = bcrypt.hashSync('contraseña-que-no-existe-1', BCRYPT_ROUNDS);

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function emailExists(email) {
  return (await User.count({ where: { email } })) > 0;
}

async function nationalIdExists(nationalId) {
  return (await Customer.count({ where: { nationalId } })) > 0;
}

// HU-01: crea el usuario (siempre con rol cliente) y su perfil en una transacción.
// Si falla el perfil, se deshace todo y no queda un usuario huérfano.
async function registerCustomer({ name, email, password, nationalId, phone }) {
  const passwordHash = await hashPassword(password);

  return sequelize.transaction(async (transaction) => {
    const user = await User.create(
      { name, email, passwordHash, role: ROLES.CUSTOMER },
      { transaction },
    );
    await Customer.create({ userId: user.id, nationalId, phone }, { transaction });
    return user;
  });
}

// HU-02: devuelve los datos de sesión del usuario o null si las credenciales no son válidas.
// Un usuario inactivo recibe el mismo resultado que una clave incorrecta.
async function authenticate(email, password) {
  const user = await User.findOne({ where: { email } });
  const valid = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !valid || !user.active) return null;
  return toSessionUser(user);
}

function toSessionUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// HU-05: el administrador crea usuarios del personal (técnico o administrador).
async function createStaffUser({ name, email, password, role }) {
  if (![ROLES.TECHNICIAN, ROLES.ADMIN].includes(role)) {
    throw new Error('Rol de personal no válido');
  }
  const passwordHash = await hashPassword(password);
  return User.create({ name, email, passwordHash, role });
}

async function listStaff() {
  return User.findAll({
    where: { role: [ROLES.TECHNICIAN, ROLES.ADMIN] },
    attributes: ['id', 'name', 'email', 'role', 'active'],
    order: [['name', 'ASC']],
  });
}

// HU-03: solo se guarda el hash del token; el token real va únicamente en el enlace del correo.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Crea un token de un solo uso (válido 30 minutos) y envía el enlace por correo.
// No devuelve nada: la pantalla responde igual exista o no el correo.
async function requestPasswordReset(email) {
  const user = await User.findOne({ where: { email, active: true } });
  if (!user) return;

  // Los enlaces anteriores sin usar dejan de servir.
  await RecoveryToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null } });

  const token = crypto.randomBytes(32).toString('hex');
  await RecoveryToken.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RECOVERY_TOKEN_MINUTES * 60 * 1000),
  });

  await sendMail({
    to: user.email,
    subject: 'Recupera tu clave de Reparus Tec',
    text:
      `Hola ${user.name},\n\n` +
      `Para elegir una clave nueva entra a este enlace (vale ${RECOVERY_TOKEN_MINUTES} minutos y se usa una sola vez):\n` +
      `${appUrl}/restablecer?token=${token}\n\n` +
      'Si no lo pediste tú, ignora este mensaje.',
  });
}

// Busca un token que exista, no se haya usado y no haya vencido.
async function findValidRecoveryToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;

  const row = await RecoveryToken.findOne({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return null;
  return row;
}

// Cambia la clave si el token es válido. Devuelve false si el token está usado, vencido o no existe.
async function resetPassword(token, newPassword) {
  const row = await findValidRecoveryToken(token);
  if (!row) return false;

  const passwordHash = await hashPassword(newPassword);

  return sequelize.transaction(async (transaction) => {
    // Marcar como usado solo si sigue sin usar: dos envíos al mismo tiempo no pueden usar el token dos veces.
    const [updated] = await RecoveryToken.update(
      { usedAt: new Date() },
      { where: { id: row.id, usedAt: null }, transaction },
    );
    if (updated !== 1) return false;

    await User.update({ passwordHash }, { where: { id: row.userId }, transaction });
    return true;
  });
}

// Página a la que va cada rol después de iniciar sesión.
// Cliente: "Mis órdenes". Personal: listado de órdenes. (Las pantallas las hace el módulo de órdenes, HU-08.)
function homePathForRole() {
  return '/ordenes';
}

module.exports = {
  hashPassword,
  emailExists,
  nationalIdExists,
  registerCustomer,
  authenticate,
  requestPasswordReset,
  findValidRecoveryToken,
  resetPassword,
  RECOVERY_TOKEN_MINUTES,
  createStaffUser,
  listStaff,
  toSessionUser,
  homePathForRole,
};
