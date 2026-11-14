// Crea el servidor de tiempo real (Socket.IO) sobre el mismo servidor HTTP de la aplicación.
// Reutiliza la sesión de Express: el navegador envía la misma cookie al conectar, así que
// el servidor sabe quién es el usuario sin pedirle credenciales de nuevo.
const { Server } = require('socket.io');
const { sessionMiddleware } = require('./sesion');
const registerSockets = require('../modulos/chat/sockets');

function createSocketServer(httpServer, app) {
  const io = new Server(httpServer);

  // La sesión se lee en cada petición de conexión (handshake) con el mismo middleware de Express.
  io.engine.use(sessionMiddleware);

  // Los controladores pueden emitir avisos con req.app.get('io').
  if (app) app.set('io', io);

  registerSockets(io);
  return io;
}

module.exports = { createSocketServer };
