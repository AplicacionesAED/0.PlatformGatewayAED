import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, BotonIcono, Button, Cargando } from '../components/ui.jsx';
import BuscarPersona from './BuscarPersona.jsx';
import { ACCIONES, describir } from './auditoriaTexto.js';
import { useAbrirPersona, useDatos } from './datos.jsx';
import { formatoFecha } from './useCarga.js';
import s from './Admin.module.css';

const LIMITE = 50;

// Los filtros viven en la URL (?accion=&usuario=&desde=&hasta=): la ficha de persona enlaza aqui con su filtro puesto.
export default function AuditoriaTab() {
  const ix = useDatos();
  const abrirPersona = useAbrirPersona();
  const [params, setParams] = useSearchParams();
  const accion = params.get('accion') ?? '';
  const usuario = params.get('usuario') ?? '';
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const [offset, setOffset] = useState(0);
  const [estado, setEstado] = useState({ filas: [], total: 0, cargando: true, error: null });

  const fijar = (clave, valor) => {
    setOffset(0);
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (valor) n.set(clave, String(valor));
      else n.delete(clave);
      return n;
    });
  };

  useEffect(() => {
    let vigente = true;
    const q = new URLSearchParams({ limit: String(LIMITE), offset: String(offset) });
    if (accion) q.set('accion', accion);
    if (usuario) q.set('usuarioId', usuario);
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    setEstado((e) => ({ ...e, cargando: true }));
    api
      .pagina(`/auditoria?${q}`)
      .then(({ data, meta }) => vigente && setEstado({ filas: data, total: meta.total ?? 0, cargando: false, error: null }))
      .catch((err) => vigente && setEstado((e) => ({ ...e, cargando: false, error: err.message })));
    return () => {
      vigente = false;
    };
  }, [accion, usuario, desde, hasta, offset]);

  const desdeN = estado.total === 0 ? 0 : offset + 1;
  const hastaN = Math.min(offset + LIMITE, estado.total);
  const persona = usuario ? ix.personaPorId?.get(Number(usuario)) : null;
  const hayFiltros = accion || usuario || desde || hasta;

  return (
    <section aria-label="Auditoría">
      <div className={s.filtrosAuditoria}>
        <label className={s.filtro}>
          <span>Acción</span>
          <select value={accion} onChange={(e) => fijar('accion', e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([valor, nombre]) => (
              <option key={valor} value={valor}>{nombre}</option>
            ))}
          </select>
        </label>
        <label className={s.filtro}>
          <span>Desde</span>
          <input type="date" value={desde} max={hasta || undefined} onChange={(e) => fijar('desde', e.target.value)} />
        </label>
        <label className={s.filtro}>
          <span>Hasta</span>
          <input type="date" value={hasta} min={desde || undefined} onChange={(e) => fijar('hasta', e.target.value)} />
        </label>
        <div className={s.filtroPersona}>
          {usuario ? (
            <span className={s.personaElegida}>
              Persona: <strong>{persona?.nombre ?? `#${usuario}`}</strong>
              <BotonIcono icono={X} etiqueta="Quitar el filtro de persona" onClick={() => fijar('usuario', '')} />
            </span>
          ) : (
            <BuscarPersona personas={ix.datos?.usuarios ?? []} etiqueta="Filtrar por persona" placeholder="Filtrar por persona…" onElegir={(p) => fijar('usuario', p.id)} />
          )}
        </div>
        {hayFiltros && (
          <Button variante="secundario" onClick={() => { setOffset(0); setParams({}); }}>
            Quitar filtros
          </Button>
        )}
      </div>

      <div className={s.barraHerramientas}>
        <p className={s.sub}>{usuario ? 'Lo que hizo la persona y lo que se hizo sobre ella (su cuenta, sus accesos y sus equipos).' : 'Cambios de administración e inicios de sesión.'}</p>
        <div className={s.paginacion}>
          <span aria-live="polite">{desdeN}–{hastaN} de {estado.total}</span>
          <Button variante="secundario" icono={ChevronLeft} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMITE))} aria-label="Página anterior" />
          <Button variante="secundario" icono={ChevronRight} disabled={hastaN >= estado.total} onClick={() => setOffset(offset + LIMITE)} aria-label="Página siguiente" />
        </div>
      </div>

      {estado.error && <Aviso>{estado.error}</Aviso>}
      {estado.cargando && estado.filas.length === 0 ? (
        <Cargando />
      ) : (
        <div className={s.tablaCaja}>
          <table className={s.tabla}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Quién</th>
                <th scope="col">Acción</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {estado.filas.map((f) => (
                <tr key={f.id}>
                  <td className={s.nowrap}>{formatoFecha(f.creado_en)}</td>
                  <td>
                    {f.actor ? (
                      <>
                        <button type="button" className={s.nombreBoton} onClick={() => abrirPersona(f.actor_id)}>{f.actor.nombre}</button>
                        <span className={s.sub}>{f.actor.email}</span>
                      </>
                    ) : (
                      <span className={s.sub}>—</span>
                    )}
                  </td>
                  <td>{ACCIONES[f.accion] ?? f.accion}</td>
                  <td className={s.detalle}>
                    {describir(f, ix)}
                    {f.ip ? <span className={s.sub}>IP {f.ip}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {estado.filas.length === 0 && <p className={s.vacio}>No hay registros.</p>}
        </div>
      )}
    </section>
  );
}
