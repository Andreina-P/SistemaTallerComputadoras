// Rutas HTTP del módulo de chat (Integrante 3).
// Este Router ya está montado en src/app.js: solo agrega tus rutas aquí.
// El tiempo real (Socket.IO) está en la carpeta sockets/.
//
// Rutas previstas:
//   GET /chat/general        HU-14  Sala general del personal
//   GET /ordenes/:id/chat    HU-13  Chat de una orden (o dentro del detalle de la orden)
const express = require('express');

const router = express.Router();

module.exports = router;
