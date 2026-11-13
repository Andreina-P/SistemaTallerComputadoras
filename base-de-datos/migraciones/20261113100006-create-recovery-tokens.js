'use strict';

/** Tabla recovery_tokens: tokens de un solo uso para recuperar la clave. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('recovery_tokens', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      // Se guarda el hash del token, nunca el token
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex('recovery_tokens', ['user_id'], {
      name: 'recovery_tokens_user_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('recovery_tokens');
  },
};
