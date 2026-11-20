// Unico lugar que carga TODOS los modelos y define sus asociaciones. Se requiere una sola vez desde app.js y desde las pruebas.
const Usuario = require('../modules/usuario/usuario.model');
const { Equipo, EquipoMiembro } = require('../modules/equipo/equipo.model');
const App = require('../modules/app/app.model');
const Acceso = require('../modules/acceso/acceso.model');
const RefreshToken = require('../modules/auth/refreshToken.model');
const Auditoria = require('../modules/auditoria/auditoria.model');

Usuario.belongsToMany(Equipo, { through: EquipoMiembro, foreignKey: 'usuario_id', otherKey: 'equipo_id', as: 'equipos' });
Equipo.belongsToMany(Usuario, { through: EquipoMiembro, foreignKey: 'equipo_id', otherKey: 'usuario_id', as: 'miembros' });

Acceso.belongsTo(App, { foreignKey: 'app_id', as: 'app' });
Acceso.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Acceso.belongsTo(Equipo, { foreignKey: 'equipo_id', as: 'equipo' });
RefreshToken.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

module.exports = { Usuario, Equipo, EquipoMiembro, App, Acceso, RefreshToken, Auditoria };
