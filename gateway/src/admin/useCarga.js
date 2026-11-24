export const formatoFecha = (valor) =>
  valor ? new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }) : null;
