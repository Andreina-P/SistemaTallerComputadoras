// Envío de avisos en tiempo real a usuarios concretos, usando sus salas personales (user:<id>).
// Se llama DESPUÉS de guardar en la base de datos, nunca antes: el aviso solo anuncia algo que ya ocurrió.
const { userRoom } = require('./salas');

// Envía el evento a las salas personales de los usuarios indicados.
// exceptUserId: usuario que no debe recibirlo (por ejemplo, quien hizo el cambio).
function emitToUsers(io, userIds, event, payload, { exceptUserId } = {}) {
  const rooms = [...new Set(userIds)]
    .filter((id) => id !== null && id !== undefined && id !== exceptUserId)
    .map(userRoom);
  if (rooms.length === 0) return;

  io.to(rooms).emit(event, payload);
}

module.exports = { emitToUsers };
