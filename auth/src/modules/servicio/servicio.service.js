// API de servicio: una app (hoy RR.HH.) da de alta a su propia gente en el portal sin pasar por TI. Limites duros:
//  - solo concede o quita el acceso a SU app;
//  - solo cambia nombre, correo o contraseña de personas "gestionables": no administradoras y sin acceso a otra app (ni
//    directo ni por equipo). Asi RR.HH. no puede tomar la cuenta de alguien que tambien entra a Cartera, por ejemplo;
//  - nunca crea administradores.
// Todo queda en la auditoria con la app y quien lo pidio en ella (`solicitadoPor`).
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const { normalizarEmail } = require('../../utils/identidad');
const { Usuario, Acceso } = require('../../models');
const auditoria = require('../auditoria/auditoria.service');
const acceso = require('../acceso/acceso.service');
const usuarioService = require('../usuario/usuario.service');
const authService = require('../auth/auth.service');

// Apps que la persona tiene asignadas por cualquier camino (directo o equipo), esten o no activas.
async function appsAsignadas(usuarioId) {
  const filas = await sequelize.query(
    `SELECT DISTINCT a.slug
       FROM accesos x
       JOIN apps a ON a.id = x.app_id
      WHERE x.usuario_id = :usuarioId
         OR x.equipo_id IN (SELECT equipo_id FROM equipo_miembros WHERE usuario_id = :usuarioId)`,
    { replacements: { usuarioId }, type: QueryTypes.SELECT }
  );
  return filas.map((f) => f.slug);
}

async function gestionable(usuario, app) {
  if (usuario.es_admin) return false;
  const slugs = await appsAsignadas(usuario.id);
  return slugs.length > 0 && slugs.every((s) => s === app.slug);
}

const NO_GESTIONABLE = 'Esta persona es administradora del portal o también usa otras aplicaciones: sus datos de acceso los gestiona TI desde el portal';

const registro = (ctx, app, accion, detalle) => auditoria.registrar({ ...ctx, accion, entidad: 'servicio', entidadId: app.slug, detalle: { servicio: app.slug, solicitadoPor: ctx.solicitadoPor ?? null, ...detalle } });
const ctxBase = (ctx) => ({ actorId: null, ip: ctx.ip });

// Crea la persona si no existe (sin contraseña: la recibe con passwordTemporal) y le da acceso a la app. Si ya existe solo
// asegura el acceso y, si es gestionable, actualiza el nombre. No reactiva a alguien que TI desactivo en el portal.
async function registrar(app, { email, nombre }, ctx) {
  const correo = normalizarEmail(email);
  let usuario = await Usuario.findOne({ where: { email: correo } });
  const nuevo = !usuario;
  if (nuevo) {
    usuario = await Usuario.create({ email: correo, nombre });
    await auditoria.registrar({ ...ctxBase(ctx), accion: 'usuario.crear', entidad: 'usuario', entidadId: usuario.id, detalle: { email: correo, servicio: app.slug } });
  } else if (usuario.nombre !== nombre && (await gestionable(usuario, app))) {
    await usuario.update({ nombre });
  }
  await acceso.conceder({ appId: app.id, usuarioId: usuario.id }, ctxBase(ctx));
  await registro(ctx, app, 'servicio.registrar', { email: correo, nuevo });
  return { id: usuario.id, email: usuario.email, nombre: usuario.nombre, activo: usuario.activo, nuevo };
}

// Quita el acceso DIRECTO a la app (desactivar la cuenta en la app). Lo que llegue por un equipo lo maneja TI.
async function quitarAcceso(app, { email }, ctx) {
  const usuario = await Usuario.findOne({ where: { email: normalizarEmail(email) } });
  const directo = usuario ? await Acceso.findOne({ where: { app_id: app.id, usuario_id: usuario.id } }) : null;
  if (directo) await acceso.revocar(directo.id, ctxBase(ctx));
  await registro(ctx, app, 'servicio.quitar-acceso', { email: normalizarEmail(email), quitado: Boolean(directo) });
  return { quitado: Boolean(directo) };
}

// El correo cambio en la app. Si la cuenta vieja es solo de esta app y el correo nuevo esta libre, se renombra (conserva la
// contraseña). Si no, se da de alta el correo nuevo y se le quita la app al viejo.
async function cambiarCorreo(app, { anterior, nuevo, nombre }, ctx) {
  const viejoCorreo = normalizarEmail(anterior);
  const nuevoCorreo = normalizarEmail(nuevo);
  if (viejoCorreo === nuevoCorreo) return registrar(app, { email: nuevoCorreo, nombre }, ctx);

  const viejo = await Usuario.findOne({ where: { email: viejoCorreo } });
  const ocupado = await Usuario.findOne({ where: { email: nuevoCorreo } });
  if (viejo && !ocupado && (await gestionable(viejo, app))) {
    // Con otro correo, la cuenta de Microsoft vinculada ya no corresponde: se desvincula y se cierran sus sesiones.
    await viejo.update({ email: nuevoCorreo, nombre, microsoft_id: null, microsoft_email: null });
    await authService.revocarSesiones(viejo.id);
    await auditoria.registrar({ ...ctxBase(ctx), accion: 'usuario.actualizar', entidad: 'usuario', entidadId: viejo.id, detalle: { email: nuevoCorreo, anterior: viejoCorreo, servicio: app.slug } });
    await registro(ctx, app, 'servicio.cambiar-correo', { email: nuevoCorreo, anterior: viejoCorreo, renombrada: true });
    return { id: viejo.id, email: nuevoCorreo, nombre, activo: viejo.activo, nuevo: false };
  }
  const resultado = await registrar(app, { email: nuevoCorreo, nombre }, ctx);
  if (viejo) await quitarAcceso(app, { email: viejoCorreo }, ctx);
  await registro(ctx, app, 'servicio.cambiar-correo', { email: nuevoCorreo, anterior: viejoCorreo, renombrada: false });
  return resultado;
}

// Contraseña temporal (se muestra una vez en la app y obliga a cambiarla) para una persona gestionable con dominio no
// corporativo. Cierra sus sesiones abiertas.
async function passwordTemporal(app, { email }, ctx) {
  const usuario = await Usuario.findOne({ where: { email: normalizarEmail(email) } });
  if (!usuario) throw new ApiError(404, 'La persona no existe en el portal');
  if (!(await gestionable(usuario, app))) throw new ApiError(409, NO_GESTIONABLE);
  const { passwordTemporal: password } = await usuarioService.resetearPassword(usuario.id, ctxBase(ctx));
  await registro(ctx, app, 'servicio.password-temporal', { email: usuario.email });
  return { email: usuario.email, passwordTemporal: password };
}

module.exports = { registrar, quitarAcceso, cambiarCorreo, passwordTemporal, gestionable };
