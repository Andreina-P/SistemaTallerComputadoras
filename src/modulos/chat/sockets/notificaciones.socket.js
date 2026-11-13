// Avisos en tiempo real (Integrante 4 con apoyo del Integrante 3): HU-12 y HU-15.
//
// Cada usuario se une a una sala personal (por ejemplo user:15) al conectarse, y los avisos
// se envían a esa sala para que solo los reciba quien corresponde.
//
// Eventos previstos:
//   order:status-changed  Aviso de cambio de estado (cliente dueño, técnico asignado, admins)
//   message:unread        Aviso de mensaje en una orden que el usuario no tiene abierta
module.exports = function registerNotifications(io) {
  void io;
};
