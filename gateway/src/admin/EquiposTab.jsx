import { useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, BotonIcono, Button, Campo, Cargando, Insignia, Modal } from '../components/ui.jsx';
import BuscarPersona from './BuscarPersona.jsx';
import { fijarMiembros, useAbrirPersona, useDatos } from './datos.jsx';
import s from './Admin.module.css';

function ModalEquipo({ equipo, abierto, onCerrar, onGuardado }) {
  const [nombre, setNombre] = useState(equipo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(equipo?.descripcion ?? '');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = equipo ? await api.patch(`/equipos/${equipo.id}`, { nombre, descripcion: descripcion || null }) : await api.post('/equipos', { nombre, descripcion: descripcion || null });
      onGuardado(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={equipo ? 'Editar equipo' : 'Nuevo equipo'}
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-equipo" cargando={enviando} disabled={!nombre.trim()}>Guardar</Button>
        </>
      }
    >
      <form id="form-equipo" onSubmit={guardar} className={s.formulario} noValidate>
        <Campo etiqueta="Nombre">
          {(id, aria) => <input id={id} {...aria} type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Descripción (opcional)">
          {(id, aria) => <textarea id={id} {...aria} rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
        </Campo>
        {error && <Aviso>{error}</Aviso>}
      </form>
    </Modal>
  );
}

// Todo lo de un equipo: sus aplicaciones y sus miembros (se agregan de a uno con el buscador).
function FichaEquipo({ equipo, onCerrar, onEditar, onEliminar }) {
  const ix = useDatos();
  const abrirPersona = useAbrirPersona();
  const [error, setError] = useState(null);
  const [pendientes, setPendientes] = useState(() => new Set());

  async function tras(promesa) {
    setError(null);
    try {
      await promesa;
      await ix.recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function alternarApp(app) {
    const accesoId = ix.deEquipo.get(equipo.id)?.get(app.id);
    setPendientes((x) => new Set(x).add(app.id));
    await tras(accesoId ? api.delete(`/accesos/${accesoId}`) : api.post('/accesos', { appId: app.id, equipoId: equipo.id }));
    setPendientes((x) => {
      const n = new Set(x);
      n.delete(app.id);
      return n;
    });
  }

  const ids = equipo.miembros.map((m) => m.id);
  const miembros = new Set(ids);

  return (
    <Modal abierto onCerrar={onCerrar} titulo={equipo.nombre} ancho={560} lateral>
      <div className={s.fichaCabecera}>
        {equipo.descripcion && <p className={s.sub}>{equipo.descripcion}</p>}
      </div>
      <div className={s.fichaAcciones}>
        <Button variante="secundario" icono={Pencil} onClick={onEditar}>Editar</Button>
        <Button variante="secundario" icono={Trash2} onClick={onEliminar}>Eliminar equipo</Button>
      </div>
      {error && <Aviso>{error}</Aviso>}

      <section className={s.fichaSeccion} aria-labelledby="equipo-apps">
        <h3 id="equipo-apps">Aplicaciones</h3>
        <p className={s.sub}>Todos los miembros entran a las aplicaciones marcadas.</p>
        <ul className={s.listaApps}>
          {(ix.datos?.apps ?? []).map((a) => (
            <li key={a.id}>
              <label className={s.casilla}>
                <input type="checkbox" checked={Boolean(ix.deEquipo.get(equipo.id)?.has(a.id))} disabled={pendientes.has(a.id)} onChange={() => alternarApp(a)} />
                <span>
                  {a.nombre}
                  {!a.activa && <span className={s.sub}>Aplicación inactiva</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.fichaSeccion} aria-labelledby="equipo-miembros">
        <h3 id="equipo-miembros">Miembros ({equipo.miembros.length})</h3>
        <BuscarPersona
          personas={ix.datos?.usuarios ?? []}
          excluir={miembros}
          etiqueta={`Buscar persona para agregar a ${equipo.nombre}`}
          placeholder="Agregar una persona…"
          onElegir={(p) => tras(fijarMiembros(equipo, [...ids, p.id]))}
        />
        {equipo.miembros.length === 0 ? (
          <p className={s.sub}>Sin miembros.</p>
        ) : (
          <ul className={s.listaFilas}>
            {[...equipo.miembros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((m) => {
              const u = ix.personaPorId.get(m.id);
              return (
                <li key={m.id} className={u?.activo === false ? s.inactiva : undefined}>
                  <span>
                    <button type="button" className={s.nombreBoton} onClick={() => abrirPersona(m.id)}>{m.nombre}</button>
                    <span className={s.sub}>{m.email}{u?.activo === false ? ' · inactiva' : ''}</span>
                  </span>
                  <BotonIcono icono={X} etiqueta={`Sacar a ${m.nombre} de ${equipo.nombre}`} onClick={() => tras(fijarMiembros(equipo, ids.filter((id) => id !== m.id)))} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Modal>
  );
}

export default function EquiposTab() {
  const ix = useDatos();
  const [formulario, setFormulario] = useState(null); // { equipo? }
  const [abierto, setAbierto] = useState(null); // id
  const [aEliminar, setAEliminar] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  async function eliminar() {
    setEliminando(true);
    setErrorAccion(null);
    try {
      await api.delete(`/equipos/${aEliminar.id}`);
      setAEliminar(null);
      setAbierto(null);
      await ix.recargar();
    } catch (err) {
      setErrorAccion(err.message);
      setAEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  if (ix.cargando && !ix.datos) return <Cargando />;
  const equipos = ix.datos?.equipos ?? [];
  const equipo = abierto != null ? ix.equipoPorId.get(abierto) : null;

  return (
    <section aria-label="Equipos">
      <div className={s.barraHerramientas}>
        <p className={s.sub}>Un equipo agrupa personas para darles acceso a aplicaciones de una vez. Solo existe en este portal.</p>
        <Button icono={Plus} onClick={() => setFormulario({})}>Nuevo equipo</Button>
      </div>

      {(ix.error || errorAccion) && <Aviso>{errorAccion || ix.error}</Aviso>}

      {equipos.length === 0 && <p className={s.vacio}>Aún no hay equipos.</p>}
      <div className={s.tarjetas}>
        {equipos.map((e) => {
          const apps = [...(ix.deEquipo.get(e.id)?.keys() ?? [])].map((id) => ix.appPorId.get(id)).filter(Boolean);
          return (
            <button key={e.id} type="button" className={`${s.tarjeta} ${s.tarjetaBoton}`} onClick={() => setAbierto(e.id)}>
              <span className={s.tarjetaTitulo}>
                {e.nombre}
                <ChevronRight size={18} aria-hidden="true" />
              </span>
              {e.descripcion && <span className={s.sub}>{e.descripcion}</span>}
              <span className={s.cifra}>
                {e.miembros.length} <span className={s.sub}>{e.miembros.length === 1 ? 'miembro' : 'miembros'}</span>
              </span>
              <span className={s.insignias}>
                {apps.length ? apps.map((a) => <Insignia key={a.id}>{a.nombre}</Insignia>) : <span className={s.sub}>Sin aplicaciones</span>}
              </span>
            </button>
          );
        })}
      </div>

      {equipo && (
        <FichaEquipo
          key={equipo.id}
          equipo={equipo}
          onCerrar={() => setAbierto(null)}
          onEditar={() => setFormulario({ equipo })}
          onEliminar={() => setAEliminar(equipo)}
        />
      )}
      {formulario && (
        <ModalEquipo
          key={formulario.equipo?.id ?? 'nuevo'}
          equipo={formulario.equipo}
          abierto
          onCerrar={() => setFormulario(null)}
          onGuardado={(r) => {
            setFormulario(null);
            // Un equipo nuevo se abre de una vez para darle aplicaciones y miembros.
            if (!formulario.equipo && r?.id) setAbierto(r.id);
            ix.recargar();
          }}
        />
      )}
      <Modal
        abierto={Boolean(aEliminar)}
        onCerrar={() => setAEliminar(null)}
        titulo={`Eliminar ${aEliminar?.nombre ?? ''}`}
        pie={
          <>
            <Button variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Button>
            <Button variante="peligro" cargando={eliminando} onClick={eliminar}>Eliminar equipo</Button>
          </>
        }
      >
        <p>Sus miembros perderán las aplicaciones que este equipo les daba. No se puede deshacer.</p>
      </Modal>
    </section>
  );
}
