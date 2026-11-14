// Controlador de órdenes y clientes: recibe la petición, llama al servicio y responde.
// No pongas aquí la lógica de negocio; va en ordenes.servicio.js.
const orderService = require('./ordenes.servicio');
const usersService = require('../autenticacion/usuarios.servicio');
const { collectErrors } = require('./ordenes.validaciones');
const format = require('../../compartido/utilidades/formato');

const { todayIso } = format;

function renderNewOrder(res, { status = 200, errors = {}, values = {} } = {}) {
  return res.status(status).render('ordenes/nueva', {
    titulo: 'Nueva orden',
    errors,
    values,
    today: todayIso(),
  });
}

// HU-07
function showNewOrder(req, res) {
  return renderNewOrder(res, { values: { received_at: todayIso(), estimated_cost: '0' } });
}

// HU-07: búsqueda del cliente por cédula (la usa el formulario para mostrar el nombre).
async function searchCustomer(req, res) {
  const nationalId = String(req.query.cedula ?? '').trim();
  const customer = /^\d{10}$/.test(nationalId)
    ? await orderService.findCustomerByNationalId(nationalId)
    : null;
  res.json(customer ? { found: true, name: customer.name } : { found: false });
}

// HU-07
async function createOrder(req, res) {
  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) return renderNewOrder(res, { status: 400, errors, values });

  const order = await orderService.createOrder(
    {
      nationalId: req.body.national_id,
      deviceType: req.body.device_type,
      brand: req.body.brand,
      model: req.body.model,
      serialNumber: req.body.serial_number,
      reportedIssue: req.body.reported_issue,
      receivedAt: req.body.received_at,
      estimatedCost: Number(req.body.estimated_cost),
    },
    req.session.user.id,
  );

  req.session.flash = { type: 'success', text: `Orden ${order.orderNumber} creada.` };
  return res.redirect(`/ordenes/${order.id}`);
}

// HU-08
async function listOrders(req, res) {
  const status = typeof req.query.estado === 'string' ? req.query.estado : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const result = await orderService.listOrders(req.session.user, {
    page: req.query.pagina,
    status,
    q,
  });

  return res.render('ordenes/listado', {
    titulo: req.session.user.role === 'customer' ? 'Mis órdenes' : 'Órdenes',
    ...result,
    filters: { status, q },
    format,
  });
}

// Muestra el detalle de una orden. Lo usan HU-09 y HU-11 (cuando un cambio de estado se rechaza,
// se vuelve a mostrar la misma pantalla con el motivo). Devuelve false si el usuario no puede verla.
async function renderDetail(req, res, { status = 200, mensajeError, values = {} } = {}) {
  const user = req.session.user;
  const detail = await orderService.getOrderDetail(user, req.params.id);
  if (!detail) return false;

  res.status(status).render('ordenes/detalle', {
    titulo: detail.order.orderNumber,
    ...detail,
    nextStatuses: orderService.nextStatusesFor(user, detail.order),
    values,
    mensajeError,
    format,
  });
  return true;
}

// HU-09: una orden ajena responde 404 igual que una que no existe.
async function showOrder(req, res, next) {
  if (!(await renderDetail(req, res))) return next();
  return undefined;
}

// HU-11: cambiar el estado. El servicio aplica el flujo y las reglas; aquí solo se traduce el
// resultado a una respuesta. Cuando haya avisos en tiempo real (HU-12) se emiten aquí abajo,
// después de que el servicio guardó el cambio.
const STATUS_ERROR_HTTP = {
  FORBIDDEN_STATUS: 403,
  INVALID_TRANSITION: 409,
  MISSING_REQUIREMENT: 400,
};

async function changeStatus(req, res, next) {
  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) {
    const message = Object.values(errors)[0];
    if (!(await renderDetail(req, res, { status: 400, mensajeError: message, values })))
      return next();
    return undefined;
  }

  try {
    const { order } = await orderService.changeOrderStatus(req.session.user, req.params.id, {
      newStatus: req.body.new_status,
      comment: req.body.comment,
      customerVisible: req.body.customer_visible,
    });
    req.session.flash = {
      type: 'success',
      text: `Estado actualizado a ${res.locals.statusLabels[order.status]}.`,
    };
    return res.redirect(`/ordenes/${order.id}`);
  } catch (error) {
    if (error.code === 'ORDER_NOT_FOUND') return next();
    const httpStatus = STATUS_ERROR_HTTP[error.code];
    if (!httpStatus) throw error;

    await renderDetail(req, res, { status: httpStatus, mensajeError: error.message, values });
    return undefined;
  }
}

function lockedResponse(res) {
  return res.status(409).render('error', {
    titulo: 'Orden bloqueada',
    status: 409,
    mensaje: 'Una orden Entregada o Cancelada no se puede editar.',
  });
}

async function renderEdit(res, { found, status = 200, errors = {}, values }) {
  const technicians = await usersService.listTechnicians();
  return res.status(status).render('ordenes/editar', {
    titulo: `Editar ${found.order.orderNumber}`,
    order: found.order.toJSON(),
    customerName: found.customerName,
    technicians,
    errors,
    values,
    today: todayIso(),
  });
}

// HU-10
async function showEdit(req, res, next) {
  const found = await orderService.findOrderForEdit(req.params.id);
  if (!found) return next();
  if (found.locked) return lockedResponse(res);

  const order = found.order;
  return renderEdit(res, {
    found,
    values: {
      device_type: order.deviceType,
      brand: order.brand,
      model: order.model,
      serial_number: order.serialNumber ?? '',
      reported_issue: order.reportedIssue,
      received_at: order.receivedAt,
      estimated_cost: Number(order.estimatedCost).toFixed(2),
      technician_id: order.technicianId ?? '',
    },
  });
}

// HU-10
async function updateOrder(req, res, next) {
  const found = await orderService.findOrderForEdit(req.params.id);
  if (!found) return next();
  if (found.locked) return lockedResponse(res);

  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) return renderEdit(res, { found, status: 400, errors, values });

  try {
    await orderService.updateOrder(req.params.id, {
      deviceType: req.body.device_type,
      brand: req.body.brand,
      model: req.body.model,
      serialNumber: req.body.serial_number,
      reportedIssue: req.body.reported_issue,
      receivedAt: req.body.received_at,
      estimatedCost: Number(req.body.estimated_cost),
      technicianId: req.body.technician_id ? Number(req.body.technician_id) : null,
    });
  } catch (error) {
    if (error.code === 'ORDER_LOCKED') return lockedResponse(res);
    throw error;
  }

  req.session.flash = { type: 'success', text: 'Orden actualizada.' };
  return res.redirect(`/ordenes/${req.params.id}`);
}

// HU-10: la confirmación se pide en pantalla (modal) antes de enviar la petición DELETE.
async function deleteOrder(req, res, next) {
  const deleted = await orderService.deleteOrder(req.params.id);
  if (!deleted) return next();

  req.session.flash = { type: 'success', text: 'Orden eliminada.' };
  return res.redirect('/ordenes');
}

module.exports = {
  showNewOrder,
  searchCustomer,
  createOrder,
  listOrders,
  showOrder,
  changeStatus,
  showEdit,
  updateOrder,
  deleteOrder,
};
