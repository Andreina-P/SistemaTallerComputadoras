// Rutas del módulo de órdenes.
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
const { createOrderRules } = require('./ordenes.validaciones');
const { requireAuth, requireAdmin } = require('../../compartido/middlewares/sesion');

const router = express.Router();

// HU-07: solo el administrador registra órdenes (técnicos y clientes reciben 403).
router.get('/ordenes/nueva', requireAuth, requireAdmin, controller.showNewOrder);
router.post('/ordenes/nueva', requireAuth, requireAdmin, createOrderRules, controller.createOrder);
router.get('/ordenes/clientes/buscar', requireAuth, requireAdmin, controller.searchCustomer);

// HU-08 y HU-09: cada rol ve solo lo suyo (lo decide ordenes.servicio.js).
router.get('/ordenes', requireAuth, controller.listOrders);
router.get('/ordenes/:id', requireAuth, controller.showOrder);

module.exports = router;
