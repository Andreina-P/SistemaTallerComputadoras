// Rutas del módulo de autenticación (Integrante 1).
// Este Router ya está montado en src/app.js: solo agrega tus rutas aquí.
//
//   GET/POST /registro        HU-01  Registro de cliente
//   GET/POST /login           HU-02  Inicio de sesión
//   POST     /logout          HU-04  Cerrar sesión
//   GET/POST /recuperar       HU-03  Pedir enlace de recuperación de clave
//   GET/POST /restablecer     HU-03  Definir la clave nueva con el token
//   GET/POST /admin/usuarios  HU-05  Crear usuarios del personal
const express = require('express');
const controller = require('./autenticacion.controlador');
const { registerRules, loginRules } = require('./autenticacion.validaciones');
const { createLimiter } = require('../../compartido/middlewares/limitador');
const { loginMaxAttempts } = require('../../configuracion/entorno');

const router = express.Router();

// Máximo de intentos fallidos de inicio de sesión por IP (los exitosos no cuentan).
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: loginMaxAttempts,
  skipSuccessfulRequests: true,
});

router.get('/registro', controller.showRegister);
router.post('/registro', registerRules, controller.register);

router.get('/login', controller.showLogin);
router.post('/login', loginLimiter, loginRules, controller.login);

module.exports = router;
