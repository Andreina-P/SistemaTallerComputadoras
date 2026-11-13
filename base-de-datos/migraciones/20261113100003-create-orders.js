'use strict';

/** Tabla orders: órdenes de reparación (entidad principal). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('orders', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      order_number: { type: Sequelize.STRING(12), allowNull: false, unique: true },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'RESTRICT',
      },
      technician_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      device_type: {
        type: Sequelize.ENUM('laptop', 'desktop', 'all_in_one', 'other'),
        allowNull: false,
      },
      brand: { type: Sequelize.STRING(40), allowNull: false },
      model: { type: Sequelize.STRING(60), allowNull: false },
      serial_number: { type: Sequelize.STRING(40), allowNull: true },
      reported_issue: { type: Sequelize.STRING(500), allowNull: false },
      received_at: { type: Sequelize.DATEONLY, allowNull: false },
      status: {
        type: Sequelize.ENUM(
          'received',
          'diagnosing',
          'repairing',
          'ready',
          'delivered',
          'cancelled',
        ),
        allowNull: false,
        defaultValue: 'received',
      },
      estimated_cost: { type: Sequelize.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addConstraint('orders', {
      fields: ['estimated_cost'],
      type: 'check',
      name: 'orders_estimated_cost_nonnegative',
      where: { estimated_cost: { [Sequelize.Op.gte]: 0 } },
    });

    // Índices de los campos de filtro y de listado por rol (HU-08)
    await queryInterface.addIndex('orders', ['status'], { name: 'orders_status_idx' });
    await queryInterface.addIndex('orders', ['customer_id'], { name: 'orders_customer_id_idx' });
    await queryInterface.addIndex('orders', ['technician_id'], {
      name: 'orders_technician_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('orders');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_device_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_status";');
  },
};
