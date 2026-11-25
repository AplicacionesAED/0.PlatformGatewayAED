// Muestra los nombres guardados en mayusculas (vienen asi de RR.HH. y del cargue inicial) como nombre propio:
// "MARIA DE LOS ANGELES PEREZ" -> "Maria de los Angeles Perez". Solo al mostrar: la base no cambia. Si el nombre ya trae
// minusculas se deja como esta (alguien lo escribio a proposito, p. ej. "McAllister").
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'van', 'von']);

export function nombrePropio(nombre) {
  if (typeof nombre !== 'string' || nombre !== nombre.toLocaleUpperCase('es')) return nombre;
  return nombre
    .toLocaleLowerCase('es')
    .split(/(\s+)/)
    .map((parte, i) => {
      if (i > 0 && PARTICULAS.has(parte)) return parte;
      // Tambien tras guion o apostrofo: "GOMEZ-LOPEZ" -> "Gomez-Lopez", "D'ALEMAN" -> "D'Aleman".
      return parte.replace(/(^|[-'’])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('es'));
    })
    .join('');
}
