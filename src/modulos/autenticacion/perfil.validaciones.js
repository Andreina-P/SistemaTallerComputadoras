// HU-16: reglas del perfil. Nombre y teléfono son las mismas del registro (HU-01).
const { body } = require('express-validator');
const { nameRule, phoneRule } = require('./autenticacion.validaciones');

const profileRules = [
  nameRule,
  phoneRule,
  body('address')
    .trim()
    .isLength({ max: 150 })
    .withMessage('La dirección admite máximo 150 caracteres.'),
];

module.exports = { profileRules };
