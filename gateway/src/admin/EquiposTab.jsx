import { useMemo, useState } from 'react';
import { ChevronRight, UserPlus, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, BotonIcono, Button, Campo, Cargando, Modal } from '../components/ui.jsx';
import BuscarPersona from './BuscarPersona.jsx';
import ListaPaginada from './ListaPaginada.jsx';

const textoPersona = (m) => `${m.nombre} ${m.email}`;
import { fijarMiembros, useAbrirPersona, useDatos } from './datos.jsx';
import { Avatar, IconoApp, IconoEquipo, MiniApp, colorApp, colorDe } from './colores.jsx';
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

  // Vista previa en vivo de como se vera el equipo (iniciales y color; uno nuevo toma su color definitivo al crearse).
  const vista = { id: equipo?.id ?? 0, nombre: nombre.trim() || 'Nuevo equipo' };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      icono={equipo ? Pencil : Users}
      titulo={equipo ? 'Editar equipo' : 'Nuevo equipo'}
      descripcion="Un equipo agrupa personas para darles acceso a varias aplicaciones de una vez."
      ancho={540}
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-equipo" icono={equipo ? undefined : Plus} cargando={enviando} disabled={!nombre.trim()}>
            {equipo ? 'Guardar cambios' : 'Crear equipo'}
          </Button>
        </>
      }
    >
      <form id="form-equipo" onSubmit={guardar} className={s.formulario} noValidate>
        <div className={s.vistaPrevia} style={{ '--c': colorDe(vista.id) }} aria-hidden="true">
          <IconoEquipo equipo={vista} grande />
          <div>
            <strong>{vista.nombre}</strong>
            <span className={s.sub}>{descripcion.trim() || 'Sin descripción'}</span>
            <span className={s.sub}>{equipo ? `${equipo.miembros.length} ${equipo.miembros.length === 1 ? 'miembro' : 'miembros'}` : 'Así se verá en la lista de equipos'}</span>
          </div>
        </div>
        <Campo etiqueta="Nombre" ayuda="Corto y claro: por área, obra o función (p. ej. Contabilidad, Obra Kristal Blu).">
          {(id, aria) => <input id={id} {...aria} type="text" required maxLength={120} data-autofocus value={nombre} onChange={(e) => setNombre(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Descripción (opcional)" ayuda={`${descripcion.length}/500`}>
          {(id, aria) => <textarea id={id} {...aria} rows={3} maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
        </Campo>
        {!equipo && <Aviso tipo="info">Al crearlo se abre su ficha para darle aplicaciones y agregar miembros.</Aviso>}
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
  const ordenados = useMemo(() => [...equipo.miembros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [equipo.miembros]);

  return (
    <Modal abierto onCerrar={onCerrar} titulo={equipo.nombre} ancho={760} lateral>
      <div className={s.fichaHero} style={{ '--c': colorDe(equipo.id) }}>
        <IconoEquipo equipo={equipo} grande />
        <div className={s.fichaHeroTexto}>
          <span className={s.fichaHeroCifra}>{equipo.miembros.length}</span>
          <span className={s.fichaHeroDato}>{equipo.miembros.length === 1 ? 'miembro' : 'miembros'}{equipo.descripcion ? ` · ${equipo.descripcion}` : ''}</span>
        </div>
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
            <li key={a.id} className={ix.deEquipo.get(equipo.id)?.has(a.id) ? s.appConAcceso : undefined} style={{ '--c': colorApp(a) }}>
              <label className={s.casilla}>
                <input type="checkbox" checked={Boolean(ix.deEquipo.get(equipo.id)?.has(a.id))} disabled={pendientes.has(a.id)} onChange={() => alternarApp(a)} />
                <IconoApp app={a} tam={16} />
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
          placeholder="Agregar una persona al equipo…"
          icono={UserPlus}
          onElegir={(p) => tras(fijarMiembros(equipo, [...ids, p.id]))}
        />
        <ListaPaginada
          items={ordenados}
          etiqueta={`los miembros de ${equipo.nombre}`}
          vacio="Sin miembros."
          textoDe={textoPersona}
          renderFila={(m) => {
            const u = ix.personaPorId.get(m.id);
            return (
              <li key={m.id} className={u?.activo === false ? s.inactiva : undefined}>
                <div className={s.personaCelda}>
                  <Avatar nombre={m.nombre} />
                  <span>
                    <button type="button" className={s.nombreBoton} onClick={() => abrirPersona(m.id)}>{m.nombre}</button>
                    <span className={s.sub}>{m.email}{u?.activo === false ? ' · inactiva' : ''}</span>
                  </span>
                </div>
                <BotonIcono icono={X} etiqueta={`Sacar a ${m.nombre} de ${equipo.nombre}`} onClick={() => tras(fijarMiembros(equipo, ids.filter((id) => id !== m.id)))} />
              </li>
            );
          }}
        />
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
      {/* Filas compactas: identidad a la izquierda, apps al centro y miembros a la derecha; una linea de alto. */}
      <div className={s.filasEquipo}>
        {equipos.map((e) => {
          const apps = [...(ix.deEquipo.get(e.id)?.keys() ?? [])].map((id) => ix.appPorId.get(id)).filter(Boolean);
          return (
            <button key={e.id} type="button" className={s.filaEquipo} style={{ '--c': colorDe(e.id) }} onClick={() => setAbierto(e.id)}>
              <IconoEquipo equipo={e} />
              <span className={s.filaEquipoTexto}>
                <strong>{e.nombre}</strong>
                <span className={s.sub}>{e.descripcion || 'Sin descripción'}</span>
              </span>
              <span className={s.filaEquipoApps} aria-label={apps.length ? `Aplicaciones: ${apps.map((a) => a.nombre).join(', ')}` : 'Sin aplicaciones'}>
                {apps.length ? apps.map((a) => <MiniApp key={a.id} app={a} />) : <span className={s.ninguna}>Sin aplicaciones</span>}
              </span>
              <span className={s.filaEquipoMiembros}>
                <span className={s.pilaAvatares} aria-hidden="true">
                  {e.miembros.slice(0, 4).map((m) => (
                    <Avatar key={m.id} nombre={m.nombre} />
                  ))}
                  {e.miembros.length > 4 && <span className={s.avatarMas}>+{e.miembros.length - 4}</span>}
                </span>
                <span className={s.filaEquipoCifra}>
                  <strong>{e.miembros.length}</strong> {e.miembros.length === 1 ? 'miembro' : 'miembros'}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" className={s.filaEquipoFlecha} />
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
        icono={Trash2}
        tono="peligro"
        descripcion="Esta acción no se puede deshacer."
        pie={
          <>
            <Button variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Button>
            <Button variante="peligro" icono={Trash2} cargando={eliminando} onClick={eliminar}>Eliminar equipo</Button>
          </>
        }
      >
        <p>
          Sus {aEliminar?.miembros.length ?? 0} {aEliminar?.miembros.length === 1 ? 'miembro pierde' : 'miembros pierden'} las aplicaciones que este equipo les daba (las que tengan directas o por otros equipos las conservan).
        </p>
      </Modal>
    </section>
  );
}
