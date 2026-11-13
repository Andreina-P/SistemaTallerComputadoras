// Modelo de la tabla orders: la entidad principal del negocio.
// Define las asociaciones con los modelos del mismo módulo (customers y status_history).
// El técnico (technicianId) es un usuario de OTRO módulo: se guarda solo el identificador.
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../configuracion/baseDeDatos');
const { ORDER_STATUS, DEVICE_TYPES } = require('../../compartido/constantes');
const Customer = require('./cliente.modelo');
const StatusHistory = require('./historialEstado.modelo');

class Order extends Model {}

Order.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // Formato OR-2026-0001. Lo genera el servidor, nunca el formulario.
    orderNumber: { type: DataTypes.STRING(12), allowNull: false, unique: true },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    technicianId: { type: DataTypes.INTEGER, allowNull: true },
    deviceType: { type: DataTypes.ENUM(...DEVICE_TYPES), allowNull: false },
    brand: { type: DataTypes.STRING(40), allowNull: false, validate: { len: [2, 40] } },
    model: { type: DataTypes.STRING(60), allowNull: false, validate: { len: [1, 60] } },
    serialNumber: { type: DataTypes.STRING(40), allowNull: true },
    reportedIssue: {
      type: DataTypes.STRING(500),
      allowNull: false,
      validate: { len: [10, 500] },
    },
    receivedAt: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(ORDER_STATUS)),
      allowNull: false,
      defaultValue: ORDER_STATUS.RECEIVED,
    },
    // Sequelize devuelve los DECIMAL como texto; conviértelo con Number() al calcular.
    estimatedCost: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
  },
  {
    sequelize,
    modelName: 'Order',
    tableName: 'orders',
    underscored: true,
  },
);

Order.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Order.hasMany(StatusHistory, { foreignKey: 'orderId', as: 'history' });
StatusHistory.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

module.exports = Order;
