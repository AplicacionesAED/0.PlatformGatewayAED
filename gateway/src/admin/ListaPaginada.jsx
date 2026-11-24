import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { BotonIcono } from '../components/ui.jsx';
import { coincide, normalizar } from './datos.jsx';
import s from './Admin.module.css';

// Lista de personas dentro de una ficha (accesos directos de una app, miembros de un equipo): con cientos de filas
// (RR.HH. tiene ~700) se busca y se pagina en vez de dibujarlas todas. `renderFila(item)` devuelve el <li>.
export default function ListaPaginada({ items, renderFila, textoDe, porPagina = 15, etiqueta, vacio }) {
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    const n = normalizar(q.trim());
    return n ? items.filter((it) => coincide(n, textoDe(it))) : items;
  }, [items, q, textoDe]);

  if (items.length === 0) return <p className={s.sub}>{vacio}</p>;

  const total = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const actual = Math.min(pagina, total);
  const visibles = filtrados.slice((actual - 1) * porPagina, actual * porPagina);

  return (
    <div className={s.listaPaginada}>
      {items.length > porPagina && (
        <label className={`${s.buscador} ${s.buscadorBloque}`}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder={`Buscar entre ${items.length}…`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPagina(1);
            }}
            aria-label={`Buscar en ${etiqueta}`}
          />
        </label>
      )}
      {visibles.length === 0 ? <p className={s.sub}>Nadie coincide con la búsqueda.</p> : <ul className={s.listaFilas}>{visibles.map(renderFila)}</ul>}
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
