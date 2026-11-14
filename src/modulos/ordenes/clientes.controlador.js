// HU-06: controlador de clientes (solo administrador).
const customerService = require('./clientes.servicio');
const { collectErrors } = require('../autenticacion/autenticacion.validaciones');

// Listado con búsqueda por cédula o nombre y paginación.
async function listCustomers(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const result = await customerService.listCustomers({ page: req.query.pagina, q });

  return res.render('clientes/listado', {
    titulo: 'Clientes',
    ...result,
    filters: { q },
  });
}

function renderEdit(res, { status = 200, customer, errors = {}, values }) {
  return res.status(status).render('clientes/editar', {
    titulo: `Editar cliente ${customer.name}`,
    customer,
    errors,
    values: values ?? { phone: customer.phone, address: customer.address ?? '' },
  });
}

async function showEdit(req, res, next) {
  const customer = await customerService.getCustomer(req.params.id);
  if (!customer) return next();
  return renderEdit(res, { customer });
}

async function updateCustomer(req, res, next) {
  const customer = await customerService.getCustomer(req.params.id);
  if (!customer) return next();

  const { errors, values, hasErrors } = collectErrors(req);
  if (hasErrors) return renderEdit(res, { status: 400, customer, errors, values });

  await customerService.updateContact(customer.id, {
    phone: req.body.phone,
    address: req.body.address,
  });
  req.session.flash = { type: 'success', text: `Datos de ${customer.name} actualizados.` };
  return res.redirect('/clientes');
}

module.exports = { listCustomers, showEdit, updateCustomer };
