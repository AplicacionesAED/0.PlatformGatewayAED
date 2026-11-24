const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, noContent } = require('../../utils/ApiResponse');
const { REFRESH_COOKIE_NAME, setSessionCookies, clearSessionCookies, getJwks } = require('../../utils/security');
const service = require('./auth.service');

// Contexto que acompaña cada operacion para la auditoria y para registrar desde donde se abrio la sesion.
const contexto = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

const login = asyncHandler(async (req, res) => {
  const { tokens, perfil } = await service.login(req.body, contexto(req));
  setSessionCookies(res, tokens);
  return ok(res, perfil);
});

const refresh = asyncHandler(async (req, res) => {
  try {
    const { tokens, perfil } = await service.refrescar(req.cookies?.[REFRESH_COOKIE_NAME], contexto(req));
    setSessionCookies(res, tokens);
    return ok(res, perfil);
  } catch (err) {
    clearSessionCookies(res); // una renovacion rechazada deja la sesion limpia en el navegador
    throw err;
  }
});

const logout = asyncHandler(async (req, res) => {
  await service.logout(req.cookies?.[REFRESH_COOKIE_NAME], contexto(req));
  clearSessionCookies(res);
  return noContent(res);
});

const cambiarPassword = asyncHandler(async (req, res) => {
  if (req.suplantador) throw new ApiError(403, 'No puedes cambiar la contraseña de otra persona');
  const { tokens, perfil } = await service.cambiarPassword(req.usuario, req.body, contexto(req));
  setSessionCookies(res, tokens);
  return ok(res, perfil);
});

const suplantar = asyncHandler(async (req, res) => {
  const { tokens, perfil } = await service.suplantar(req.usuario, req.body.usuarioId, req.cookies?.[REFRESH_COOKIE_NAME], contexto(req));
  setSessionCookies(res, tokens);
  return ok(res, perfil);
});

const terminarSuplantacion = asyncHandler(async (req, res) => {
  const { tokens, perfil } = await service.terminarSuplantacion(req.cookies?.[REFRESH_COOKIE_NAME], contexto(req));
  setSessionCookies(res, tokens);
  return ok(res, perfil);
});

const me = asyncHandler(async (req, res) => ok(res, await service.perfil(req.usuario, req.suplantador)));

// Las apps descargan esta llave publica para verificar las sesiones; cambia solo al rotar la llave.
const jwks = (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(getJwks());
};

module.exports = { login, refresh, logout, cambiarPassword, suplantar, terminarSuplantacion, me, jwks, contexto };
