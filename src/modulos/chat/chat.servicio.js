// Lógica de negocio del chat: sanear y validar el texto, guardar mensajes y cargar el historial.
// Para saber si un usuario puede entrar al chat de una orden, usa el servicio de órdenes
// (ordenes.servicio.js); no consultes las tablas de órdenes directamente.
const Message = require('./mensaje.modelo');
const usersService = require('../autenticacion/usuarios.servicio');

const MAX_LENGTH = 500;
const MAX_RAW_LENGTH = 2000; // tope antes de sanear, para no procesar textos enormes
const HISTORY_LIMIT = 50;

// Saneamiento contra XSS: quita caracteres de control, bloques <script>/<style> y etiquetas HTML,
// y deja los espacios en uno solo. El navegador además muestra los mensajes con textContent (nunca
// como HTML), y estas dos protecciones se suman.
function sanitizeMessage(raw) {
  if (typeof raw !== 'string') return '';

  // eslint-disable-next-line no-control-regex
  let text = raw
    .slice(0, MAX_RAW_LENGTH)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  let previous;
  do {
    previous = text;
    text = text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\/?[a-zA-Z!?][^>]*>/g, '');
  } while (text !== previous);

  return text.replace(/\s+/g, ' ').trim();
}

// Devuelve { ok: true, text } o { ok: false, error } con EMPTY o TOO_LONG.
function validateMessage(raw) {
  if (typeof raw === 'string' && raw.length > MAX_RAW_LENGTH)
    return { ok: false, error: 'TOO_LONG' };

  const text = sanitizeMessage(raw);
  if (text.length < 1) return { ok: false, error: 'EMPTY' };
  if (text.length > MAX_LENGTH) return { ok: false, error: 'TOO_LONG' };
  return { ok: true, text };
}

// Mensaje listo para enviar al navegador (sin datos sensibles del autor: solo id, nombre y rol).
function serialize(message, authors) {
  const author = authors.get(message.userId);
  return {
    id: message.id,
    orderId: message.orderId,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    user: { id: message.userId, name: author?.name ?? 'Usuario', role: author?.role ?? null },
  };
}

// Guarda el mensaje en la base de datos. orderId nulo = sala general del personal.
// Quien llama debe enviarlo a los demás SOLO después de que esta función termine.
async function saveMessage({ orderId = null, userId, text }) {
  const message = await Message.create({ orderId, userId, text });
  const authors = await usersService.findUsersByIds([userId]);
  return serialize(message, authors);
}

// Últimos mensajes de una orden (o de la sala general si orderId es nulo), del más antiguo al más nuevo.
async function loadHistory(orderId = null, limit = HISTORY_LIMIT) {
  const rows = await Message.findAll({
    where: { orderId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
  });
  const authors = await usersService.findUsersByIds(rows.map((row) => row.userId));
  return rows.reverse().map((row) => serialize(row, authors));
}

module.exports = { sanitizeMessage, validateMessage, saveMessage, loadHistory, MAX_LENGTH };
