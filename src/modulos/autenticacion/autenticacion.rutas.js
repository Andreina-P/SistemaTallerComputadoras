// Rutas del módulo de autenticación (Integrante 1).
// Este Router ya está montado en src/app.js: solo agrega tus rutas aquí.
//
//   GET/POST /registro        HU-01  Registro de cliente
//   GET/POST /login           HU-02  Inicio de sesión
//   POST     /logout          HU-04  Cerrar sesión
//   GET/POST /recuperar       HU-03  Pedir enlace de recuperación de clave
//   GET/POST /restablecer     HU-03  Definir la clave nueva con el token
//   GET/POST /admin/usuarios  HU-05  Crear usuarios del personal
//   GET/POST /perfil          HU-16  Perfil del cliente (ver perfil.controlador.js)
const express = require('express');
const controller = require('./autenticacion.controlador');
const {
  registerRules,
  staffRules,
  recoverRules,
  resetRules,
  loginRules,
} = require('./autenticacion.validaciones');
const {
  requireAuth,
  requireGuest,
  requireAdmin,
  requireRole,
} = require('../../compartido/middlewares/sesion');
const { createLimiter } = require('../../compartido/middlewares/limitador');
const profileController = require('./perfil.controlador');
const { profileRules } = require('./perfil.validaciones');
const { ROLES } = require('../../compartido/constantes');
const { loginMaxAttempts } = require('../../configuracion/entorno');

const router = express.Router();

// Máximo de intentos fallidos de inicio de sesión por IP (los exitosos no cuentan).
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: loginMaxAttempts,
  skipSuccessfulRequests: true,
});

router.get('/registro', requireGuest, controller.showRegister);
router.post('/registro', requireGuest, registerRules, controller.register);

router.get('/login', requireGuest, controller.showLogin);
router.post('/login', requireGuest, loginLimiter, loginRules, controller.login);
router.post('/logout', controller.logout);

// Recuperación de clave: se pide un enlace por correo y con el token se define la clave nueva.
const recoverLimiter = createLimiter({ windowMs: 15 * 60 * 1000, limit: loginMaxAttempts });
router.get('/recuperar', requireGuest, controller.showRecover);
router.post('/recuperar', requireGuest, recoverLimiter, recoverRules, controller.recover);
router.get('/restablecer', requireGuest, controller.showReset);
router.post('/restablecer', requireGuest, resetRules, controller.reset);

// Solo el administrador crea usuarios del personal.
router.get('/admin/usuarios', requireAuth, requireAdmin, controller.showStaff);
router.post('/admin/usuarios', requireAuth, requireAdmin, staffRules, controller.createStaff);

// HU-16: el cliente ve y edita su propio perfil (no hay identificador en la ruta).
router.get('/perfil', requireAuth, requireRole(ROLES.CUSTOMER), profileController.showProfile);
router.post(
  '/perfil',
  requireAuth,
  requireRole(ROLES.CUSTOMER),
  profileRules,
  profileController.updateProfile,
);

module.exports = router;
