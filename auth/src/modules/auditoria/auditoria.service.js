const { Op, QueryTypes } = require('sequelize');
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

// Detalle de una modificacion: los valores nuevos de lo que de verdad cambio y, en `antes`, los que tenia. Se llama ANTES
// de guardar (con el registro todavia sin cambios). Lo que no cambio no se anota.
function cambiosConAntes(actual, cambios) {
  const detalle = {};
  const antes = {};
  for (const [campo, valor] of Object.entries(cambios)) {
    if (actual[campo] === valor) continue;
    detalle[campo] = valor;
    antes[campo] = actual[campo] ?? null;
  }
  return Object.keys(antes).length ? { ...detalle, antes } : detalle;
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
      // Sacada de un equipo: ya no esta en usuarioIds, pero si en quitados.
      sequelize.literal(`detalle->'quitados' @> '[${usuarioId}]'::jsonb`),
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

// Alertas de seguridad de los ultimos `dias`: posibles robos de sesion, cuentas bloqueadas e inicios fallidos, y los
// correos con varios fallos (posible adivinanza de contraseña). El panel las destaca para que no se pierdan en la lista.
const MIN_FALLIDOS = 3;
async function alertas({ dias }) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const contar = (accion) => Auditoria.count({ where: { accion, creado_en: { [Op.gte]: desde } } });
  const [sesionReuso, bloqueos, fallidos, repetidos] = await Promise.all([
    contar('sesion.reuso'),
    contar('login.bloqueado'),
    contar('login.fallido'),
    sequelize.query(
      `SELECT COALESCE(a.detalle->>'email', u.email) AS email, MAX(u.id) AS "usuarioId", COUNT(*)::int AS intentos, MAX(a.creado_en) AS ultimo
         FROM auditoria a LEFT JOIN usuarios u ON u.id = a.actor_id
        WHERE a.accion = 'login.fallido' AND a.creado_en >= $1
        GROUP BY 1 HAVING COUNT(*) >= $2
        ORDER BY intentos DESC, ultimo DESC LIMIT 10`,
      { bind: [desde, MIN_FALLIDOS], type: QueryTypes.SELECT }
    ),
  ]);
  return { dias, desde, sesionReuso, bloqueos, fallidos, repetidos };
}

module.exports = { registrar, listar, cambiosConAntes, alertas };
