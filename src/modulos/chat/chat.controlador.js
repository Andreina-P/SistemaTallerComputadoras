// Controlador del chat: renderiza las pantallas. El historial y los mensajes viajan por Socket.IO
// (carpeta sockets/); aquí solo se arma la página.

// HU-14: pantalla de la sala general del personal.
function showGeneralRoom(req, res) {
  res.render('chat/general', { titulo: 'Sala general' });
}

module.exports = { showGeneralRoom };
