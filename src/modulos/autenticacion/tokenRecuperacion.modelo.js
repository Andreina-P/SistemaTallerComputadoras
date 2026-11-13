// Modelo de la tabla recovery_tokens: tokens de un solo uso para recuperar la clave.
// Se guarda el hash del token, nunca el token (HU-03).
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../configuracion/baseDeDatos');

class RecoveryToken extends Model {}

RecoveryToken.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'RecoveryToken',
    tableName: 'recovery_tokens',
    underscored: true,
    timestamps: false,
  },
);

module.exports = RecoveryToken;
