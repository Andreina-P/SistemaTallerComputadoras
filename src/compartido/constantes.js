// Valores fijos del sistema. En la base de datos se guardan los códigos en inglés
// y en pantalla se muestran los textos en español (mapas *_LABELS).

const ROLES = Object.freeze({
  ADMIN: 'admin',
  TECHNICIAN: 'technician',
  CUSTOMER: 'customer',
});

const ROLE_LABELS = Object.freeze({
  admin: 'Administrador',
  technician: 'Técnico',
  customer: 'Cliente',
});

const ORDER_STATUS = Object.freeze({
  RECEIVED: 'received',
  DIAGNOSING: 'diagnosing',
  REPAIRING: 'repairing',
  READY: 'ready',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

const STATUS_LABELS = Object.freeze({
  received: 'Recibido',
  diagnosing: 'En diagnóstico',
  repairing: 'En reparación',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
});

// Transiciones permitidas: una orden solo avanza hacia adelante y se puede
// cancelar en cualquier estado antes de Entregado.
const ALLOWED_TRANSITIONS = Object.freeze({
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['repairing', 'cancelled'],
  repairing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
});

const DEVICE_TYPES = Object.freeze(['laptop', 'desktop', 'all_in_one', 'other']);

const DEVICE_LABELS = Object.freeze({
  laptop: 'Laptop',
  desktop: 'Computador de escritorio',
  all_in_one: 'Todo en uno',
  other: 'Otro',
});

module.exports = {
  ROLES,
  ROLE_LABELS,
  ORDER_STATUS,
  STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  DEVICE_TYPES,
  DEVICE_LABELS,
};
