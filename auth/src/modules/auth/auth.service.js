const { Op } = require('sequelize');
const ApiError = require('../../utils/ApiError');
const security = require('../../utils/security');
const { validatePassword } = require('../../utils/passwordRules');
const { normalizarEmail, esDominioCorporativo, esAdminInicial } = require('../../utils/identidad');
const { Usuario, RefreshToken } = require('../../models');
const acceso = require('../acceso/acceso.service');
const auditoria = require('../auditoria/auditoria.service');

const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;
// Reusar un token de renovacion revocado hace menos que esto es una carrera entre dos pestañas, no un robo.
const GRACIA_REUSO_MS = 30 * 1000;
// Mismo mensaje para correo inexistente, cuenta inactiva, sin contrasena y contrasena mala: no se delata que cuentas existen.
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';
const SESION_NO_VALIDA = 'Sesión no válida';

// Lo que viaja en la sesion y lo que ve la persona: sus apps efectivas y sus equipos.
async function datosDeSesion(usuario) {
  const [apps, equipos] = await Promise.all([acceso.appsEfectivas(usuario.id), usuario.getEquipos({ attributes: ['nombre'], joinTableAttributes: [] })]);
  return { apps, equipos: equipos.map((e) => e.nombre) };
}

// `suplantador` ({ id, nombre }) solo en una sesion de suplantacion: la pantalla muestra la franja para regresar. Ahi el
// cambio de contraseña no se exige (no es de quien suplanta) ni se ofrece.
const perfilDe = (usuario, { apps, equipos }, suplantador = null) => ({
  id: usuario.id,
  email: usuario.email,
  nombre: usuario.nombre,
  esAdmin: usuario.es_admin,
  debeCambiarPassword: !suplantador && usuario.debe_cambiar_password,
  tienePassword: !suplantador && Boolean(usuario.password_hash),
  apps: apps.map((a) => ({ slug: a.slug, nombre: a.nombre })),
  equipos,
  suplantadoPor: suplantador ? { id: suplantador.id, nombre: suplantador.nombre } : null,
});

async function perfil(usuario, suplantador = null) {
  return perfilDe(usuario, await datosDeSesion(usuario), suplantador);
}

// `suplantador` y `hasta` solo para suplantacion: la sesion queda a nombre de la persona, marcada con quien la suplanta, y
// vence en `hasta` aunque se renueve.
async function crearSesion(usuario, ctx, { suplantador = null, hasta = null } = {}) {
  const datos = await datosDeSesion(usuario);
  const accessToken = security.createAccessToken(usuario, { apps: datos.apps.map((a) => a.slug), equipos: datos.equipos }, suplantador, hasta);
  const refreshToken = security.generateRefreshToken();
  await RefreshToken.create({
    usuario_id: usuario.id,
    token_hash: security.hashRefreshToken(refreshToken),
    expira_en: hasta ?? new Date(Date.now() + security.REFRESH_TOKEN_DAYS * 24 * 3600 * 1000),
    user_agent: (ctx.userAgent ?? '').slice(0, 300) || null,
    ip: ctx.ip ?? null,
    suplantado_por: suplantador?.id ?? null,
  });
  return { tokens: { accessToken, refreshToken }, perfil: perfilDe(usuario, datos, suplantador) };
}

// Quien suplanta debe seguir activo y siendo administrador; si no, la sesion suplantada deja de valer.
async function suplantadorVigente(id) {
  const admin = id ? await Usuario.findByPk(id) : null;
  return admin?.activo && admin.es_admin ? admin : null;
}

// Ultima actividad: se marca al entrar, al renovar la sesion (cada app la renueva mientras se usa) y al abrir el portal.
// Lo que hace un administrador suplantando no cuenta como actividad de la persona. Fuera del login se escribe a lo sumo
// cada ACTIVIDAD_CADA_MS para no tocar la base en cada /me.
const ACTIVIDAD_CADA_MS = 5 * 60 * 1000;
async function marcarActividad(usuario, { suplantado = false, forzar = false } = {}) {
  if (suplantado) return;
  const ahora = new Date();
  if (!forzar && usuario.ultima_actividad && ahora - usuario.ultima_actividad < ACTIVIDAD_CADA_MS) return;
  await usuario.update({ ultima_actividad: ahora });
}

const revocarSesiones = (usuarioId) =>
  RefreshToken.update({ revocado: true, revocado_en: new Date() }, { where: { usuario_id: usuarioId, revocado: false } });

