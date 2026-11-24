// Solo el dia, para columnas angostas ("24 nov 2026"); la hora va en formatoFecha.
export const formatoCorto = (valor) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : null;

export const formatoFecha = (valor) =>
  valor ? new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }) : null;

// "En linea": actividad en los ultimos 65 minutos. Las apps renuevan la sesion como maximo cada hora mientras se usan, asi
// que es la precision que da el portal (no ve los clics dentro de cada app).
const EN_LINEA_MS = 65 * 60 * 1000;
export const enLinea = (u) => Boolean(u.ultimaActividad) && Date.now() - new Date(u.ultimaActividad) < EN_LINEA_MS;

// Tiempo relativo para la ultima actividad: "hace 5 min", "hace 3 h", "ayer", "hace 4 días"; mas viejo, la fecha corta.
export function formatoRelativo(valor) {
  if (!valor) return null;
  const min = Math.floor((Date.now() - new Date(valor)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return formatoCorto(valor);
}
