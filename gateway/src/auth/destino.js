// A donde se vuelve despues de iniciar sesion. Solo rutas del propio portal (nunca una URL absoluta: redireccion abierta).
export function destinoSeguro(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (next.split(/[?#]/)[0] === '/login') return '/';
  return next;
}

// Las pantallas del propio portal se navegan sin recargar; las apps (/cartera/, /siger/...) son otros programas: carga completa.
export function esRutaDelPortal(ruta) {
  const p = ruta.split(/[?#]/)[0];
  return p === '/' || p === '/cambiar-password' || p === '/admin' || p.startsWith('/admin/');
}
