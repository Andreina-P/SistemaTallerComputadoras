// Eventos del chat (Integrante 3): HU-13 (chat por orden) y HU-14 (sala general).
//
// Eventos (nombres en inglés, formato entidad:acción). Los que envía el navegador llevan "ack":
// una función que recibe { ok: true, ... } o { ok: false, error: 'CÓDIGO' }.
//   order:join       { orderId }            Unirse al chat de una orden; devuelve historial y conectados
//   order:leave      { orderId }            Salir del chat de una orden
//   general:join     {}                     Unirse a la sala general (solo administradores y técnicos)
//   general:leave    {}                     Salir de la sala general
//   message:new      { scope, orderId?, text }  Enviar un mensaje; el servidor lo guarda y luego lo reenvía a la sala
//   presence:update  { scope, orderId?, users }  (servidor) Cambió quién está conectado en la sala
//
// Seguridad: la conexión ya viene autenticada con la sesión (sockets/index.js). El navegador nunca elige
// una sala: pide unirse y el servidor decide, consultando la base de datos, según el rol y la orden.
const orderService = require('../../ordenes/ordenes.servicio');
const { announceUnreadMessage } = require('./notificaciones.socket');
const chatService = require('../chat.servicio');
const { orderRoom, GENERAL_ROOM } = require('../../../compartido/utilidades/salas');
const { ROLES } = require('../../../compartido/constantes');

// La sala general es solo para el personal del taller (HU-14).
const canUseGeneralRoom = (user) => [ROLES.ADMIN, ROLES.TECHNICIAN].includes(user.role);

// Convierte el nombre de una sala en los datos del evento, o null si no es una sala de chat.
function describeRoom(room) {
  if (room === GENERAL_ROOM) return { scope: 'general' };
  const match = /^order:(\d+)$/.exec(room);
  return match ? { scope: 'order', orderId: Number(match[1]) } : null;
}

// Usuarios distintos conectados a una sala (una persona con dos pestañas cuenta una vez).
async function listPresence(io, room) {
  const sockets = await io.in(room).fetchSockets();
  const byId = new Map();
  sockets.forEach((socket) => {
    const { id, name, role } = socket.data.user;
    byId.set(id, { id, name, role });
  });
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

async function announcePresence(io, room) {
  const details = describeRoom(room);
  if (!details) return;
  io.to(room).emit('presence:update', { ...details, users: await listPresence(io, room) });
}

// Responde por el ack si existe; así un cliente que no lo envía no rompe el servidor.
const safeAck = (ack) => (typeof ack === 'function' ? ack : () => { });

function parseOrderId(payload) {
  const orderId = Number(payload?.orderId);
  return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
}

module.exports = function registerChat(io) {
  io.on('connection', (socket) => {
    const user = socket.data.user;

    // Maneja un evento con ack y convierte cualquier falla inesperada en SERVER_ERROR.
    const on = (event, handler) => {
      socket.on(event, async (payload, ack) => {
        const reply = safeAck(ack);
        try {
          await handler(payload, reply);
        } catch (error) {
          console.error(`Error en ${event}:`, error.message);
          reply({ ok: false, error: 'SERVER_ERROR' });
        }
      });
    };

    on('order:join', async (payload, reply) => {
      const orderId = parseOrderId(payload);
      if (!orderId) return reply({ ok: false, error: 'INVALID' });

      // El servidor verifica en la base de datos que el usuario puede ver esa orden.
      // Si no existe o es ajena, la respuesta es la misma (no se revela qué órdenes existen).
      const access = await orderService.getOrderChatAccess(user, orderId);
      if (!access) return reply({ ok: false, error: 'FORBIDDEN' });

      const room = orderRoom(orderId);
      await socket.join(room);

      const [history, users] = await Promise.all([
        chatService.loadHistory(orderId),
        listPresence(io, room),
      ]);
      reply({ ok: true, readOnly: access.readOnly, history, users });
      return announcePresence(io, room);
    });

    on('order:leave', async (payload, reply) => {
      const orderId = parseOrderId(payload);
      if (!orderId) return reply({ ok: false, error: 'INVALID' });

      const room = orderRoom(orderId);
      await socket.leave(room);
      reply({ ok: true });
      return announcePresence(io, room);
    });

    on('general:join', async (payload, reply) => {
      // Los clientes no entran: su conversación con el taller es el chat de cada orden.
      if (!canUseGeneralRoom(user)) return reply({ ok: false, error: 'FORBIDDEN' });

      await socket.join(GENERAL_ROOM);
      const [history, users] = await Promise.all([
        chatService.loadHistory(null),
        listPresence(io, GENERAL_ROOM),
      ]);
      reply({ ok: true, readOnly: false, history, users });
      return announcePresence(io, GENERAL_ROOM);
    });

    on('general:leave', async (payload, reply) => {
      await socket.leave(GENERAL_ROOM);
      reply({ ok: true });
      return announcePresence(io, GENERAL_ROOM);
    });

    on('message:new', async (payload, reply) => {
      let room;
      let orderId = null;

      if (payload?.scope === 'general') {
        room = GENERAL_ROOM;
        if (!socket.rooms.has(room)) return reply({ ok: false, error: 'NOT_JOINED' });
        if (!canUseGeneralRoom(user)) {
          await socket.leave(room);
          return reply({ ok: false, error: 'FORBIDDEN' });
        }
      } else if (payload?.scope === 'order') {
        orderId = parseOrderId(payload);
        if (!orderId) return reply({ ok: false, error: 'INVALID' });

        room = orderRoom(orderId);
        if (!socket.rooms.has(room)) return reply({ ok: false, error: 'NOT_JOINED' });

        // El acceso se vuelve a verificar en cada mensaje: la orden pudo reasignarse o cerrarse después de unirse.
        const access = await orderService.getOrderChatAccess(user, orderId);
        if (!access) {
          await socket.leave(room);
          return reply({ ok: false, error: 'FORBIDDEN' });
        }
        if (access.readOnly) return reply({ ok: false, error: 'READ_ONLY' });
      } else {
        return reply({ ok: false, error: 'INVALID' });
      }

      const checked = chatService.validateMessage(payload.text);
      if (!checked.ok) return reply({ ok: false, error: checked.error });

      // Primero se guarda; solo cuando ya está en la base de datos se reenvía a la sala.
      const message = await chatService.saveMessage({
        orderId,
        userId: user.id,
        text: checked.text,
      });
      io.to(room).emit('message:new', { scope: payload.scope, ...message });
      // HU-15: quienes no tienen abierto este chat reciben un indicador de mensaje nuevo.
      if (orderId) {
        await announceUnreadMessage(io, {
          orderId,
          author: user,
          createdAt: message.createdAt,
        });
      }
      return reply({ ok: true });
    });

    // Al desconectarse, el socket ya salió de sus salas; se avisa a los que quedan.
    socket.on('disconnecting', () => {
      socket.data.leavingRooms = [...socket.rooms].filter((room) => describeRoom(room));
    });
    socket.on('disconnect', () => {
      (socket.data.leavingRooms ?? []).forEach((room) => {
        announcePresence(io, room).catch((error) =>
          console.error('Error de presencia:', error.message),
        );
      });
    });
  });
};
