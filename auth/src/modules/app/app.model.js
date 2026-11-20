// Una aplicacion del portal. El `slug` (ruta detras del gateway) es lo que viaja en la sesion y cada app reconoce como suyo.
// El catalogo inicial se siembra en una migracion; aqui solo se edita nombre y si esta activa.
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const App = sequelize.define(
  'App',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    slug: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: 'apps', underscored: true, timestamps: false }
);

module.exports = App;
