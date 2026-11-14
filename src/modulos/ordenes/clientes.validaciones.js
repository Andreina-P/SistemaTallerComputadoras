// HU-06: reglas de validación para editar los datos de contacto de un cliente.
// El teléfono usa la misma regla del registro (HU-01); la dirección es opcional.
const { body } = require('express-validator');
const { phoneRule } = require('../autenticacion/autenticacion.validaciones');

const editCustomerRules = [
  phoneRule,
  body('address')
    .trim()
    .isLength({ max: 150 })
    .withMessage('La dirección admite máximo 150 caracteres.'),
];

module.exports = { editCustomerRules };
