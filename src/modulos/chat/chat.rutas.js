// Rutas HTTP del módulo de chat (Integrante 3).
// Este Router ya está montado en src/app.js: solo agrega tus rutas aquí.
// El tiempo real (Socket.IO) está en la carpeta sockets/.
//
// Rutas previstas:
//   GET /chat/general        HU-14  Sala general del personal
//   (HU-13)                  El chat de una orden está dentro del detalle de la orden (ordenes/detalle.ejs)
const express = require('express');
const controller = require('./chat.controlador');
const { requireAuth, requireStaff } = require('../../compartido/middlewares/sesion');

const router = express.Router();

// HU-14: solo administradores y técnicos (los clientes reciben 403).
router.get('/chat/general', requireAuth, requireStaff, controller.showGeneralRoom);

module.exports = router;
