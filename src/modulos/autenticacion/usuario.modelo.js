// Modelo de la tabla users. Los atributos van en camelCase y las columnas en snake_case
// (underscored: true), por ejemplo passwordHash <-> password_hash.
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../configuracion/baseDeDatos');
const { ROLES } = require('../../compartido/constantes');
const RecoveryToken = require('./tokenRecuperacion.modelo');

class User extends Model {}

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
      validate: { len: [3, 80] },
    },
    email: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    role: {
      type: DataTypes.ENUM(...Object.values(ROLES)),
      allowNull: false,
      defaultValue: ROLES.CUSTOMER,
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    underscored: true,
    updatedAt: false, // esta tabla solo tiene created_at
  },
);

User.hasMany(RecoveryToken, { foreignKey: 'userId', as: 'recoveryTokens' });
RecoveryToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = User;
