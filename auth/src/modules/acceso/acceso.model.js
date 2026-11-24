// Un acceso da una app a UNA persona o a UN equipo (la base lo exige con un CHECK). El acceso efectivo de una persona es la
// union de los suyos directos y los de sus equipos (ver acceso.service.js).
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Acceso = sequelize.define(
  'Acceso',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    app_id: { type: DataTypes.INTEGER, allowNull: false },
    usuario_id: { type: DataTypes.INTEGER, allowNull: true },
    equipo_id: { type: DataTypes.INTEGER, allowNull: true },
    // NULL = lo dio un administrador; slug de app = lo gestiona esa app por su API de servicio (ver migracion 20261124010000).
    gestionado_por: { type: DataTypes.STRING(40), allowNull: true },
  },
  { tableName: 'accesos', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = Acceso;
