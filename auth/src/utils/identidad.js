// Reglas de identidad que comparten login, usuarios y pruebas: el correo en minusculas es la llave de todos.
const normalizarEmail = (email) => String(email ?? '').trim().toLowerCase();

const lista = (valor) =>
  String(valor ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// Cuentas de dominios corporativos: entran SOLO con Microsoft (sin contrasena).
function esDominioCorporativo(email) {
  const dominio = normalizarEmail(email).split('@')[1];
  return Boolean(dominio) && lista(process.env.PORTAL_CORPORATE_DOMAINS).includes(dominio);
}

// Correos que quedan como administradores al entrar con Microsoft (el primer admin, sin contrasena que repartir).
const esAdminInicial = (email) => lista(process.env.PORTAL_ADMIN_EMAILS).includes(normalizarEmail(email));

// El destino de despues del login solo puede ser una ruta del propio portal: nunca una URL absoluta (redireccion abierta).
function rutaSegura(destino) {
  if (typeof destino !== 'string' || !destino.startsWith('/')) return '/';
  if (destino.startsWith('//') || destino.includes('\\') || /[\r\n]/.test(destino)) return '/';
  return destino;
}

module.exports = { normalizarEmail, esDominioCorporativo, esAdminInicial, rutaSegura };
