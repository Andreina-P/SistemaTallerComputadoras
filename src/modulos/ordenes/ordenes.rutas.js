// Rutas del módulo de órdenes (Integrante 2 y Integrante 4).
// Este Router ya está montado en src/app.js: solo agrega tus rutas aquí.
//
//   GET       /ordenes              HU-08  Listado con filtro, búsqueda y paginación
//   GET/POST  /ordenes/nueva        HU-07  Crear orden
//   GET       /ordenes/:id          HU-09  Detalle de una orden
//   GET/POST  /ordenes/:id/editar   HU-10  Editar y asignar técnico
//   DELETE    /ordenes/:id          HU-10  Eliminar con confirmación
//   POST      /ordenes/:id/estado   HU-11  Cambiar el estado
//   GET       /clientes             HU-06  Consultar y editar clientes
//   GET/POST  /perfil               HU-16  Perfil del cliente
const express = require('express');
const controller = require('./ordenes.controlador');
const { createOrderRules, editOrderRules, changeStatusRules } = require('./ordenes.validaciones');
const { requireAuth, requireAdmin, requireStaff } = require('../../compartido/middlewares/sesion');

const router = express.Router();

// Los formularios HTML solo envían GET y POST. Para eliminar se envía POST con el campo oculto
// _method=DELETE (más el token CSRF) y aquí se trata como DELETE.
router.use((req, res, next) => {
  if (req.method === 'POST' && req.body?._method === 'DELETE') req.method = 'DELETE';
  next();
});

// HU-07: solo el administrador registra órdenes (técnicos y clientes reciben 403).
router.get('/ordenes/nueva', requireAuth, requireAdmin, controller.showNewOrder);
router.post('/ordenes/nueva', requireAuth, requireAdmin, createOrderRules, controller.createOrder);
router.get('/ordenes/clientes/buscar', requireAuth, requireAdmin, controller.searchCustomer);

// HU-08 y HU-09: cada rol ve solo lo suyo (lo decide ordenes.servicio.js).
router.get('/ordenes', requireAuth, controller.listOrders);
router.get('/ordenes/:id', requireAuth, controller.showOrder);

// HU-11: administrador y técnico; el servicio exige además que el técnico tenga la orden asignada.
router.post(
  '/ordenes/:id/estado',
  requireAuth,
  requireStaff,
  changeStatusRules,
  controller.changeStatus,
);

// HU-10: solo el administrador edita, asigna técnico y elimina.
router.get('/ordenes/:id/editar', requireAuth, requireAdmin, controller.showEdit);
router.post(
  '/ordenes/:id/editar',
  requireAuth,
  requireAdmin,
  editOrderRules,
  controller.updateOrder,
);
router.delete('/ordenes/:id', requireAuth, requireAdmin, controller.deleteOrder);

module.exports = router;
