import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, BotonIcono, Button, Campo, Cargando, Insignia, Modal } from '../components/ui.jsx';
import { useCarga } from './useCarga.js';
import s from './Admin.module.css';

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
      if (equipo) await api.patch(`/equipos/${equipo.id}`, { nombre, descripcion: descripcion || null });
      else await api.post('/equipos', { nombre, descripcion: descripcion || null });
      onGuardado();
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

// Reemplaza la lista completa de miembros: lo que se marca aqui es el resultado final.
function ModalMiembros({ equipo, abierto, onCerrar, onGuardado }) {
  const { datos: personas, cargando } = useCarga('/usuarios');
  const [marcados, setMarcados] = useState(() => new Set(equipo.miembros.map((m) => m.id)));
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return (personas ?? []).filter((p) => !q || normalizar(`${p.nombre} ${p.email}`).includes(q));
  }, [personas, busqueda]);

  const alternar = (id) =>
    setMarcados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  async function guardar() {
    setError(null);
    setEnviando(true);
    try {
      await api.put(`/equipos/${equipo.id}/miembros`, { usuarioIds: [...marcados] });
      onGuardado();
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
      titulo={`Miembros de ${equipo.nombre}`}
      ancho={560}
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button cargando={enviando} onClick={guardar}>Guardar ({marcados.size})</Button>
        </>
      }
    >
      <label className={`${s.buscador} ${s.buscadorBloque}`}>
        <Search size={18} aria-hidden="true" />
        <input type="search" placeholder="Buscar persona…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar persona" />
      </label>
      {cargando ? (
        <Cargando />
      ) : (
        <ul className={s.listaMarcar}>
          {visibles.map((p) => (
            <li key={p.id}>
              <label className={s.casilla}>
                <input type="checkbox" checked={marcados.has(p.id)} onChange={() => alternar(p.id)} />
                <span>
                  <strong>{p.nombre}</strong>
                  <span className={s.sub}>{p.email}{p.activo ? '' : ' · inactiva'}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <Aviso>{error}</Aviso>}
    </Modal>
  );
}

export default function EquiposTab() {
  const { datos, cargando, error, recargar } = useCarga('/equipos');
  const [formulario, setFormulario] = useState(null); // { equipo? }
  const [miembros, setMiembros] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  async function eliminar() {
    setEliminando(true);
    setErrorAccion(null);
    try {
      await api.delete(`/equipos/${aEliminar.id}`);
      setAEliminar(null);
      await recargar();
    } catch (err) {
      setErrorAccion(err.message);
      setAEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  if (cargando && !datos) return <Cargando />;

  return (
    <section aria-label="Equipos">
      <div className={s.barraHerramientas}>
        <p className={s.sub}>Un equipo agrupa personas para darles acceso a aplicaciones de una vez. Solo existe en este portal.</p>
        <Button icono={Plus} onClick={() => setFormulario({})}>Nuevo equipo</Button>
      </div>

      {(error || errorAccion) && <Aviso>{errorAccion || error}</Aviso>}

      {datos?.length === 0 && <p className={s.vacio}>Aún no hay equipos.</p>}
      <div className={s.tarjetas}>
        {(datos ?? []).map((e) => (
          <article key={e.id} className={s.tarjetaEquipo}>
            <header>
              <h2>{e.nombre}</h2>
              <div className={s.acciones}>
                <BotonIcono icono={Pencil} etiqueta={`Editar ${e.nombre}`} onClick={() => setFormulario({ equipo: e })} />
                <BotonIcono icono={Trash2} peligro etiqueta={`Eliminar ${e.nombre}`} onClick={() => setAEliminar(e)} />
              </div>
            </header>
            {e.descripcion && <p className={s.sub}>{e.descripcion}</p>}
            <div className={s.insignias}>
              {e.miembros.slice(0, 6).map((m) => (
                <Insignia key={m.id}>{m.nombre}</Insignia>
              ))}
              {e.miembros.length > 6 && <Insignia>+{e.miembros.length - 6}</Insignia>}
              {e.miembros.length === 0 && <span className={s.sub}>Sin miembros</span>}
            </div>
            <Button variante="secundario" icono={Users} onClick={() => setMiembros(e)}>
              Miembros ({e.miembros.length})
            </Button>
          </article>
        ))}
      </div>

      {formulario && (
        <ModalEquipo
          key={formulario.equipo?.id ?? 'nuevo'}
          equipo={formulario.equipo}
          abierto
          onCerrar={() => setFormulario(null)}
          onGuardado={() => {
            setFormulario(null);
            recargar();
          }}
        />
      )}
      {miembros && (
        <ModalMiembros
          key={miembros.id}
          equipo={miembros}
          abierto
          onCerrar={() => setMiembros(null)}
          onGuardado={() => {
            setMiembros(null);
            recargar();
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
