// Modelo de la tabla customers: perfil del cliente (1 a 1 con un usuario de rol customer).
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../configuracion/baseDeDatos');

class Customer extends Model {}

Customer.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    nationalId: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
      validate: { is: /^\d{10}$/ },
    },
    phone: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: { is: /^\d{10}$/ },
    },
    address: { type: DataTypes.STRING(150), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers',
    underscored: true,
    timestamps: false,
  },
);

module.exports = Customer;
