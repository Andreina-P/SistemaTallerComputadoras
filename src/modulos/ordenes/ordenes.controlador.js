// Controlador de órdenes y clientes: recibe la petición, llama al servicio y responde.
const orderService = require('./ordenes.servicio');
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

// HU-09: una orden ajena responde 404 igual que una que no existe.
async function showOrder(req, res, next) {
  const detail = await orderService.getOrderDetail(req.session.user, req.params.id);
  if (!detail) return next();

  return res.render('ordenes/detalle', {
    titulo: detail.order.orderNumber,
    ...detail,
    format,
  });
}

module.exports = { showNewOrder, searchCustomer, createOrder, listOrders, showOrder };
