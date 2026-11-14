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
const { ORDER_STATUS, ROLES, ALLOWED_TRANSITIONS } = require('../../compartido/constantes');
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

const LOCKED_STATUSES = [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED];

// HU-10: una orden Entregada o Cancelada ya no se modifica.
function isLocked(order) {
  return LOCKED_STATUSES.includes(order.status);
}

// Orden por identificador para el formulario de edición (sin filtro de rol: solo la usa el administrador).
async function findOrderForEdit(orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) return null;

  const order = await Order.findByPk(id, {
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'userId', 'nationalId'] }],
  });
  if (!order) return null;

  const names = await usersService.findUsersByIds([order.customer.userId]);
  return {
    order,
    customerName: names.get(order.customer.userId)?.name ?? '',
    locked: isLocked(order),
  };
}

// HU-10: actualiza los datos de la orden y el técnico asignado (null = sin técnico).
// El estado no se cambia aquí (eso es HU-11). Devuelve null si no existe y lanza ORDER_LOCKED si no se puede editar.
async function updateOrder(orderId, data) {
  const order = await Order.findByPk(Number(orderId));
  if (!order) return null;

  if (isLocked(order)) {
    const error = new Error('Una orden Entregada o Cancelada no se puede editar.');
    error.code = 'ORDER_LOCKED';
    throw error;
  }

  await order.update({
    deviceType: data.deviceType,
    brand: data.brand,
    model: data.model,
    serialNumber: data.serialNumber || null,
    reportedIssue: data.reportedIssue,
    receivedAt: data.receivedAt,
    estimatedCost: data.estimatedCost,
    technicianId: data.technicianId ?? null,
  });
  return order;
}

// HU-10: elimina la orden; su historial y mensajes se borran en cascada. Devuelve false si no existía.
async function deleteOrder(orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) return false;
  return (await Order.destroy({ where: { id } })) > 0;
}

// HU-11: estados a los que puede pasar este usuario desde el estado actual de la orden.
// Lista vacía si no puede cambiarla: el cliente nunca, el técnico solo si la tiene asignada
// y solo el administrador puede pasar de Listo a Entregado.
function nextStatusesFor(user, order) {
  const isAdmin = user.role === ROLES.ADMIN;
  const isAssignedTechnician = user.role === ROLES.TECHNICIAN && order.technicianId === user.id;
  if (!isAdmin && !isAssignedTechnician) return [];

  return (ALLOWED_TRANSITIONS[order.status] ?? []).filter(
    (status) => status !== ORDER_STATUS.DELIVERED || isAdmin,
  );
}

function statusError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// HU-11: cambia el estado de una orden y guarda el cambio en el historial, todo en una transacción.
// La fila de la orden se bloquea durante el cambio para que dos cambios simultáneos no se pisen.
//
// Devuelve { order, previousStatus, historyEntry }. Con esos datos el controlador podrá avisar en
// tiempo real (HU-12) DESPUÉS de que la transacción terminó. Errores (error.code):
//   ORDER_NOT_FOUND     no existe o el usuario no puede verla (404)
//   FORBIDDEN_STATUS    el rol no puede hacer ese cambio (403)
//   INVALID_TRANSITION  el flujo no permite pasar de un estado al otro (409)
//   MISSING_REQUIREMENT falta técnico, costo estimado o comentario (400)
async function changeOrderStatus(user, orderId, { newStatus, comment, customerVisible }) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) throw statusError('ORDER_NOT_FOUND', 'Orden no encontrada.');

  const cleanComment = typeof comment === 'string' ? comment.trim() : '';

  return sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw statusError('ORDER_NOT_FOUND', 'Orden no encontrada.');

    // Un técnico no ve (ni cambia) las órdenes que no tiene asignadas.
    if (user.role === ROLES.TECHNICIAN && order.technicianId !== user.id) {
      throw statusError('ORDER_NOT_FOUND', 'Orden no encontrada.');
    }
    if (![ROLES.ADMIN, ROLES.TECHNICIAN].includes(user.role)) {
      throw statusError('FORBIDDEN_STATUS', 'No tienes permiso para cambiar el estado.');
    }

    const previousStatus = order.status;
    if (!(ALLOWED_TRANSITIONS[previousStatus] ?? []).includes(newStatus)) {
      throw statusError(
        'INVALID_TRANSITION',
        'Ese cambio de estado no está permitido en el flujo.',
      );
    }
    if (newStatus === ORDER_STATUS.DELIVERED && user.role !== ROLES.ADMIN) {
      throw statusError(
        'FORBIDDEN_STATUS',
        'Solo el administrador puede marcar una orden como Entregada.',
      );
    }

    if (newStatus === ORDER_STATUS.DIAGNOSING && !order.technicianId) {
      throw statusError(
        'MISSING_REQUIREMENT',
        'Asigna un técnico antes de pasar a En diagnóstico.',
      );
    }
    if (newStatus === ORDER_STATUS.REPAIRING && !(Number(order.estimatedCost) > 0)) {
      throw statusError(
        'MISSING_REQUIREMENT',
        'Registra el costo estimado antes de pasar a En reparación.',
      );
    }
    if ([ORDER_STATUS.READY, ORDER_STATUS.CANCELLED].includes(newStatus) && !cleanComment) {
      throw statusError(
        'MISSING_REQUIREMENT',
        'Escribe un comentario para marcar la orden como Listo o Cancelado.',
      );
    }

    await order.update({ status: newStatus }, { transaction });
    const historyEntry = await StatusHistory.create(
      {
        orderId: order.id,
        previousStatus,
        newStatus,
        comment: cleanComment || null,
        customerVisible: Boolean(customerVisible),
        userId: user.id,
      },
      { transaction },
    );

    return { order, previousStatus, historyEntry };
  });
}

module.exports = {
  changeOrderStatus,
  nextStatusesFor,
  findOrderForEdit,
  updateOrder,
  deleteOrder,
  isLocked,
  findCustomerByNationalId,
  createOrder,
  listOrders,
  canUserAccessOrder,
  getOrderDetail,
  PAGE_SIZE,
};
