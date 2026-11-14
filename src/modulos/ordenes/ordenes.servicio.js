// Lógica de negocio de órdenes: crear, listar, filtrar, ver el detalle y (más adelante) cambiar estado.
//
// Función clave para el chat (HU-09 / HU-13): el módulo de chat NO consulta tablas de órdenes;
// le pregunta a este servicio si un usuario puede acceder a una orden, por ejemplo
//   canUserAccessOrder(user, orderId)  ->  true / false
const sequelize = require('../../configuracion/baseDeDatos');
const Order = require('./orden.modelo');
const Customer = require('./cliente.modelo');
const StatusHistory = require('./historialEstado.modelo');
const { ORDER_STATUS } = require('../../compartido/constantes');
const usersService = require('../autenticacion/usuarios.servicio');

const MAX_NUMBER_RETRIES = 3;

async function findCustomerByNationalId(nationalId) {
  const customer = await Customer.findOne({ where: { nationalId } });
  if (!customer) return null;

  const users = await usersService.findUsersByIds([customer.userId]);
  const user = users.get(customer.userId);
  return { id: customer.id, nationalId: customer.nationalId, name: user?.name ?? '' };
}

// Siguiente número del año: OR-2026-0001, OR-2026-0002...
async function nextOrderNumber(transaction) {
  const year = new Date().getFullYear();
  const prefix = `OR-${year}-`;

  const last = await Order.findOne({
    where: sequelize.where(sequelize.col('order_number'), 'LIKE', `${prefix}%`),
    order: [['orderNumber', 'DESC']],
    attributes: ['orderNumber'],
    transaction,
  });

  const lastNumber = last ? Number(last.orderNumber.slice(prefix.length)) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`;
}

// HU-07: crea la orden en estado Recibido y su primera fila de historial en una sola transacción.
// Si dos personas crean una orden al mismo tiempo, el número repetido lo detecta la base de datos y se reintenta.
async function createOrder(data, createdByUserId) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sequelize.transaction(async (transaction) => {
        const customer = await Customer.findOne({
          where: { nationalId: data.nationalId },
          transaction,
        });
        if (!customer) throw new Error('Cliente no encontrado');

        const order = await Order.create(
          {
            orderNumber: await nextOrderNumber(transaction),
            customerId: customer.id,
            deviceType: data.deviceType,
            brand: data.brand,
            model: data.model,
            serialNumber: data.serialNumber || null,
            reportedIssue: data.reportedIssue,
            receivedAt: data.receivedAt,
            estimatedCost: data.estimatedCost,
            status: ORDER_STATUS.RECEIVED,
          },
          { transaction },
        );

        await StatusHistory.create(
          {
            orderId: order.id,
            previousStatus: null,
            newStatus: ORDER_STATUS.RECEIVED,
            comment: 'Orden creada.',
            customerVisible: true,
            userId: createdByUserId,
          },
          { transaction },
        );

        return order;
      });
    } catch (error) {
      const isRepeatedNumber =
        error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some((e) => e.path === 'order_number');
      if (!isRepeatedNumber || attempt >= MAX_NUMBER_RETRIES) throw error;
    }
  }
}

module.exports = { findCustomerByNationalId, createOrder };
