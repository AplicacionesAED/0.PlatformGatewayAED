import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { BotonIcono, Button } from '../components/ui.jsx';
import { coincide, normalizar } from './datos.jsx';
import s from './Admin.module.css';

// Lista de personas dentro de una ficha (miembros de un equipo, accesos directos de una app): buscador, filtros rapidos con
// conteo, seleccion multiple (pagina o todo el filtro) y paginacion. Con cientos de filas (RR.HH. ~700) no se dibujan todas.
//   items          [{ id, ... }]
//   textoDe(it)    texto para el buscador
//   filtros        [{ clave, nombre, fn }] (opcional; "Todas" se agrega solo)
//   claseDe(it)    clase extra del <li> (p. ej. inactiva)
//   renderItem(it) contenido de la fila (sin la casilla)
//   acciones(sel, limpiar)  botones de la barra cuando hay seleccion (`sel` = items seleccionados)
export default function ListaPaginada({ items, textoDe, filtros = [], claseDe, renderItem, acciones, porPagina = 15, etiqueta, vacio }) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState(() => new Set());

  const todos = useMemo(() => [{ clave: 'todas', nombre: 'Todas', fn: () => true }, ...filtros], [filtros]);
  const conteos = useMemo(() => new Map(todos.map((f) => [f.clave, items.filter(f.fn).length])), [todos, items]);

  const filtrados = useMemo(() => {
    const n = normalizar(q.trim());
    const fn = todos.find((f) => f.clave === filtro)?.fn ?? (() => true);
    return items.filter((it) => fn(it) && coincide(n, textoDe(it)));
  }, [items, q, filtro, todos, textoDe]);

  if (items.length === 0) return <p className={s.sub}>{vacio}</p>;

  const total = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const actual = Math.min(pagina, total);
  const visibles = filtrados.slice((actual - 1) * porPagina, actual * porPagina);
  // La seleccion solo cuenta lo que sigue existiendo (tras quitar personas, desaparecen de la lista).
  const vigentes = items.filter((it) => seleccion.has(it.id));
  const paginaMarcada = visibles.length > 0 && visibles.every((it) => seleccion.has(it.id));
  const filtroMarcado = filtrados.length > 0 && filtrados.every((it) => seleccion.has(it.id));

  const cambiar = (fn) => (valor) => {
    fn(valor);
    setPagina(1);
  };
  const alternar = (id) =>
    setSeleccion((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alternarPagina = () =>
    setSeleccion((x) => {
      const n = new Set(x);
      for (const it of visibles) {
        if (paginaMarcada) n.delete(it.id);
        else n.add(it.id);
      }
      return n;
    });
  const limpiar = () => setSeleccion(new Set());

  return (
    <div className={s.listaPaginada}>
      {items.length > 5 && (
        <label className={`${s.buscador} ${s.buscadorBloque}`}>
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder={`Buscar entre ${items.length}…`} value={q} onChange={(e) => cambiar(setQ)(e.target.value)} aria-label={`Buscar en ${etiqueta}`} />
        </label>
      )}
      {filtros.length > 0 && (
        <div className={s.chips} role="group" aria-label={`Filtrar ${etiqueta}`}>
          {todos
            .filter((f) => f.clave === 'todas' || conteos.get(f.clave) > 0)
            .map((f) => (
              <button key={f.clave} type="button" className={`${s.chip} ${s.chipChico}`} aria-pressed={filtro === f.clave} onClick={() => cambiar(setFiltro)(f.clave)}>
                {f.nombre} <span className={s.chipTotal}>{conteos.get(f.clave)}</span>
              </button>
            ))}
        </div>
      )}

      <div className={`${s.listaCabecera} ${vigentes.length ? s.listaCabeceraActiva : ''}`}>
        <label className={s.casillaLista}>
          <input type="checkbox" checked={paginaMarcada} onChange={alternarPagina} aria-label="Seleccionar las personas de esta página" disabled={!visibles.length} />
          <span>{vigentes.length ? `${vigentes.length} ${vigentes.length === 1 ? 'seleccionada' : 'seleccionadas'}` : `${filtrados.length} ${filtrados.length === 1 ? 'persona' : 'personas'}`}</span>
        </label>
        {vigentes.length > 0 && !filtroMarcado && filtrados.length > visibles.length && (
          <button type="button" className={s.enlaceBoton} onClick={() => setSeleccion((x) => new Set([...x, ...filtrados.map((it) => it.id)]))}>
            Seleccionar las {filtrados.length}
          </button>
        )}
        {vigentes.length > 0 && (
          <span className={s.listaAcciones}>
            {acciones?.(vigentes, limpiar)}
            <Button variante="secundario" icono={X} onClick={limpiar}>
              Quitar selección
            </Button>
          </span>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className={s.sub}>Nadie coincide.</p>
      ) : (
        <ul className={s.listaFilas}>
          {visibles.map((it) => (
            <li key={it.id} className={`${claseDe?.(it) ?? ''} ${seleccion.has(it.id) ? s.filaMarcada : ''}`}>
              <input type="checkbox" className={s.casillaFila} checked={seleccion.has(it.id)} onChange={() => alternar(it.id)} aria-label={`Seleccionar ${textoDe(it)}`} />
              {renderItem(it)}
            </li>
          ))}
        </ul>
      )}
      {filtrados.length > porPagina && (
        <div className={s.listaPaginadaPie}>
          <span>
            {(actual - 1) * porPagina + 1}–{(actual - 1) * porPagina + visibles.length} de {filtrados.length}
          </span>
          <span className={s.paginas}>
            <BotonIcono icono={ChevronLeft} etiqueta="Página anterior" disabled={actual === 1} onClick={() => setPagina(actual - 1)} />
            <span className={s.paginaTexto}>
              {actual} / {total}
            </span>
            <BotonIcono icono={ChevronRight} etiqueta="Página siguiente" disabled={actual === total} onClick={() => setPagina(actual + 1)} />
          </span>
        </div>
      )}
    </div>
  );
}
