// Conexión de tiempo real del navegador (Socket.IO). Solo se carga con la sesión iniciada.
// La conexión queda en window.reparusSocket para que los demás scripts escuchen sus eventos:
//
//   window.reparusSocket.on('order:status-changed', function (datos) { ... });
(function () {
  if (typeof io === 'undefined') return;

  var socket = io();
  window.reparusSocket = socket;

  socket.on('connect_error', function (error) {
    console.warn('Tiempo real no disponible:', error.message);
  });
})();
