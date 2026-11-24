// Como se lee un registro de auditoria: nombre de la accion y detalle con nombres en vez de ids y slugs.

export const ACCIONES = {
  'login.ok': 'Inicio de sesión',
  'login.fallido': 'Inicio de sesión fallido',
  'login.bloqueado': 'Cuenta bloqueada por intentos',
  logout: 'Cierre de sesión',
  'sesion.reuso': 'Posible robo de sesión',
  'sesion.suplantar': 'Entró como otra persona',
  'sesion.suplantar-fin': 'Regresó a su cuenta',
  'password.cambio': 'Cambio de contraseña',
  'usuario.crear': 'Persona creada',
  'usuario.actualizar': 'Persona modificada',
  'usuario.reset-password': 'Contraseña restablecida',
  'equipo.crear': 'Equipo creado',
  'equipo.actualizar': 'Equipo modificado',
  'equipo.eliminar': 'Equipo eliminado',
  'equipo.miembros': 'Miembros del equipo',
  'acceso.conceder': 'Acceso concedido',
  'acceso.revocar': 'Acceso quitado',
  'app.actualizar': 'Aplicación modificada',
};

const METODOS = { password: 'contraseña', microsoft: 'Microsoft' };
const MOTIVOS = { inactivo: 'cuenta inactiva' };
const siNo = (v) => (v ? 'sí' : 'no');

// `ix` son los indices de datos.jsx (personaPorId, equipoPorId, appPorSlug); puede faltar mientras cargan.
export function describir(f, ix) {
  const persona = (id) => ix?.personaPorId.get(Number(id))?.nombre ?? `persona #${id}`;
  const equipo = (id) => ix?.equipoPorId.get(Number(id))?.nombre ?? `equipo #${id}`;
  const app = (slug) => ix?.appPorSlug.get(slug)?.nombre ?? slug;
  const partes = [];

  // Sobre quien o que se hizo, si no es quien lo hizo.
  if (f.entidad === 'usuario' && f.entidad_id && Number(f.entidad_id) !== f.actor_id) partes.push(`Persona: ${persona(f.entidad_id)}`);
  if (f.entidad === 'equipo' && f.entidad_id && !f.detalle?.nombre) partes.push(`Equipo: ${equipo(f.entidad_id)}`);

  for (const [k, v] of Object.entries(f.detalle ?? {})) {
    if (v === undefined || v === null) continue;
    if (k === 'app' || k === 'slug') partes.push(`Aplicación: ${app(v)}`);
    else if (k === 'usuarioId') partes.push(`Persona: ${persona(v)}`);
    else if (k === 'equipoId') partes.push(`Equipo: ${equipo(v)}`);
    else if (k === 'usuarioIds') {
      const nombres = v.map(persona);
      partes.push(nombres.length === 0 ? 'Sin miembros' : `Miembros (${nombres.length}): ${nombres.slice(0, 5).join(', ')}${nombres.length > 5 ? ` y ${nombres.length - 5} más` : ''}`);
    } else if (k === 'esAdmin' || k === 'es_admin') partes.push(`Administrador: ${siNo(v)}`);
    else if (k === 'activo' || k === 'activa') partes.push(`Activa: ${siNo(v)}`);
    else if (k === 'nombre') partes.push(`Nombre: ${v}`);
    else if (k === 'descripcion') partes.push(`Descripción: ${v}`);
    else if (k === 'email') partes.push(`Correo: ${v}`);
    else if (k === 'metodo') partes.push(`Con ${METODOS[v] ?? v}`);
    else if (k === 'motivo') partes.push(`Motivo: ${MOTIVOS[v] ?? v}`);
    else if (k === 'hasta') partes.push(`Hasta las ${new Date(v).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })}`);
    else partes.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return partes.join(' · ');
}
