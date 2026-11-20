// SSO de Azure AD (Microsoft Entra) con @azure/msal-node, con el registro "Acceso Apps". A diferencia de las apps, el login valida
// `state` (una cookie de corta vida) para que nadie pueda iniciar la sesion de otra persona, y el destino posterior (`next`)
// solo puede ser una ruta del propio portal.
const crypto = require('crypto');
const msal = require('@azure/msal-node');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { setSessionCookies, secure } = require('../../utils/security');
const { rutaSegura } = require('../../utils/identidad');
const service = require('./auth.service');
const { contexto } = require('./auth.controller');

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];
const FRONTEND_URL = () => (process.env.FRONTEND_URL || 'http://localhost:5190').replace(/\/$/, '');
const REDIRECT_URI = () => process.env.AZURE_REDIRECT_URI || 'http://localhost:3060/api/auth/azure/callback';
const OAUTH_COOKIE = 'portal_oauth';

// Cliente MSAL perezoso: sin las variables AZURE_* el servidor arranca igual y solo el login con Microsoft responde con error.
let msalClient = null;
function getMsalClient() {
  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !process.env.AZURE_TENANT_ID) return null;
  if (!msalClient) {
    msalClient = new msal.ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      },
    });
  }
  return msalClient;
}

const errorUrl = (codigo) => `${FRONTEND_URL()}/login?error=${codigo}`;
const cookieOpciones = () => ({ httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: 10 * 60 * 1000 });

// GET /auth/azure/login?next=/cartera/
const iniciarLogin = asyncHandler(async (req, res) => {
  const client = getMsalClient();
  if (!client) return res.redirect(errorUrl('OAuthError'));
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_COOKIE, JSON.stringify({ state, next: rutaSegura(req.query.next) }), cookieOpciones());
  return res.redirect(await client.getAuthCodeUrl({ scopes: SCOPES, redirectUri: REDIRECT_URI(), state }));
});

// GET /auth/azure/callback -- Microsoft redirige aca con ?code=...&state=...
const callback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const client = getMsalClient();

  let guardado = null;
  try {
    guardado = JSON.parse(req.cookies?.[OAUTH_COOKIE] ?? 'null');
  } catch {
    guardado = null;
  }
  const { maxAge: _m, ...limpiar } = cookieOpciones();
  res.clearCookie(OAUTH_COOKIE, limpiar);

  if (error || !code || !client || !guardado?.state || guardado.state !== state) return res.redirect(errorUrl('OAuthError'));

  let respuesta;
  try {
    respuesta = await client.acquireTokenByCode({ code, scopes: SCOPES, redirectUri: REDIRECT_URI() });
  } catch {
    return res.redirect(errorUrl('OAuthError'));
  }

  const claims = respuesta.account?.idTokenClaims ?? {};
  const microsoftId = respuesta.uniqueId || claims.oid || claims.sub;
  const email = respuesta.account?.username || claims.email || claims.preferred_username || '';
  // Solo cuentas del tenant de AED (el authority ya es de un solo tenant; esto lo confirma sobre el token recibido).
  if (!microsoftId || (claims.tid && claims.tid !== process.env.AZURE_TENANT_ID)) return res.redirect(errorUrl('OAuthError'));

  try {
    const { tokens } = await service.loginMicrosoft({ microsoftId, email, nombre: claims.name }, contexto(req));
    setSessionCookies(res, tokens);
    return res.redirect(`${FRONTEND_URL()}${rutaSegura(guardado.next)}`);
  } catch (err) {
    if (err instanceof ApiError && (err.message === 'OAuthAccountNotFound' || err.message === 'OAuthAccountInactive')) return res.redirect(errorUrl(err.message));
    throw err;
  }
});

module.exports = { iniciarLogin, callback };
