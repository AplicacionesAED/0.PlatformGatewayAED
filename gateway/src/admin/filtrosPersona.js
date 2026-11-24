// Filtros rapidos comunes de las listas de personas dentro de las fichas (equipo y aplicacion). Definidos una vez, fuera de
// los componentes, para que la lista no recalcule sus conteos en cada render.
export const FILTROS_PERSONA = [
  { clave: 'activas', nombre: 'Activas', fn: (u) => u.activo !== false },
  { clave: 'inactivas', nombre: 'Inactivas', fn: (u) => u.activo === false },
  { clave: 'nunca', nombre: 'Nunca han entrado', fn: (u) => !u.ultimoLogin },
];
