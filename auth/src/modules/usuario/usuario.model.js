// Una persona del portal. La llave de identidad es `email` (siempre en minusculas, igual que en las apps). `password_hash`
// es nulo si solo entra con Microsoft. Soft delete: activo=false, nunca se elimina fisicamente.
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Usuario = sequelize.define(
  'Usuario',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('email', String(value).trim().toLowerCase());
      },
    },
    nombre: { type: DataTypes.STRING(200), allowNull: false },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    es_admin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: true },
    debe_cambiar_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    microsoft_id: { type: DataTypes.STRING(255), allowNull: true, unique: true },
    microsoft_email: { type: DataTypes.STRING(255), allowNull: true },
    intentos_fallidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bloqueado_hasta: { type: DataTypes.DATE, allowNull: true },
    ultimo_login: { type: DataTypes.DATE, allowNull: true },
    // Ultimo uso (login, renovacion de sesion o entrada al portal); ver auth.service.js#marcarActividad.
    ultima_actividad: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'usuarios', underscored: true, createdAt: 'creado_en', updatedAt: 'actualizado_en' }
);

module.exports = Usuario;