async function login({ email, password }, ctx) {
  const correo = normalizarEmail(email);
  const usuario = await Usuario.findOne({ where: { email: correo } });

  if (usuario?.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
    await auditoria.registrar({ ...ctx, actorId: usuario.id, accion: 'login.bloqueado', entidad: 'usuario', entidadId: usuario.id, detalle: { metodo: 'password' } });
    throw new ApiError(429, 'Demasiados intentos. Intenta de nuevo en unos minutos.');
  }

  // Las cuentas de dominio corporativo entran solo con Microsoft: su contrasena (si existiera) no sirve.
  const puede = Boolean(usuario?.activo && usuario.password_hash && !esDominioCorporativo(correo));
  const correcta = await security.verifyPassword(password, puede ? usuario.password_hash : security.DUMMY_HASH);

  if (!puede || !correcta) {
    if (puede) {
      const intentos = usuario.intentos_fallidos + 1;
      const bloquear = intentos >= MAX_INTENTOS;
      await usuario.update({ intentos_fallidos: bloquear ? 0 : intentos, bloqueado_hasta: bloquear ? new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000) : null });
    }
    await auditoria.registrar({ ...ctx, actorId: usuario?.id ?? null, accion: 'login.fallido', entidad: 'usuario', entidadId: usuario?.id ?? null, detalle: { metodo: 'password', email: correo } });
    throw new ApiError(401, CREDENCIALES_INVALIDAS);
  }

  const ahora = new Date();
  await usuario.update({ intentos_fallidos: 0, bloqueado_hasta: null, ultimo_login: ahora, ultima_actividad: ahora });
  await auditoria.registrar({ ...ctx, actorId: usuario.id, accion: 'login.ok', entidad: 'usuario', entidadId: usuario.id, detalle: { metodo: 'password' } });
  return crearSesion(usuario, ctx);
}

// Login con Microsoft. Solo entra quien ya existe en el portal (o es administrador inicial); el primer ingreso vincula la
// cuenta de Microsoft por el correo. Los errores llevan el codigo que el frontend muestra (OAuthAccount*).
async function loginMicrosoft({ microsoftId, email, nombre }, ctx) {
  const correo = normalizarEmail(email);
  let usuario = await Usuario.findOne({ where: { microsoft_id: microsoftId } });

  if (!usuario && correo) {
    const porCorreo = await Usuario.findOne({ where: { [Op.or]: [{ email: correo }, { microsoft_email: correo }] } });
    // Si esa persona ya esta vinculada a OTRA cuenta de Microsoft, un correo igual no basta para quedarse con su cuenta.
    if (porCorreo && !porCorreo.microsoft_id) {
      await porCorreo.update({ microsoft_id: microsoftId, microsoft_email: correo });
      usuario = porCorreo;
    }
  }
  if (!usuario && correo && esAdminInicial(correo)) {
    usuario = await Usuario.create({ email: correo, nombre: nombre || correo, es_admin: true, microsoft_id: microsoftId, microsoft_email: correo });
  }

  if (!usuario) {
    await auditoria.registrar({ ...ctx, accion: 'login.fallido', detalle: { metodo: 'microsoft', email: correo } });
    throw new ApiError(404, 'OAuthAccountNotFound');
  }
  if (!usuario.activo) {
    await auditoria.registrar({ ...ctx, actorId: usuario.id, accion: 'login.fallido', entidad: 'usuario', entidadId: usuario.id, detalle: { metodo: 'microsoft', motivo: 'inactivo' } });
    throw new ApiError(403, 'OAuthAccountInactive');
  }

  if (esAdminInicial(usuario.email) && !usuario.es_admin) await usuario.update({ es_admin: true });
  const ahora = new Date();
  await usuario.update({ ultimo_login: ahora, ultima_actividad: ahora });
  await auditoria.registrar({ ...ctx, actorId: usuario.id, accion: 'login.ok', entidad: 'usuario', entidadId: usuario.id, detalle: { metodo: 'microsoft' } });
  return crearSesion(usuario, ctx);
}

// Renueva la sesion: rota el token (el viejo queda revocado) y vuelve a comprobar que la persona siga activa. Un token ya
// revocado que reaparece pasado el periodo de gracia se toma como robo y cierra TODAS las sesiones de esa persona.
async function refrescar(token, ctx) {
  if (!token) throw new ApiError(401, SESION_NO_VALIDA);
  const fila = await RefreshToken.findOne({ where: { token_hash: security.hashRefreshToken(token) } });
  if (!fila) throw new ApiError(401, SESION_NO_VALIDA);

  if (fila.revocado) {
    const reciente = fila.revocado_en && Date.now() - fila.revocado_en.getTime() < GRACIA_REUSO_MS;
    if (!reciente) {
      await revocarSesiones(fila.usuario_id);
      await auditoria.registrar({ ...ctx, actorId: fila.usuario_id, accion: 'sesion.reuso', entidad: 'usuario', entidadId: fila.usuario_id });
    }
    throw new ApiError(401, SESION_NO_VALIDA);
  }
  if (fila.expira_en < new Date()) throw new ApiError(401, SESION_NO_VALIDA);

  const usuario = await Usuario.findByPk(fila.usuario_id);
  if (!usuario?.activo) {
    await revocarSesiones(fila.usuario_id);
    throw new ApiError(401, SESION_NO_VALIDA);
  }

  // Suplantacion: sigue marcada, conserva su vencimiento original y cae si quien suplanta ya no es administrador activo.
  let suplantacion = {};
  if (fila.suplantado_por) {
    const admin = await suplantadorVigente(fila.suplantado_por);
    if (!admin || usuario.es_admin) {
      await fila.update({ revocado: true, revocado_en: new Date() });
      throw new ApiError(401, SESION_NO_VALIDA);
    }
    suplantacion = { suplantador: admin, hasta: fila.expira_en };
  }

  await fila.update({ revocado: true, revocado_en: new Date() });
  await marcarActividad(usuario, { suplantado: Boolean(fila.suplantado_por), forzar: true });
  return crearSesion(usuario, ctx, suplantacion);
}

