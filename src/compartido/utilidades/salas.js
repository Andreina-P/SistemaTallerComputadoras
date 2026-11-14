// Nombres de las salas de Socket.IO. Todos los módulos los piden aquí para escribirlos igual.
//
//   userRoom(15)   sala personal de un usuario: allí se envían sus avisos (cambio de estado, mensajes)
//   orderRoom(7)   chat de una orden (lo une el servidor tras verificar el acceso, HU-13)
//   GENERAL_ROOM   sala general del personal (HU-14)
const userRoom = (userId) => `user:${userId}`;
const orderRoom = (orderId) => `order:${orderId}`;
const GENERAL_ROOM = 'staff:general';

module.exports = { userRoom, orderRoom, GENERAL_ROOM };
