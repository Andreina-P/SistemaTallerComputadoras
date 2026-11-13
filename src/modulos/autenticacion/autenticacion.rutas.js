// Rutas del módulo de autenticación (Integrante 1).
// Este Router ya está montado en src/app.js: solo agrega tus rutas aquí.
//
// Rutas previstas:
//   GET/POST /registro        HU-01  Registro de cliente
//   GET/POST /login           HU-02  Inicio de sesión
//   POST     /logout          HU-04  Cerrar sesión
//   GET/POST /recuperar       HU-03  Pedir enlace de recuperación de clave
//   GET/POST /restablecer     HU-03  Definir la clave nueva con el token
//   GET/POST /admin/usuarios  HU-05  Crear usuarios del personal
const express = require('express');

const router = express.Router();

module.exports = router;
