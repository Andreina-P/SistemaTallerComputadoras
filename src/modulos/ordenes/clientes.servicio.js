// HU-06: lógica de negocio de clientes (listado con búsqueda y edición de datos de contacto).
// Los clientes se crean solo al registrarse (HU-01); aquí no se crean ni se eliminan.
const { Op } = require('sequelize');
const Customer = require('./cliente.modelo');
const Order = require('./orden.modelo');
const usersService = require('../autenticacion/usuarios.servicio');
const { escapeLike } = require('../../compartido/utilidades/texto');

const PAGE_SIZE = 10;

// Listado paginado (10 por página con limit/offset). Busca por cédula (la columna tiene índice
// único) o por nombre. Devuelve también cuántas órdenes tiene cada cliente.
async function listCustomers({ page = 1, q } = {}) {
  const term = typeof q === 'string' ? q.trim().slice(0, 80) : '';
  const where = {};

  if (term) {
    const like = escapeLike(term);
    const userIds = await usersService.findUserIdsByName(like);
    where[Op.or] = [
      { nationalId: { [Op.iLike]: `%${like}%` } },
      ...(userIds.length ? [{ userId: userIds }] : []),
    ];
  }

  const total = await Customer.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), totalPages);

  const rows = await Customer.findAll({
    where,
    order: [['id', 'ASC']],
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  const users = await usersService.findUsersByIds(rows.map((customer) => customer.userId));
  const counts = rows.length
    ? await Order.count({ where: { customerId: rows.map((c) => c.id) }, group: ['customer_id'] })
    : [];
  const orderCounts = new Map(counts.map((row) => [row.customer_id, Number(row.count)]));

  const customers = rows.map((customer) => ({
    id: customer.id,
    name: users.get(customer.userId)?.name ?? '',
    email: users.get(customer.userId)?.email ?? '',
    nationalId: customer.nationalId,
    phone: customer.phone,
    address: customer.address,
    orderCount: orderCounts.get(customer.id) ?? 0,
  }));

  return { customers, page: currentPage, totalPages, total, pageSize: PAGE_SIZE };
}

// Un cliente con su nombre y correo, o null si no existe.
async function getCustomer(id) {
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId < 1) return null;

  const customer = await Customer.findByPk(customerId);
  if (!customer) return null;

  const user = (await usersService.findUsersByIds([customer.userId])).get(customer.userId);
  return {
    id: customer.id,
    name: user?.name ?? '',
    email: user?.email ?? '',
    nationalId: customer.nationalId,
    phone: customer.phone,
    address: customer.address,
  };
}

// Actualiza SOLO teléfono y dirección. La cédula, el nombre y el correo no se tocan aunque
// lleguen en la petición. Devuelve null si el cliente no existe.
async function updateContact(id, { phone, address }) {
  const customer = await Customer.findByPk(Number(id));
  if (!customer) return null;

  await customer.update({ phone, address: address || null });
  return customer;
}

module.exports = { PAGE_SIZE, listCustomers, getCustomer, updateContact };
