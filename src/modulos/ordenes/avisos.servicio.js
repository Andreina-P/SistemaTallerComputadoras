// HU-15: datos que necesita el aviso de mensaje nuevo. El chat no consulta las tablas de órdenes:
// se lo pregunta a este servicio.
const Order = require('./orden.modelo');
const { getOrderRecipientIds } = require('./ordenes.servicio');

// Número de la orden e identificadores de quienes participan en ella (cliente dueño, técnico asignado
// y administradores), o null si la orden no existe.
async function getOrderParticipants(orderId) {
  const order = await Order.findByPk(Number(orderId), {
    attributes: ['id', 'orderNumber', 'customerId', 'technicianId'],
  });
  if (!order) return null;
  return { orderNumber: order.orderNumber, userIds: await getOrderRecipientIds(order) };
}

module.exports = { getOrderParticipants };
