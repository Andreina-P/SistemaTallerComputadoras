// Registra todos los manejadores de Socket.IO. Lo llama configuracion/tiempoReal.js al arrancar.
//
// Base común (T-02 de la semana 3):
//   1. Autenticación en el handshake: sin sesión iniciada la conexión se rechaza.
//   2. Cada usuario entra automáticamente a su sala personal (user:<id>), donde recibe sus avisos.
//   3. El usuario conectado queda en socket.data.user ({ id, name, email, role }) para los demás manejadores.
const registerChat = require('./chat.socket');
const registerNotifications = require('./notificaciones.socket');
const { userRoom } = require('../../../compartido/utilidades/salas');

module.exports = function registerSockets(io) {
  io.use((socket, next) => {
    const user = socket.request.session?.user;
    if (!user) return next(new Error('No autenticado'));

    socket.data.user = user;
    return next();
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.data.user.id));
  });

  registerChat(io);
  registerNotifications(io);
};
