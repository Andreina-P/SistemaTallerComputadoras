// Registra todos los manejadores de Socket.IO. Lo llama servidor.js al arrancar.
const registerChat = require('./chat.socket');
const registerNotifications = require('./notificaciones.socket');

module.exports = function registerSockets(io) {
  registerChat(io);
  registerNotifications(io);
};
