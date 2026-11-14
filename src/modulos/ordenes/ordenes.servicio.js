// Lógica de negocio de órdenes: crear, listar, filtrar, ver el detalle y (más adelante) cambiar estado.
//
// Función clave para el chat (HU-09 / HU-13): el módulo de chat NO consulta tablas de órdenes;
// le pregunta a este servicio si un usuario puede acceder a una orden, por ejemplo
//   canUserAccessOrder(user, orderId)  ->  true / false
const { Op } = require('sequelize');
const sequelize = require('../../configuracion/baseDeDatos');
const Order = require('./orden.modelo');
const Customer = require('./cliente.modelo');
const StatusHistory = require('./historialEstado.modelo');
const { ORDER_STATUS, ROLES } = require('../../compartido/constantes');
const usersService = require('../autenticacion/usuarios.servicio');

const MAX_NUMBER_RETRIES = 3;
const PAGE_SIZE = 10;

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

// Condición de acceso según el rol: el administrador ve todas, el técnico las que tiene asignadas
// y el cliente las suyas. La usan el listado, el detalle y el chat, para que la regla sea una sola.
// Devuelve null si el usuario no puede ver ninguna orden (por ejemplo, un cliente sin perfil).
async function accessFilter(user) {
  if (user.role === ROLES.ADMIN) return {};
  if (user.role === ROLES.TECHNICIAN) return { technicianId: user.id };
  if (user.role === ROLES.CUSTOMER) {
    const customer = await Customer.findOne({ where: { userId: user.id }, attributes: ['id'] });
    return customer ? { customerId: customer.id } : null;
  }
  return null;
}

// Escapa % y _ para que el texto buscado se tome literalmente en un LIKE.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// HU-08: listado paginado (10 por página) con filtro por estado y búsqueda por número de orden,
// nombre o cédula del cliente. Solo devuelve las órdenes que el rol puede ver.
async function listOrders(user, { page = 1, status, q } = {}) {
  const empty = { orders: [], page: 1, totalPages: 1, total: 0, pageSize: PAGE_SIZE };
  const access = await accessFilter(user);
  if (!access) return empty;

  const where = { ...access };
  if (Object.values(ORDER_STATUS).includes(status)) where.status = status;

  const term = typeof q === 'string' ? q.trim().slice(0, 80) : '';
  if (term) {
    const like = escapeLike(term);
    const userIds = await usersService.findUserIdsByName(like);
    const customers = await Customer.findAll({
      where: {
        [Op.or]: [
          { nationalId: { [Op.iLike]: `%${like}%` } },
          ...(userIds.length ? [{ userId: userIds }] : []),
        ],
      },
      attributes: ['id'],
    });
    const customerIds = customers.map((customer) => customer.id);

    where[Op.and] = [
      {
        [Op.or]: [
          { orderNumber: { [Op.iLike]: `%${like}%` } },
          ...(customerIds.length ? [{ customerId: customerIds }] : []),
        ],
      },
    ];
  }

  const total = await Order.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), totalPages);

  const rows = await Order.findAll({
    where,
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'userId', 'nationalId'] }],
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  const names = await usersService.findUsersByIds(
    rows.flatMap((order) => [order.customer.userId, order.technicianId]),
  );
  const orders = rows.map((order) => ({
    ...order.toJSON(),
    customerName: names.get(order.customer.userId)?.name ?? '',
    technicianName: names.get(order.technicianId)?.name ?? null,
  }));

  return { orders, page: currentPage, totalPages, total, pageSize: PAGE_SIZE };
}

// Función para el chat (HU-13): ¿este usuario puede ver esta orden?
async function canUserAccessOrder(user, orderId) {
  const id = Number(orderId);
  if (!user || !Number.isInteger(id) || id < 1) return false;

  const access = await accessFilter(user);
  if (!access) return false;
  return (await Order.count({ where: { ...access, id } })) > 0;
}

// HU-09: orden con su historial, o null si no existe o el usuario no tiene acceso.
// El cliente solo ve los comentarios marcados como visibles.
async function getOrderDetail(user, orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) return null;

  const access = await accessFilter(user);
  if (!access) return null;

  const order = await Order.findOne({
    where: { ...access, id },
    include: [{ model: Customer, as: 'customer' }],
  });
  if (!order) return null;

  const historyWhere = { orderId: order.id };
  if (user.role === ROLES.CUSTOMER) historyWhere.customerVisible = true;
  const history = await StatusHistory.findAll({
    where: historyWhere,
    order: [
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  const names = await usersService.findUsersByIds([
    order.customer.userId,
    order.technicianId,
    ...history.map((entry) => entry.userId),
  ]);

  return {
    order: order.toJSON(),
    customer: {
      name: names.get(order.customer.userId)?.name ?? '',
      email: names.get(order.customer.userId)?.email ?? '',
      nationalId: order.customer.nationalId,
      phone: order.customer.phone,
    },
    technicianName: names.get(order.technicianId)?.name ?? null,
    history: history.map((entry) => ({
      ...entry.toJSON(),
      authorName: names.get(entry.userId)?.name ?? '',
    })),
  };
}

module.exports = {
  findCustomerByNationalId,
  createOrder,
  listOrders,
  canUserAccessOrder,
  getOrderDetail,
  PAGE_SIZE,
};
