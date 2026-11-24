// Solo el dia, para columnas angostas ("24 nov 2026"); la hora va en formatoFecha.
export const formatoCorto = (valor) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : null;

export const formatoFecha = (valor) =>
  valor ? new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }) : null;
