const ApiError = require('../../utils/ApiError');
const { App } = require('../../models');
const auditoria = require('../auditoria/auditoria.service');

const listar = () => App.findAll({ order: [['nombre', 'ASC']] });

// Desactivar una app le quita el acceso a TODAS las personas (el acceso efectivo solo cuenta apps activas); las apps no se crean ni se borran aqui.
async function actualizar(id, { nombre, activa }, ctx) {
  const app = await App.findByPk(id);
  if (!app) throw new ApiError(404, 'La aplicación no existe');
  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (activa !== undefined) cambios.activa = activa;
  const detalle = { slug: app.slug, ...auditoria.cambiosConAntes(app, cambios) };
  await app.update(cambios);
  await auditoria.registrar({ ...ctx, accion: 'app.actualizar', entidad: 'app', entidadId: id, detalle });
  return app;
}

module.exports = { listar, actualizar };
