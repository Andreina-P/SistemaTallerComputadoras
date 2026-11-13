// Eventos del chat (Integrante 3): HU-13 y HU-14.
//
// Eventos previstos (nombres en inglés, formato entidad:acción):
//   order:join       Unirse al chat de una orden (el servidor verifica el acceso)
//   general:join     Unirse a la sala general del personal
//   message:new      Mensaje nuevo en una sala
//   presence:update  Cambio en los usuarios conectados
//
// Seguridad: autenticar en el handshake con la sesión y nunca confiar en la sala
// que pide el navegador; la decide el servidor según el rol y la propiedad de la orden.
module.exports = function registerChat(io) {
  // io.use(...) para autenticar el handshake
  // io.on('connection', (socket) => { ... });
  void io;
};
