// HU-06: rutas de clientes. Solo el administrador entra a estas pantallas.
//
//   GET       /clientes              Listado con búsqueda y paginación
//   GET/POST  /clientes/:id/editar   Editar teléfono y dirección
const express = require('express');
const controller = require('./clientes.controlador');
const { editCustomerRules } = require('./clientes.validaciones');
const { requireAuth, requireAdmin } = require('../../compartido/middlewares/sesion');

const router = express.Router();

router.get('/clientes', requireAuth, requireAdmin, controller.listCustomers);
router.get('/clientes/:id/editar', requireAuth, requireAdmin, controller.showEdit);
router.post(
  '/clientes/:id/editar',
  requireAuth,
  requireAdmin,
  editCustomerRules,
  controller.updateCustomer,
);

module.exports = router;
