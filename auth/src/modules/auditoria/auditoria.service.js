const { Auditoria } = require('../../models');

// Registrar nunca debe tumbar la operacion que se esta auditando: si falla, se deja constancia en el log y se sigue.
async function registrar({ actorId = null, accion, entidad = null, entidadId = null, detalle = {}, ip = null }) {
  try {
    await Auditoria.create({ actor_id: actorId, accion, entidad, entidad_id: entidadId == null ? null : String(entidadId), detalle, ip });
  } catch (err) {
    console.error('[auditoria] no se pudo registrar', accion, err.message); // eslint-disable-line no-console
  }
}

async function listar({ limit, offset, accion, actorId }) {
  const where = {};
  if (accion) where.accion = accion;
  if (actorId) where.actor_id = actorId;
  const { rows, count } = await Auditoria.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset });
  return { rows, total: count };
}

module.exports = { registrar, listar };
