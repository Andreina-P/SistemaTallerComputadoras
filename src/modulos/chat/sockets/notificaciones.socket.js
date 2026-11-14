// Avisos en tiempo real (Integrante 4 con apoyo del Integrante 3): HU-12 y HU-15.
//
// Cada usuario se une a una sala personal (por ejemplo user:15) al conectarse, y los avisos
// se envían a esa sala para que solo los reciba quien corresponde.
//
// Eventos:
//   order:status-changed  Aviso de cambio de estado (cliente dueño, técnico asignado, admins). Lo emite
//                         el controlador de órdenes (HU-12).
//   message:unread        { orderId, orderNumber, from, at }  Mensaje nuevo en una orden que el usuario no
//                         tiene abierta (HU-15). Lo emite announceUnreadMessage, que llama el chat.
const orderNotices = require('../../ordenes/avisos.servicio');
const { emitToUsers } = require('../../../compartido/utilidades/avisos');
const { orderRoom } = require('../../../compartido/utilidades/salas');

// Avisa del mensaje (ya guardado) a los participantes de la orden, salvo a quien lo escribió y a
// quienes tienen el chat de esa orden abierto en este momento. Si falla, el mensaje ya está guardado:
// solo se registra el error.
async function announceUnreadMessage(io, { orderId, author, createdAt }) {
  try {
    const participants = await orderNotices.getOrderParticipants(orderId);
    if (!participants) return;

    const open = await io.in(orderRoom(orderId)).fetchSockets();
    const openUserIds = new Set(open.map((socket) => socket.data.user.id));
    const recipients = participants.userIds.filter((id) => !openUserIds.has(id));

    emitToUsers(
      io,
      recipients,
      'message:unread',
      {
        orderId: Number(orderId),
        orderNumber: participants.orderNumber,
        from: author.name,
        at: createdAt,
      },
      { exceptUserId: author.id },
    );
  } catch (error) {
    console.error('No se pudo enviar el aviso de mensaje nuevo:', error.message);
  }
}

module.exports = function registerNotifications(io) {
  void io;
};

module.exports.announceUnreadMessage = announceUnreadMessage;
