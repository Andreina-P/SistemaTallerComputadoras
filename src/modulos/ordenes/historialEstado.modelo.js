// Modelo de la tabla status_history: cada cambio de estado de una orden.
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../configuracion/baseDeDatos');
const { ORDER_STATUS } = require('../../compartido/constantes');

const statuses = Object.values(ORDER_STATUS);

class StatusHistory extends Model {}

StatusHistory.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    // Nulo en la primera fila de una orden (cuando se crea)
    previousStatus: { type: DataTypes.ENUM(...statuses), allowNull: true },
    newStatus: { type: DataTypes.ENUM(...statuses), allowNull: false },
    comment: { type: DataTypes.STRING(300), allowNull: true },
    // Falso para notas internas que el cliente no debe ver
    customerVisible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: 'StatusHistory',
    tableName: 'status_history',
    underscored: true,
    updatedAt: false, // esta tabla solo tiene created_at
  },
);

module.exports = StatusHistory;
