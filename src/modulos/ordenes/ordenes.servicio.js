// Lógica de negocio de órdenes: crear, listar, filtrar, cambiar estado (usando
// ALLOWED_TRANSITIONS de compartido/constantes.js) y registrar el historial.
//
// Función clave para el chat (HU-09 / HU-13): el módulo de chat NO consulta tablas de órdenes;
// le pregunta a este servicio si un usuario puede acceder a una orden, por ejemplo
//   canUserAccessOrder(user, orderId)  ->  true / false
module.exports = {};
