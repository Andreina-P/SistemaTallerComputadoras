// Rutas del módulo de órdenes (Integrante 2 y Integrante 4).
// Este Router ya está montado en src/app.js: solo agrega tus rutas aquí.
//
// Rutas previstas:
//   GET       /ordenes              HU-08  Listado con filtro, búsqueda y paginación
//   GET/POST  /ordenes/nueva        HU-07  Crear orden
//   GET       /ordenes/:id          HU-09  Detalle de una orden
//   GET/POST  /ordenes/:id/editar   HU-10  Editar y asignar técnico
//   POST      /ordenes/:id/eliminar HU-10  Eliminar con confirmación
//   POST      /ordenes/:id/estado   HU-11  Cambiar el estado
//   GET       /clientes             HU-06  Consultar y editar clientes
//   GET/POST  /perfil               HU-16  Perfil del cliente
const express = require('express');

const router = express.Router();

module.exports = router;
