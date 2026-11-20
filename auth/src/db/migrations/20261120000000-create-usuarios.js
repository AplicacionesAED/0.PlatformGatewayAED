'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('usuarios', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      // Siempre en minusculas: es la llave de identidad que comparten el portal y todas las apps.
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      nombre: { type: Sequelize.STRING(200), allowNull: false },
      activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      es_admin: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      // Nulo si la persona solo entra con Microsoft.
      password_hash: { type: Sequelize.STRING(255), allowNull: true },
      debe_cambiar_password: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      microsoft_id: { type: Sequelize.STRING(255), allowNull: true, unique: true },
      microsoft_email: { type: Sequelize.STRING(255), allowNull: true },
      intentos_fallidos: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      bloqueado_hasta: { type: Sequelize.DATE, allowNull: true },
      ultimo_login: { type: Sequelize.DATE, allowNull: true },
      creado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      actualizado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
};
