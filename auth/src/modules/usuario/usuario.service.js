const ApiError = require('../../utils/ApiError');
const security = require('../../utils/security');
const { generateRandomPassword } = require('../../utils/passwordRules');
const { normalizarEmail, esDominioCorporativo } = require('../../utils/identidad');
const { Usuario, Equipo } = require('../../models');
const auditoria = require('../auditoria/auditoria.service');
const authService = require('../auth/auth.service');

const INCLUIR_EQUIPOS = [{ model: Equipo, as: 'equipos', attributes: ['id', 'nombre'], through: { attributes: [] } }];

// Nunca sale el hash: solo si la persona tiene contrasena y si ya vinculo su cuenta de Microsoft.
function serializar(u) {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    activo: u.activo,
    esAdmin: u.es_admin,
    corporativo: esDominioCorporativo(u.email),
    tienePassword: Boolean(u.password_hash),
    debeCambiarPassword: u.debe_cambiar_password,
    microsoftVinculado: Boolean(u.microsoft_id),
    ultimoLogin: u.ultimo_login,
    ultimaActividad: u.ultima_actividad,
    equipos: (u.equipos ?? []).map((e) => ({ id: e.id, nombre: e.nombre })),
  };
}

async function obtener(id) {
  const usuario = await Usuario.findByPk(id, { include: INCLUIR_EQUIPOS });
  if (!usuario) throw new ApiError(404, 'La persona no existe');
  return usuario;
}

async function listar() {
  const usuarios = await Usuario.findAll({ include: INCLUIR_EQUIPOS, order: [['nombre', 'ASC']] });
  return usuarios.map(serializar);
}

// Solo la ultima actividad de cada persona: el panel la consulta cada minuto para mostrar quien esta en linea sin
// recargar toda la lista.
async function actividad() {
  const filas = await Usuario.findAll({ attributes: ['id', 'ultima_actividad'], raw: true });
  return filas.map((f) => ({ id: f.id, ultimaActividad: f.ultima_actividad }));
}

// Contrasena temporal: se devuelve UNA vez en la respuesta y nunca se guarda en claro. La persona debe cambiarla al entrar.
async function conTemporal(usuario) {
  const temporal = generateRandomPassword();
  await usuario.update({ password_hash: await security.hashPassword(temporal), debe_cambiar_password: true, intentos_fallidos: 0, bloqueado_hasta: null });
  return temporal;
}

// Las cuentas de dominio corporativo entran solo con Microsoft: no se les crea contrasena.
async function crear({ email, nombre, esAdmin }, ctx) {
  const correo = normalizarEmail(email);
  if (await Usuario.findOne({ where: { email: correo } })) throw new ApiError(409, 'Ya existe una persona con ese correo');

  const usuario = await Usuario.create({ email: correo, nombre, es_admin: Boolean(esAdmin) });
  const passwordTemporal = esDominioCorporativo(correo) ? null : await conTemporal(usuario);
  await auditoria.registrar({ ...ctx, accion: 'usuario.crear', entidad: 'usuario', entidadId: usuario.id, detalle: { email: correo, esAdmin: usuario.es_admin } });
  return { usuario: serializar(await obtener(usuario.id)), passwordTemporal };
}

async function actualizar(id, { nombre, activo, esAdmin }, ctx) {
  const usuario = await obtener(id);
  if (id === ctx.actorId && (activo === false || esAdmin === false)) {
    throw new ApiError(409, 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
  }

  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (activo !== undefined) cambios.activo = activo;
  if (esAdmin !== undefined) cambios.es_admin = esAdmin;
  await usuario.update(cambios);

  // Desactivar corta las sesiones abiertas: el acceso se pierde en menos de lo que dura el token de acceso.
  if (activo === false) await authService.revocarSesiones(usuario.id);
  await auditoria.registrar({ ...ctx, accion: 'usuario.actualizar', entidad: 'usuario', entidadId: usuario.id, detalle: cambios });
  return serializar(usuario);
}

async function resetearPassword(id, ctx) {
  const usuario = await obtener(id);
  if (esDominioCorporativo(usuario.email)) throw new ApiError(409, 'Esta persona entra solo con Microsoft: no usa contraseña');
  const passwordTemporal = await conTemporal(usuario);
  await authService.revocarSesiones(usuario.id);
  await auditoria.registrar({ ...ctx, accion: 'usuario.reset-password', entidad: 'usuario', entidadId: usuario.id });
  return { passwordTemporal };
}

module.exports = { listar, actividad, crear, actualizar, resetearPassword, serializar, obtener };
