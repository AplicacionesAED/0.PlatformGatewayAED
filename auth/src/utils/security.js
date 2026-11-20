// Sesion del portal: tokens RS256, contrasenas y cookies. El portal FIRMA con la llave privada; las apps VERIFICAN con la
// publica (GET /api/.well-known/jwks.json), asi ninguna app guarda un secreto con el que se podrian falsificar sesiones.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const ALGORITHM = 'RS256';
const ISSUER = 'portal.aed-it.com';
const AUDIENCE = 'aed-apps';
// Un acceso desactivado se corta como maximo al vencer el token de acceso: al renovarlo se vuelve a comprobar `activo`.
const ACCESS_TOKEN_MINUTES = 60;
const REFRESH_TOKEN_DAYS = 7;
const ACCESS_COOKIE_NAME = 'portal_session';
const REFRESH_COOKIE_NAME = 'portal_refresh';
const BCRYPT_ROUNDS = 12;

function loadPrivateKey() {
  const b64 = process.env.PORTAL_JWT_PRIVATE_KEY_B64;
  if (b64) return crypto.createPrivateKey(Buffer.from(b64, 'base64').toString('utf8'));
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta PORTAL_JWT_PRIVATE_KEY_B64: sin la llave privada el portal no puede firmar sesiones.');
  }
  console.warn('[security] Sin PORTAL_JWT_PRIVATE_KEY_B64: se genero una llave efimera (las sesiones se pierden al reiniciar).'); // eslint-disable-line no-console
  return crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
}

const privateKey = loadPrivateKey();
const publicKey = crypto.createPublicKey(privateKey);
const KID = process.env.PORTAL_JWT_KID || 'dev';

// `cpw` = la persona debe cambiar su contrasena: las apps no deben dejarla entrar hasta que lo haga.
function createAccessToken(usuario, { apps, equipos }) {
  const payload = { email: usuario.email, nombre: usuario.nombre, apps, equipos, cpw: Boolean(usuario.debe_cambiar_password), type: 'access' };
  return jwt.sign(payload, privateKey, {
    algorithm: ALGORITHM,
    expiresIn: `${ACCESS_TOKEN_MINUTES}m`,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: String(usuario.id),
    keyid: KID,
  });
}

// Lanza si la firma, el emisor, la audiencia o la expiracion no cuadran.
function verifyAccessToken(token) {
  const payload = jwt.verify(token, publicKey, { algorithms: [ALGORITHM], issuer: ISSUER, audience: AUDIENCE });
  if (payload.type !== 'access') throw new Error('Tipo de token invalido');
  return payload;
}

function getJwks() {
  return { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: ALGORITHM, use: 'sig' }] };
}

// El token de renovacion es opaco: solo se guarda su hash en la base.
const generateRefreshToken = () => crypto.randomBytes(32).toString('base64url');
const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
// Para gastar el mismo tiempo cuando el correo no existe y no delatar que la cuenta no esta registrada.
const DUMMY_HASH = bcrypt.hashSync('contrasena-inexistente', BCRYPT_ROUNDS);

// `secure` solo si el portal se sirve por HTTPS (FRONTEND_URL): con una URL http de pruebas el navegador descartaria la cookie.
const secure = () => process.env.NODE_ENV === 'production' && String(process.env.FRONTEND_URL || '').startsWith('https');
const accessCookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: ACCESS_TOKEN_MINUTES * 60 * 1000 });
// La ruta es la que ve el NAVEGADOR (detras del gateway: /portal/api/auth); el servicio la recibe sin el prefijo /portal.
const refreshCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: secure(),
  path: process.env.PORTAL_REFRESH_COOKIE_PATH || '/api/auth',
  maxAge: REFRESH_TOKEN_DAYS * 24 * 3600 * 1000,
});

function setSessionCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, accessCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function clearSessionCookies(res) {
  const { maxAge: _a, ...acceso } = accessCookieOptions();
  const { maxAge: _r, ...renovacion } = refreshCookieOptions();
  res.clearCookie(ACCESS_COOKIE_NAME, acceso);
  res.clearCookie(REFRESH_COOKIE_NAME, renovacion);
}

module.exports = {
  ACCESS_TOKEN_MINUTES,
  REFRESH_TOKEN_DAYS,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  createAccessToken,
  verifyAccessToken,
  getJwks,
  generateRefreshToken,
  hashRefreshToken,
  hashPassword,
  verifyPassword,
  DUMMY_HASH,
  secure,
  setSessionCookies,
  clearSessionCookies,
};