// Un administrador entra como otra persona (activa y que no sea administradora). Su propia sesion se cierra: para volver
// usa terminarSuplantacion, que valida que siga siendo administrador. Todo queda en la auditoria a nombre del administrador.
async function suplantar(admin, usuarioId, tokenActual, ctx) {
  const objetivo = await Usuario.findByPk(usuarioId);
  if (!objetivo) throw new ApiError(404, 'La persona no existe');
  if (objetivo.id === admin.id) throw new ApiError(409, 'No puedes entrar como tú mismo');
  if (!objetivo.activo) throw new ApiError(409, 'La persona está inactiva');
  if (objetivo.es_admin) throw new ApiError(409, 'No se puede entrar como otro administrador');

  if (tokenActual) {
    await RefreshToken.update({ revocado: true, revocado_en: new Date() }, { where: { token_hash: security.hashRefreshToken(tokenActual), usuario_id: admin.id, revocado: false } });
  }
  const hasta = new Date(Date.now() + security.SUPLANTACION_MINUTES * 60 * 1000);
  await auditoria.registrar({ ...ctx, actorId: admin.id, accion: 'sesion.suplantar', entidad: 'usuario', entidadId: objetivo.id, detalle: { hasta: hasta.toISOString() } });
  return crearSesion(objetivo, ctx, { suplantador: admin, hasta });
}

// Regresa a la cuenta del administrador desde una sesion suplantada (con su token de renovacion, aunque el de acceso venza).
async function terminarSuplantacion(token, ctx) {
  const fila = token ? await RefreshToken.findOne({ where: { token_hash: security.hashRefreshToken(token) } }) : null;
  if (!fila || fila.revocado || fila.expira_en < new Date()) throw new ApiError(401, SESION_NO_VALIDA);
  if (!fila.suplantado_por) throw new ApiError(409, 'Esta sesión no es de suplantación');

  await fila.update({ revocado: true, revocado_en: new Date() });
  const admin = await suplantadorVigente(fila.suplantado_por);
  if (!admin) throw new ApiError(401, SESION_NO_VALIDA);
  await auditoria.registrar({ ...ctx, actorId: admin.id, accion: 'sesion.suplantar-fin', entidad: 'usuario', entidadId: fila.usuario_id });
  return crearSesion(admin, ctx);
}

async function logout(token, ctx) {
  if (!token) return;
  const fila = await RefreshToken.findOne({ where: { token_hash: security.hashRefreshToken(token) } });
  if (!fila) return;
  if (!fila.revocado) await fila.update({ revocado: true, revocado_en: new Date() });
  await auditoria.registrar({ ...ctx, actorId: fila.usuario_id, accion: 'logout', entidad: 'usuario', entidadId: fila.usuario_id });
}

async function cambiarPassword(usuario, { passwordActual, passwordNueva }, ctx) {
  if (!usuario.password_hash) throw new ApiError(409, 'Tu cuenta entra solo con Microsoft: no tiene contraseña que cambiar');
  if (!(await security.verifyPassword(passwordActual, usuario.password_hash))) throw new ApiError(403, 'La contraseña actual no es correcta');
  validatePassword(passwordNueva);
  if (passwordNueva === passwordActual) throw new ApiError(422, 'La contraseña nueva debe ser distinta de la actual');

  await usuario.update({ password_hash: await security.hashPassword(passwordNueva), debe_cambiar_password: false });
  await revocarSesiones(usuario.id); // cualquier otra sesion abierta con la contraseña vieja deja de valer
  await auditoria.registrar({ ...ctx, actorId: usuario.id, accion: 'password.cambio', entidad: 'usuario', entidadId: usuario.id });
  return crearSesion(usuario, ctx);
}

module.exports = { login, loginMicrosoft, refrescar, logout, cambiarPassword, perfil, revocarSesiones, suplantar, terminarSuplantacion, marcarActividad };
