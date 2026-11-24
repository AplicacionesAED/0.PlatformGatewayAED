const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const { Auditoria, Usuario } = require('../../models');

// Inicio de un dia en hora de Colombia (UTC-5, sin horario de verano).
const inicioDia = (fecha) => new Date(`${fecha}T00:00:00-05:00`);

// Registrar nunca debe tumbar la operacion que se esta auditando: si falla, se deja constancia en el log y se sigue.
async function registrar({ actorId = null, accion, entidad = null, entidadId = null, detalle = {}, ip = null }) {
  try {
    await Auditoria.create({ actor_id: actorId, accion, entidad, entidad_id: entidadId == null ? null : String(entidadId), detalle, ip });
  } catch (err) {
    console.error('[auditoria] no se pudo registrar', accion, err.message); // eslint-disable-line no-console
  }
}

async function listar({ limit, offset, accion, actorId, usuarioId, desde, hasta }) {
  const where = {};
  if (accion) where.accion = accion;
  if (actorId) where.actor_id = actorId;
  if (usuarioId) {
    // usuarioId ya viene validado como entero positivo: se puede escribir en el literal sin riesgo de inyeccion.
    where[Op.or] = [
      { actor_id: usuarioId },
      { entidad: 'usuario', entidad_id: String(usuarioId) },
      sequelize.literal(`detalle->>'usuarioId' = '${usuarioId}'`),
      sequelize.literal(`detalle->'usuarioIds' @> '[${usuarioId}]'::jsonb`),
    ];
  }
  if (desde || hasta) {
    where.creado_en = {};
    if (desde) where.creado_en[Op.gte] = inicioDia(desde);
    if (hasta) where.creado_en[Op.lt] = new Date(inicioDia(hasta).getTime() + 24 * 60 * 60 * 1000);
  }
  const { rows, count } = await Auditoria.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset });
  // Quien actuo, para mostrarlo sin que la pantalla tenga que cruzar ids con la lista de personas.
  const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  const actores = new Map((ids.length ? await Usuario.findAll({ attributes: ['id', 'email', 'nombre'], where: { id: ids } }) : []).map((u) => [u.id, u]));
  return { rows: rows.map((r) => ({ ...r.toJSON(), actor: actores.has(r.actor_id) ? { email: actores.get(r.actor_id).email, nombre: actores.get(r.actor_id).nombre } : null })), total: count };
}

module.exports = { registrar, listar };
