// Modelo de la tabla messages: mensajes del chat.
// orderId nulo = sala general del personal; con valor = chat de esa orden.
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../configuracion/baseDeDatos');

class Message extends Model {}

Message.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    text: { type: DataTypes.STRING(500), allowNull: false, validate: { len: [1, 500] } },
  },
  {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    underscored: true,
    updatedAt: false, // esta tabla solo tiene created_at
  },
);

module.exports = Message;
