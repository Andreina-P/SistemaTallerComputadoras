'use strict';

/** Tabla users: usuarios del sistema (administrador, técnico y cliente). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: Sequelize.STRING(80), allowNull: false },
      // unique crea también el índice que usa el inicio de sesión
      email: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      role: {
        type: Sequelize.ENUM('admin', 'technician', 'customer'),
        allowNull: false,
        defaultValue: 'customer',
      },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  },
};
