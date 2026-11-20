'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Solo se guarda el hash del token de renovacion: el valor real vive unicamente en la cookie del navegador.
    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      usuario_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE' },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expira_en: { type: Sequelize.DATE, allowNull: false },
      revocado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      // Cuando se revoco: reusar un token revocado hace mucho es senal de robo; hace segundos es solo una carrera entre pestañas.
      revocado_en: { type: Sequelize.DATE, allowNull: true },
      user_agent: { type: Sequelize.STRING(300), allowNull: true },
      ip: { type: Sequelize.STRING(64), allowNull: true },
      creado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('refresh_tokens', ['usuario_id']);

    await queryInterface.createTable('auditoria', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      // Nulo cuando quien actua no esta identificado (p. ej. un login fallido con un correo inexistente).
      actor_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' }, onDelete: 'SET NULL' },
      accion: { type: Sequelize.STRING(60), allowNull: false },
      entidad: { type: Sequelize.STRING(40), allowNull: true },
      entidad_id: { type: Sequelize.STRING(60), allowNull: true },
      detalle: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      ip: { type: Sequelize.STRING(64), allowNull: true },
      creado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('auditoria', ['creado_en']);
    await queryInterface.addIndex('auditoria', ['actor_id']);
  },
};
