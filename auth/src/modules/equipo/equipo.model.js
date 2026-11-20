// Un equipo agrupa personas para darles acceso a apps de una vez. Solo existe en el portal (no se sincroniza con Microsoft Teams).
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Equipo = sequelize.define(
  'Equipo',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    descripcion: { type: DataTypes.STRING(500), allowNull: true },
  },
  { tableName: 'equipos', underscored: true, createdAt: 'creado_en', updatedAt: 'actualizado_en' }
);

const EquipoMiembro = sequelize.define(
  'EquipoMiembro',
  {
    equipo_id: { type: DataTypes.INTEGER, primaryKey: true },
    usuario_id: { type: DataTypes.INTEGER, primaryKey: true },
  },
  { tableName: 'equipo_miembros', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = { Equipo, EquipoMiembro };
