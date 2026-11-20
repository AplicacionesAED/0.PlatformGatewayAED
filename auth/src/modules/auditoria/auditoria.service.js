const { Auditoria, Usuario } = require('../../models');

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
  // Quien actuo, para mostrarlo sin que la pantalla tenga que cruzar ids con la lista de personas.
  const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  const actores = new Map((ids.length ? await Usuario.findAll({ attributes: ['id', 'email', 'nombre'], where: { id: ids } }) : []).map((u) => [u.id, u]));
  return { rows: rows.map((r) => ({ ...r.toJSON(), actor: actores.has(r.actor_id) ? { email: actores.get(r.actor_id).email, nombre: actores.get(r.actor_id).nombre } : null })), total: count };
}

module.exports = { registrar, listar };
