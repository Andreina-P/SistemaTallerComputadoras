// Reglas de validación del servidor para órdenes (express-validator):
// longitudes, fecha no futura, costo mayor o igual a 0 y listas cerradas de tipo de equipo.
const { body, validationResult } = require('express-validator');
const { DEVICE_TYPES, ORDER_STATUS } = require('../../compartido/constantes');
const { todayIso } = require('../../compartido/utilidades/formato');
const orderService = require('./ordenes.servicio');
const usersService = require('../autenticacion/usuarios.servicio');

// Campos del equipo y de la recepción, comunes a crear (HU-07) y editar (HU-10).
const orderFieldRules = [
  body('device_type').isIn(DEVICE_TYPES).withMessage('Elige un tipo de equipo válido.'),
  body('brand')
    .trim()
    .isLength({ min: 2, max: 40 })
    .withMessage('La marca debe tener entre 2 y 40 caracteres.'),
  body('model')
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage('El modelo es obligatorio (máximo 60 caracteres).'),
  body('serial_number')
    .trim()
    .isLength({ max: 40 })
    .withMessage('El número de serie admite máximo 40 caracteres.'),
  body('reported_issue')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('El problema reportado debe tener entre 10 y 500 caracteres.'),
  body('received_at')
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('Ingresa una fecha de recepción válida.')
    .bail()
    .custom((value) => {
      if (value > todayIso()) throw new Error('La fecha de recepción no puede ser futura.');
      return true;
    }),
  body('estimated_cost')
    .trim()
    .default('0')
    .replace('', '0')
    .isFloat({ min: 0, max: 999999.99 })
    .withMessage('El costo estimado debe ser un número mayor o igual a 0.'),
];

// HU-07: además de los campos de la orden, la cédula de un cliente ya registrado.
const createOrderRules = [
  body('national_id')
    .trim()
    .matches(/^\d{10}$/)
    .withMessage('La cédula debe tener 10 dígitos.')
    .bail()
    .custom(async (nationalId) => {
      if (!(await orderService.findCustomerByNationalId(nationalId))) {
        throw new Error('No hay un cliente registrado con esa cédula.');
      }
      return true;
    }),
  ...orderFieldRules,
];

// HU-10: las mismas reglas de HU-07 más el técnico asignado, que es opcional pero debe tener rol técnico.
const editOrderRules = [
  ...orderFieldRules,
  body('technician_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Elige un técnico válido.')
    .bail()
    .custom(async (technicianId) => {
      if (!(await usersService.isActiveTechnician(Number(technicianId)))) {
        throw new Error('El técnico asignado debe tener rol técnico.');
      }
      return true;
    }),
];

// HU-11: estado nuevo, comentario (máximo 300 caracteres) y si el cliente puede verlo.
// Las reglas del flujo (transiciones, técnico, costo...) las aplica el servicio.
const changeStatusRules = [
  body('new_status').isIn(Object.values(ORDER_STATUS)).withMessage('Elige un estado válido.'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('El comentario admite máximo 300 caracteres.'),
  body('customer_visible').toBoolean(),
];

// Devuelve { errors: { campo: 'mensaje' }, values, hasErrors } para volver a mostrar el formulario.
function collectErrors(req) {
  const result = validationResult(req);
  const errors = {};
  result.array().forEach((error) => {
    if (!errors[error.path]) errors[error.path] = error.msg;
  });
  return { errors, values: req.body, hasErrors: !result.isEmpty() };
}

module.exports = {
  orderFieldRules,
  createOrderRules,
  editOrderRules,
  changeStatusRules,
  collectErrors,
};
