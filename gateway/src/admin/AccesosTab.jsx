import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, Cargando } from '../components/ui.jsx';
import { useCarga } from './useCarga.js';
import s from './Admin.module.css';

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Matriz de accesos: filas = equipos y personas, columnas = apps. La casilla es el acceso DIRECTO; en una persona, el icono de
// equipo indica que ya tiene esa app por pertenecer a un equipo (se quita desde el equipo, no desde la persona).
export default function AccesosTab() {
  const { datos, cargando, error, recargar } = useCarga('/accesos/matriz');
  const [busqueda, setBusqueda] = useState('');
  const [pendientes, setPendientes] = useState(() => new Set());
  const [errorAccion, setErrorAccion] = useState(null);

  const mapas = useMemo(() => {
    if (!datos) return null;
    const directoUsuario = new Map(); // `${usuario}:${app}` -> id del acceso
    const directoEquipo = new Map();
    const appsDeEquipo = new Map(); // equipo -> Set de apps
    for (const a of datos.accesos) {
      if (a.usuario_id != null) directoUsuario.set(`${a.usuario_id}:${a.app_id}`, a.id);
      else {
        directoEquipo.set(`${a.equipo_id}:${a.app_id}`, a.id);
        if (!appsDeEquipo.has(a.equipo_id)) appsDeEquipo.set(a.equipo_id, new Set());
        appsDeEquipo.get(a.equipo_id).add(a.app_id);
      }
    }
    return { directoUsuario, directoEquipo, appsDeEquipo };
  }, [datos]);

  const personas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return (datos?.usuarios ?? []).filter((u) => !q || normalizar(`${u.nombre} ${u.email}`).includes(q));
  }, [datos, busqueda]);

  async function alternar({ clave, appId, usuarioId, equipoId, accesoId }) {
    setErrorAccion(null);
    setPendientes((p) => new Set(p).add(clave));
    try {
      if (accesoId) await api.delete(`/accesos/${accesoId}`);
      else await api.post('/accesos', { appId, ...(usuarioId ? { usuarioId } : { equipoId }) });
      await recargar();
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setPendientes((p) => {
        const n = new Set(p);
        n.delete(clave);
        return n;
      });
    }
  }

  if (cargando && !datos) return <Cargando />;
  if (!datos) return <Aviso>{error}</Aviso>;

  const apps = datos.apps;
  const viaEquipos = (u, appId) => u.equipos.filter((e) => mapas.appsDeEquipo.get(e.id)?.has(appId)).map((e) => e.nombre);

  return (
    <section aria-label="Accesos">
      <div className={s.barraHerramientas}>
        <p className={s.sub}>Marca las aplicaciones a las que entra cada equipo o persona. Los cambios se guardan al instante.</p>
        <label className={s.buscador}>
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="Buscar persona…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar persona" />
        </label>
      </div>

      {(error || errorAccion) && <Aviso>{errorAccion || error}</Aviso>}

      <div className={s.tablaCaja}>
        <table className={`${s.tabla} ${s.matriz}`}>
          <thead>
            <tr>
              <th scope="col">Equipo / persona</th>
              {apps.map((a) => (
                <th key={a.id} scope="col" className={s.celdaApp}>
                  {a.nombre}
                  {!a.activa && <span className={s.sub}>Inactiva</span>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr className={s.grupo}>
              <th scope="rowgroup" colSpan={apps.length + 1}>Equipos</th>
            </tr>
            {datos.equipos.length === 0 && (
              <tr>
                <td colSpan={apps.length + 1} className={s.vacio}>Aún no hay equipos.</td>
              </tr>
            )}
            {datos.equipos.map((e) => (
              <tr key={`e${e.id}`}>
                <th scope="row">
                  <Users size={15} aria-hidden="true" /> {e.nombre}
                </th>
                {apps.map((a) => {
                  const clave = `e${e.id}:${a.id}`;
                  const accesoId = mapas.directoEquipo.get(`${e.id}:${a.id}`);
                  return (
                    <td key={a.id} className={s.celdaCheck}>
                      <input
                        type="checkbox"
                        checked={Boolean(accesoId)}
                        disabled={pendientes.has(clave)}
                        aria-label={`${a.nombre} para el equipo ${e.nombre}`}
                        onChange={() => alternar({ clave, appId: a.id, equipoId: e.id, accesoId })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr className={s.grupo}>
              <th scope="rowgroup" colSpan={apps.length + 1}>Personas</th>
            </tr>
            {personas.map((u) => (
              <tr key={`u${u.id}`} className={u.activo ? undefined : s.inactiva}>
                <th scope="row">
                  {u.nombre}
                  <span className={s.sub}>{u.email}{u.activo ? '' : ' · inactiva'}</span>
                </th>
                {apps.map((a) => {
                  const clave = `u${u.id}:${a.id}`;
                  const accesoId = mapas.directoUsuario.get(`${u.id}:${a.id}`);
                  const via = viaEquipos(u, a.id);
                  return (
                    <td key={a.id} className={s.celdaCheck}>
                      <input
                        type="checkbox"
                        checked={Boolean(accesoId)}
                        disabled={pendientes.has(clave)}
                        aria-label={`${a.nombre} para ${u.nombre}`}
                        onChange={() => alternar({ clave, appId: a.id, usuarioId: u.id, accesoId })}
                      />
                      {via.length > 0 && (
                        <span className={s.via} title={`Por equipo: ${via.join(', ')}`} aria-label={`También por equipo: ${via.join(', ')}`}>
                          <Users size={13} aria-hidden="true" />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {personas.length === 0 && (
              <tr>
                <td colSpan={apps.length + 1} className={s.vacio}>{busqueda ? 'Ninguna persona coincide con la búsqueda.' : 'Aún no hay personas.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
