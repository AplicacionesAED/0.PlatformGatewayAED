import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { coincide, normalizar } from './datos.jsx';
import s from './Admin.module.css';

const MAXIMO = 8;

// Buscador para elegir UNA persona (agregar a un equipo, dar una app, filtrar la auditoria). Los resultados se muestran
// debajo, en el flujo de la pagina, asi funciona igual dentro de un panel o un dialogo.
export default function BuscarPersona({ personas, excluir, onElegir, etiqueta = 'Buscar persona', placeholder = 'Buscar por nombre o correo…' }) {
  const [q, setQ] = useState('');
  const id = useId();

  const resultados = useMemo(() => {
    const n = normalizar(q.trim());
    if (!n) return [];
    return personas.filter((p) => !excluir?.has(p.id) && coincide(n, p.nombre, p.email)).slice(0, MAXIMO);
  }, [q, personas, excluir]);

  return (
    <div className={s.buscarPersona}>
      <label className={`${s.buscador} ${s.buscadorBloque}`}>
        <Search size={18} aria-hidden="true" />
        <input type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={etiqueta} aria-controls={id} />
      </label>
      {q.trim() && (
        <ul id={id} className={s.resultados} aria-label="Resultados de la búsqueda">
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={s.resultado}
                onClick={() => {
                  onElegir(p);
                  setQ('');
                }}
              >
                <strong>{p.nombre}</strong>
                <span className={s.sub}>{p.email}{p.activo ? '' : ' · inactiva'}</span>
              </button>
            </li>
          ))}
          {resultados.length === 0 && <li className={s.sinResultados}>Nadie coincide (o ya está agregada).</li>}
        </ul>
      )}
    </div>
  );
}
