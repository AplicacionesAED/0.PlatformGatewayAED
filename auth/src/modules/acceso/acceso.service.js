const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const { App, Acceso, Usuario, Equipo } = require('../../models');
const auditoria = require('../auditoria/auditoria.service');

// Acceso efectivo = apps dadas directamente a la persona + apps de cualquiera de sus equipos, siempre que la persona y la
// app esten activas. Quitar a alguien de un equipo le quita lo que ese equipo daba y conserva lo directo.
async function appsEfectivas(usuarioId) {
  return sequelize.query(
    `SELECT DISTINCT a.id, a.slug, a.nombre
       FROM apps a
       JOIN accesos x ON x.app_id = a.id
      WHERE a.activa = TRUE
        AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = :usuarioId AND u.activo = TRUE)
        AND (x.usuario_id = :usuarioId
             OR x.equipo_id IN (SELECT equipo_id FROM equipo_miembros WHERE usuario_id = :usuarioId))
      ORDER BY a.nombre`,
    { replacements: { usuarioId }, type: QueryTypes.SELECT }
  );
}

// Todo lo que necesita la pantalla de administracion para pintar la matriz; el cruce persona/equipo/app lo hace el frontend.
async function matriz() {
  const [apps, usuarios, equipos, accesos] = await Promise.all([
    App.findAll({ order: [['nombre', 'ASC']] }),
    Usuario.findAll({
      attributes: ['id', 'email', 'nombre', 'activo', 'es_admin'],
      include: [{ model: Equipo, as: 'equipos', attributes: ['id', 'nombre'], through: { attributes: [] } }],
      order: [['nombre', 'ASC']],
    }),
    Equipo.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] }),
    Acceso.findAll({ attributes: ['id', 'app_id', 'usuario_id', 'equipo_id'] }),
  ]);
  return { apps, usuarios, equipos, accesos };
}

// Idempotente: conceder dos veces lo mismo deja un solo acceso.
async function conceder({ appId, usuarioId, equipoId }, ctx) {
  const app = await App.findByPk(appId);
  if (!app) throw new ApiError(404, 'La aplicación no existe');
  if (usuarioId != null && !(await Usuario.findByPk(usuarioId))) throw new ApiError(404, 'La persona no existe');
  if (equipoId != null && !(await Equipo.findByPk(equipoId))) throw new ApiError(404, 'El equipo no existe');

  const [acceso, creado] = await Acceso.findOrCreate({
    where: { app_id: appId, usuario_id: usuarioId ?? null, equipo_id: equipoId ?? null },
  });
  if (creado) {
    await auditoria.registrar({ ...ctx, accion: 'acceso.conceder', entidad: 'acceso', entidadId: acceso.id, detalle: { app: app.slug, usuarioId, equipoId } });
  }
  return acceso;
}

async function revocar(id, ctx) {
  const acceso = await Acceso.findByPk(id, { include: [{ model: App, as: 'app' }] });
  if (!acceso) throw new ApiError(404, 'El acceso no existe');
  await acceso.destroy();
  await auditoria.registrar({
    ...ctx,
    accion: 'acceso.revocar',
    entidad: 'acceso',
    entidadId: id,
    detalle: { app: acceso.app.slug, usuarioId: acceso.usuario_id, equipoId: acceso.equipo_id },
  });
}

module.exports = { appsEfectivas, matriz, conceder, revocar };
