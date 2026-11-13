'use strict';

/** Tabla customers: perfil del cliente, 1 a 1 con un usuario de rol customer. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      // unique crea también el índice de búsqueda por cédula
      national_id: { type: Sequelize.STRING(10), allowNull: false, unique: true },
      phone: { type: Sequelize.STRING(10), allowNull: false },
      address: { type: Sequelize.STRING(150), allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customers');
  },
};
