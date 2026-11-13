// Registra todos los modelos para que sus asociaciones queden definidas.
// Se importa una sola vez al arrancar el servidor.
// Regla: las asociaciones solo se definen entre modelos del MISMO módulo.
// Entre módulos se usan los identificadores (userId, orderId...) y funciones de servicio.
const User = require('../modulos/autenticacion/usuario.modelo');
const RecoveryToken = require('../modulos/autenticacion/tokenRecuperacion.modelo');
const Customer = require('../modulos/ordenes/cliente.modelo');
const Order = require('../modulos/ordenes/orden.modelo');
const StatusHistory = require('../modulos/ordenes/historialEstado.modelo');
const Message = require('../modulos/chat/mensaje.modelo');

module.exports = { User, RecoveryToken, Customer, Order, StatusHistory, Message };
