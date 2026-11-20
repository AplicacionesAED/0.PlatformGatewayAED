// Quien hizo que y cuando: cambios de administracion e inicios de sesion (exitosos y fallidos). Solo se agrega, nunca se edita.
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Auditoria = sequelize.define(
  'Auditoria',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    actor_id: { type: DataTypes.INTEGER, allowNull: true },
    accion: { type: DataTypes.STRING(60), allowNull: false },
    entidad: { type: DataTypes.STRING(40), allowNull: true },
    entidad_id: { type: DataTypes.STRING(60), allowNull: true },
    detalle: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    ip: { type: DataTypes.STRING(64), allowNull: true },
  },
  { tableName: 'auditoria', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = Auditoria;
