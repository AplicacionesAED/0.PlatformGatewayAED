// Sesion renovable. Solo se guarda el hash del token (el valor real vive unicamente en la cookie del navegador).
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const RefreshToken = sequelize.define(
  'RefreshToken',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expira_en: { type: DataTypes.DATE, allowNull: false },
    revocado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    revocado_en: { type: DataTypes.DATE, allowNull: true },
    user_agent: { type: DataTypes.STRING(300), allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    // Administrador que suplanta a la persona en esta sesion (nulo en una sesion normal).
    suplantado_por: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'refresh_tokens', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = RefreshToken;
