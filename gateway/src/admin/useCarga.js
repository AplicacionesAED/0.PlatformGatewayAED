// Solo el dia, para columnas angostas ("24 nov 2026"); la hora va en formatoFecha.
export const formatoCorto = (valor) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : null;

export const formatoFecha = (valor) =>
  valor ? new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }) : null;

// "En linea": actividad en los ultimos 5 minutos. El portal y las apps mandan un latido cada 2 minutos mientras la persona
// las usa (gateway/public/actividad.js); 5 minutos deja margen para un latido perdido.
const EN_LINEA_MS = 5 * 60 * 1000;
export const enLinea = (u) => Boolean(u.ultimaActividad) && Date.now() - new Date(u.ultimaActividad) < EN_LINEA_MS;
// Activa en la ultima hora (incluye a quien esta en linea).
export const ultimaHora = (u) => Boolean(u.ultimaActividad) && Date.now() - new Date(u.ultimaActividad) < 60 * 60 * 1000;

// Tiempo relativo para la ultima actividad: "hace 1 minuto", "hace 5 minutos", "hace 3 h", "ayer", "hace 4 días"; mas
// viejo, la fecha corta.
export function formatoRelativo(valor) {
  if (!valor) return null;
  const min = Math.floor((Date.now() - new Date(valor)) / 60000);
  if (min < 1) return 'hace menos de 1 minuto';
  if (min === 1) return 'hace 1 minuto';
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return formatoCorto(valor);
}
