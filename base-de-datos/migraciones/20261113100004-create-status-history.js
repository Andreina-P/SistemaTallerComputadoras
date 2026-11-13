'use strict';

const STATUSES = ['received', 'diagnosing', 'repairing', 'ready', 'delivered', 'cancelled'];

/** Tabla status_history: cada cambio de estado de una orden. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('status_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      // Nulo en la primera fila de una orden
      previous_status: { type: Sequelize.ENUM(...STATUSES), allowNull: true },
      new_status: { type: Sequelize.ENUM(...STATUSES), allowNull: false },
      comment: { type: Sequelize.STRING(300), allowNull: true },
      // Falso = nota interna que el cliente no ve
      customer_visible: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('status_history', ['order_id', 'created_at'], {
      name: 'status_history_order_id_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('status_history');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_status_history_previous_status";',
    );
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_status_history_new_status";');
  },
};
