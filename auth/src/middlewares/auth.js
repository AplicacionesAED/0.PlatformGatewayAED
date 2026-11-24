// requireAuth va PRIMERO en toda ruta protegida. Verifica la cookie de sesion y RE-LEE a la persona de la base (activa, es_admin):
// nunca se confia en lo que diga el token sobre privilegios. requireAdmin exige ademas que no tenga un cambio de contraseña pendiente.
const { verifyAccessToken, ACCESS_COOKIE_NAME } = require('../utils/security');
const ApiError = require('../utils/ApiError');
const { Usuario } = require('../models');

async function requireAuth(req, res, next) {
  const token = req.cookies?.[ACCESS_COOKIE_NAME];
  if (!token) return next(new ApiError(401, 'No autenticado'));

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new ApiError(401, 'Sesión inválida o expirada'));
  }

  const usuario = await Usuario.findByPk(Number(payload.sub));
  if (!usuario?.activo) return next(new ApiError(401, 'Usuario no encontrado'));

  req.usuario = usuario;
  // Sesion de suplantacion: quien esta detras (validado al emitir y al renovar la sesion).
  req.suplantador = payload.act ? { id: Number(payload.act.sub), nombre: payload.act.nombre } : null;
  next();
}

// Una sesion suplantada nunca administra, aunque la persona suplantada llegara a ser administradora.
function requireAdmin(req, res, next) {
  if (req.suplantador) return next(new ApiError(403, 'No se puede administrar mientras entras como otra persona'));
  if (!req.usuario?.es_admin) return next(new ApiError(403, 'Acceso restringido a administradores'));
  if (req.usuario.debe_cambiar_password) return next(new ApiError(403, 'Debes cambiar tu contraseña antes de continuar'));
  next();
}

module.exports = { requireAuth, requireAdmin };
