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
  'servicio.registrar': 'Alta desde una aplicación',
  'servicio.quitar-acceso': 'Acceso quitado desde una aplicación',
  'servicio.cambiar-correo': 'Correo cambiado desde una aplicación',
  'servicio.password-temporal': 'Contraseña temporal desde una aplicación',
};

// Campos simples: como se llaman y como se muestra su valor. Con `antes` en el detalle salen como "valor viejo → nuevo".
const CAMPOS = {
  esAdmin: ['Administrador', (v) => siNo(v)],
  es_admin: ['Administrador', (v) => siNo(v)],
  activo: ['Activa', (v) => siNo(v)],
  activa: ['Activa', (v) => siNo(v)],
  nombre: ['Nombre', (v) => v],
  descripcion: ['Descripción', (v) => v || '(vacía)'],
  email: ['Correo', (v) => v],
};

const METODOS = { password: 'contraseña', microsoft: 'Microsoft' };
const MOTIVOS = { inactivo: 'cuenta inactiva' };
const siNo = (v) => (v ? 'sí' : 'no');

// `ix` son los indices de datos.jsx (personaPorId, equipoPorId, appPorSlug); puede faltar mientras cargan.
export function describir(f, ix) {
  // `ix` existe desde el primer render, pero sus indices solo cuando cargaron los datos.
  const persona = (id) => ix?.personaPorId?.get(Number(id))?.nombre ?? `persona #${id}`;
  const equipo = (id) => ix?.equipoPorId?.get(Number(id))?.nombre ?? `equipo #${id}`;
  const app = (slug) => ix?.appPorSlug?.get(slug)?.nombre ?? slug;
  const partes = [];

  // Sobre quien o que se hizo, si no es quien lo hizo.
  if (f.entidad === 'usuario' && f.entidad_id && Number(f.entidad_id) !== f.actor_id) partes.push(`Persona: ${persona(f.entidad_id)}`);
  if (f.entidad === 'equipo' && f.entidad_id && !f.detalle?.nombre) partes.push(`Equipo: ${equipo(f.entidad_id)}`);

  const lista = (ids) => `${ids.slice(0, 5).map(persona).join(', ')}${ids.length > 5 ? ` y ${ids.length - 5} más` : ''}`;
  const antes = f.detalle?.antes ?? {};
  // Registros viejos de miembros (sin agregados/quitados): se muestra la lista completa como antes.
  const conDiferencia = Array.isArray(f.detalle?.agregados);

  for (const [k, v] of Object.entries(f.detalle ?? {})) {
    if (v === undefined || v === null || k === 'antes') continue;
    if (CAMPOS[k]) {
      const [etiqueta, valor] = CAMPOS[k];
      partes.push(k in antes ? `${etiqueta}: ${valor(antes[k]) ?? '—'} → ${valor(v)}` : `${etiqueta}: ${valor(v)}`);
    } else if (k === 'app' || k === 'slug') partes.push(`Aplicación: ${app(v)}`);
    else if (k === 'usuarioId') partes.push(`Persona: ${persona(v)}`);
    else if (k === 'equipoId') partes.push(`Equipo: ${equipo(v)}`);
    else if (k === 'usuarioIds') {
      if (conDiferencia) partes.push(`Quedan ${v.length} ${v.length === 1 ? 'miembro' : 'miembros'}`);
      else partes.push(v.length === 0 ? 'Sin miembros' : `Miembros (${v.length}): ${lista(v)}`);
    } else if (k === 'agregados') {
      if (v.length) partes.push(`Agregados (${v.length}): ${lista(v)}`);
    } else if (k === 'quitados') {
      if (v.length) partes.push(`Quitados (${v.length}): ${lista(v)}`);
    } else if (k === 'servicio') partes.push(`Desde ${app(v)}`);
    else if (k === 'solicitadoPor') partes.push(`Pedido por ${v}`);
    else if (k === 'anterior') partes.push(`Correo anterior: ${v}`);
    else if (k === 'metodo') partes.push(`Con ${METODOS[v] ?? v}`);
    else if (k === 'motivo') partes.push(`Motivo: ${MOTIVOS[v] ?? v}`);
    else if (k === 'hasta') partes.push(`Hasta las ${new Date(v).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })}`);
    else partes.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return partes.join(' · ');
}
