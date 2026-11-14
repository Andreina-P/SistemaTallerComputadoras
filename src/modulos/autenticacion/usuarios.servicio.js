// Consulta de usuarios para OTROS módulos (solo lectura). Los demás módulos no importan el modelo
// User: piden aquí los nombres o los técnicos que necesitan, usando identificadores.
const { Op } = require('sequelize');
const User = require('./usuario.modelo');
const { ROLES } = require('../../compartido/constantes');

// Devuelve un Map id -> { id, name, email } para los identificadores indicados.
async function findUsersByIds(ids) {
  const unique = [...new Set(ids.filter((id) => id !== null && id !== undefined))];
  if (unique.length === 0) return new Map();

  const users = await User.findAll({
    where: { id: unique },
    attributes: ['id', 'name', 'email'],
  });
  return new Map(users.map((user) => [user.id, user.toJSON()]));
}

// Identificadores de los usuarios cuyo nombre contiene el texto (búsqueda sin distinguir mayúsculas).
// El texto debe venir con los caracteres % y _ ya escapados.
async function findUserIdsByName(escapedTerm, limit = 200) {
  const users = await User.findAll({
    where: { name: { [Op.iLike]: `%${escapedTerm}%` } },
    attributes: ['id'],
    limit,
  });
  return users.map((user) => user.id);
}

// Técnicos activos, para el selector de "asignar técnico".
async function listTechnicians() {
  return User.findAll({
    where: { role: ROLES.TECHNICIAN, active: true },
    attributes: ['id', 'name'],
    order: [['name', 'ASC']],
  });
}

async function isActiveTechnician(userId) {
  return (await User.count({ where: { id: userId, role: ROLES.TECHNICIAN, active: true } })) > 0;
}

module.exports = { findUsersByIds, findUserIdsByName, listTechnicians, isActiveTechnician };
