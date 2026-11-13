// Reglas de validación del servidor (express-validator) para el módulo de autenticación.
// Las mismas reglas se aplican en el navegador con atributos HTML (ver vistas/autenticacion).
const { body, validationResult, matchedData } = require('express-validator');
const authService = require('./autenticacion.servicio');
const { ROLES } = require('../../compartido/constantes');

const LETTERS_AND_SPACES = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/;

const nameRule = body('name')
  .trim()
  .isLength({ min: 3, max: 80 })
  .withMessage('El nombre debe tener entre 3 y 80 caracteres.')
  .bail()
  .matches(LETTERS_AND_SPACES)
  .withMessage('El nombre solo puede tener letras y espacios.');

const emailRule = body('email')
  .trim()
  .toLowerCase()
  .isEmail()
  .withMessage('Ingresa un correo con formato válido.')
  .bail()
  .isLength({ max: 120 })
  .withMessage('El correo es demasiado largo.')
  .bail()
  .custom(async (email) => {
    if (await authService.emailExists(email)) {
      throw new Error('Este correo ya está registrado.');
    }
    return true;
  });

// Contraseña: mínimo 8 caracteres, con al menos una letra y un número.
// Se exporta como función porque la recuperación de clave usa otro nombre de campo.
const passwordRule = (field = 'password') =>
  body(field)
    .isLength({ min: 8, max: 72 })
    .withMessage('La contraseña debe tener mínimo 8 caracteres.')
    .bail()
    .matches(/[A-Za-z]/)
    .withMessage('La contraseña debe incluir al menos una letra.')
    .bail()
    .matches(/\d/)
    .withMessage('La contraseña debe incluir al menos un número.');

const nationalIdRule = body('national_id')
  .trim()
  .matches(/^\d{10}$/)
  .withMessage('La cédula debe tener 10 dígitos.')
  .bail()
  .custom(async (nationalId) => {
    if (await authService.nationalIdExists(nationalId)) {
      throw new Error('Esta cédula ya está registrada.');
    }
    return true;
  });

const phoneRule = body('phone')
  .trim()
  .matches(/^\d{10}$/)
  .withMessage('El teléfono debe tener 10 dígitos, solo números.');

const registerRules = [nameRule, emailRule, passwordRule(), nationalIdRule, phoneRule];

// HU-03: pedir el enlace (solo el formato del correo; no se revisa si existe) y elegir la clave nueva.
const recoverRules = [
  body('email').trim().toLowerCase().isEmail().withMessage('Ingresa un correo con formato válido.'),
];
const resetRules = [passwordRule()];

// HU-05: mismas reglas del registro (nombre, correo, clave) más el rol del personal.
const staffRules = [
  nameRule,
  emailRule,
  passwordRule(),
  body('role')
    .isIn([ROLES.TECHNICIAN, ROLES.ADMIN])
    .withMessage('Elige un rol: técnico o administrador.'),
];

const loginRules = [
  body('email').trim().toLowerCase().notEmpty().withMessage('Ingresa tu correo.'),
  body('password').notEmpty().withMessage('Ingresa tu contraseña.'),
];

// Devuelve { errors: { campo: 'mensaje' }, values } con los valores a mostrar de nuevo
// en el formulario (la contraseña nunca se devuelve).
function collectErrors(req) {
  const result = validationResult(req);
  const errors = {};
  result.array().forEach((error) => {
    if (!errors[error.path]) errors[error.path] = error.msg;
  });
  const { password, password_confirm: passwordConfirm, ...values } = req.body;
  void password;
  void passwordConfirm;
  return { errors, values, hasErrors: !result.isEmpty() };
}

module.exports = {
  nameRule,
  emailRule,
  passwordRule,
  nationalIdRule,
  phoneRule,
  registerRules,
  staffRules,
  recoverRules,
  resetRules,
  loginRules,
  collectErrors,
  matchedData,
};
