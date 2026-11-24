// Acciones sobre varias personas a la vez dentro de las fichas de equipo y de aplicacion. Cada una muestra su efecto antes de
// confirmar (quien pierde que) y se aplica con las operaciones del servicio (miembros del equipo de una vez; accesos de a uno).
import { useMemo, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, ClipboardList, UserMinus, Users } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, Button, Campo, Modal } from '../components/ui.jsx';
import { Avatar, MiniApp } from './colores.jsx';
import { PersonasResumen } from './Impacto.jsx';
import { fijarMiembros, quitarAccesos, useDatos } from './datos.jsx';
import s from './Admin.module.css';

const MAX = 6;

// Personas con las apps que pierden (o "conserva todo").
function ListaConApps({ filas }) {
  return (
    <ul className={s.resumenPersonas}>
      {filas.slice(0, MAX).map(({ persona, apps }) => (
        <li key={persona.id}>
          <Avatar nombre={persona.nombre} />
          <span>{persona.nombre}</span>
          <span className={s.miniApps}>{apps.length ? apps.map((a) => <MiniApp key={a.id} app={a} />) : <span className={s.ninguna}>Conserva todo</span>}</span>
        </li>
      ))}
      {filas.length > MAX && <li className={s.sub}>y {filas.length - MAX} más</li>}
    </ul>
  );
}

// Dialogo comun: ejecuta `accion` y muestra el resultado o el error.
function DialogoLote({ titulo, icono, tono, descripcion, boton, deshabilitar, accion, onCerrar, children }) {
  const ix = useDatos();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const [hecho, setHecho] = useState(null);

  async function ejecutar() {
    setTrabajando(true);
    setError(null);
    try {
      setHecho(await accion());
      await ix.recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Modal
      abierto
      onCerrar={trabajando ? () => {} : onCerrar}
      icono={icono}
      tono={tono}
      titulo={titulo}
      descripcion={descripcion}
      ancho={580}
      pie={
        hecho ? (
          <Button icono={CheckCircle2} onClick={onCerrar}>Listo</Button>
        ) : (
          <>
            <Button variante="secundario" disabled={trabajando} onClick={onCerrar}>Cancelar</Button>
            <Button variante={tono === 'peligro' ? 'peligro' : 'primario'} icono={icono} cargando={trabajando} disabled={deshabilitar} onClick={ejecutar}>
              {boton}
            </Button>
          </>
        )
      }
    >
      {hecho ? <Aviso tipo="ok">{hecho}</Aviso> : children}
      {error && <Aviso>{error}</Aviso>}
    </Modal>
  );
}

// Equipo: sacar a las personas seleccionadas, mostrando que apps pierde cada una.
export function QuitarMiembros({ equipo, personas, onCerrar, onHecho }) {
  const ix = useDatos();
  const filas = personas.map((p) => ({ persona: p, apps: ix.pierdeAlSalir(equipo, p) }));
  const pierden = filas.filter((f) => f.apps.length).length;
  return (
    <DialogoLote
      titulo={`Sacar ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'} de ${equipo.nombre}`}
      icono={UserMinus}
      tono={pierden ? 'peligro' : undefined}
      descripcion={pierden ? `${pierden} ${pierden === 1 ? 'pierde aplicaciones' : 'pierden aplicaciones'} que solo les daba este equipo.` : 'Nadie pierde aplicaciones: las tienen por otro camino.'}
      boton="Sacar del equipo"
      onCerrar={onCerrar}
      accion={async () => {
        const fuera = new Set(personas.map((p) => p.id));
        await fijarMiembros(equipo, equipo.miembros.map((m) => m.id).filter((id) => !fuera.has(id)));
        onHecho?.();
        return `${personas.length} ${personas.length === 1 ? 'persona salió' : 'personas salieron'} de ${equipo.nombre}.`;
      }}
    >
      <ListaConApps filas={filas} />
    </DialogoLote>
  );
}

// Equipo: copiar (quedan en los dos) o mover (salen de este) a otro equipo.
export function MoverMiembros({ equipo, personas, onCerrar, onHecho }) {
  const ix = useDatos();
  const otros = ix.datos.equipos.filter((e) => e.id !== equipo.id);
  const [destinoId, setDestinoId] = useState(String(otros[0]?.id ?? ''));
  const [modo, setModo] = useState('copiar');
  const destino = ix.equipoPorId.get(Number(destinoId));
  const filas = destino && modo === 'mover' ? personas.map((p) => ({ persona: p, apps: ix.pierdeAlSalir(equipo, p, destino) })) : [];
  const pierden = filas.filter((f) => f.apps.length).length;

  if (!otros.length) {
    return (
      <Modal abierto onCerrar={onCerrar} icono={ArrowRightLeft} titulo="Mover o copiar a otro equipo" pie={<Button onClick={onCerrar}>Entendido</Button>}>
        <p>No hay otro equipo. Crea uno primero en la pestaña Equipos.</p>
      </Modal>
    );
  }

  return (
    <DialogoLote
      titulo={`${modo === 'mover' ? 'Mover' : 'Copiar'} ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'}`}
      icono={ArrowRightLeft}
      tono={pierden ? 'peligro' : undefined}
      descripcion={modo === 'mover' ? `Entran a ${destino?.nombre ?? 'otro equipo'} y salen de ${equipo.nombre}.` : `Entran también a ${destino?.nombre ?? 'otro equipo'}; siguen en ${equipo.nombre}.`}
      boton={modo === 'mover' ? 'Mover' : 'Copiar'}
      deshabilitar={!destino}
      onCerrar={onCerrar}
      accion={async () => {
        const ids = personas.map((p) => p.id);
        await fijarMiembros(destino, [...destino.miembros.map((m) => m.id), ...ids]);
        if (modo === 'mover') {
          const fuera = new Set(ids);
          await fijarMiembros(equipo, equipo.miembros.map((m) => m.id).filter((id) => !fuera.has(id)));
        }
        onHecho?.();
        return `${ids.length} ${ids.length === 1 ? 'persona' : 'personas'} ${modo === 'mover' ? 'movidas' : 'copiadas'} a ${destino.nombre}.`;
      }}
    >
      <div className={s.formulario}>
        <Campo etiqueta="Equipo de destino">
          {(id, aria) => (
            <select id={id} {...aria} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
              {otros.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          )}
        </Campo>
        <div className={s.segmento} role="radiogroup" aria-label="Copiar o mover">
          {[
            ['copiar', 'Copiar', 'Quedan en los dos equipos'],
            ['mover', 'Mover', `Salen de ${equipo.nombre}`],
          ].map(([v, nombre, ayuda]) => (
            <label key={v} className={`${s.segmentoOpcion} ${modo === v ? s.segmentoOn : ''}`}>
              <input type="radio" name="modo-lote" value={v} checked={modo === v} onChange={() => setModo(v)} />
              <strong>{nombre}</strong>
              <span className={s.sub}>{ayuda}</span>
            </label>
          ))}
        </div>
        {modo === 'mover' && destino && (pierden ? <ListaConApps filas={filas.filter((f) => f.apps.length)} /> : <p className={s.sub}>Nadie pierde aplicaciones con el cambio.</p>)}
      </div>
    </DialogoLote>
  );
}

// Aplicacion: quitar el acceso directo a las seleccionadas. Quien la tiene por un equipo la conserva; los accesos que
// gestiona otra app (p. ej. RR.HH.) se omiten: esa app los repondria.
export function QuitarDirectos({ app, personas, onCerrar, onHecho }) {
  const ix = useDatos();
  const accesoDe = (u) => ix.directos.get(u.id)?.get(app.id);
  const gestionadas = personas.filter((u) => ix.gestionadoPor(accesoDe(u)));
  const manuales = personas.filter((u) => !ix.gestionadoPor(accesoDe(u)));
  const conservan = manuales.filter((u) => ix.origenes(u).get(app.id)?.equipos.length);
  const pierden = manuales.filter((u) => !ix.origenes(u).get(app.id)?.equipos.length);
  return (
    <DialogoLote
      titulo={`Quitar ${app.nombre} a ${manuales.length} ${manuales.length === 1 ? 'persona' : 'personas'}`}
      icono={UserMinus}
      tono={pierden.length ? 'peligro' : undefined}
      descripcion="Solo se quita el acceso directo; lo que llega por un equipo se mantiene."
      boton="Quitar acceso directo"
      deshabilitar={!manuales.length}
      onCerrar={onCerrar}
      accion={async () => {
        const fallos = await quitarAccesos(manuales.map(accesoDe));
        onHecho?.();
        return `${manuales.length - fallos} ${manuales.length - fallos === 1 ? 'acceso quitado' : 'accesos quitados'}.${fallos ? ` ${fallos} no se pudieron quitar.` : ''}`;
      }}
    >
      {pierden.length > 0 && (
        <section className={s.impactoGrupo}>
          <h3>Pierden {app.nombre} ({pierden.length})</h3>
          <PersonasResumen personas={pierden} />
        </section>
      )}
      {conservan.length > 0 && (
        <section className={s.impactoGrupo}>
          <h3>La conservan por un equipo ({conservan.length})</h3>
          <PersonasResumen personas={conservan} />
        </section>
      )}
      {gestionadas.length > 0 && (
        <Aviso tipo="info">
          {gestionadas.length} {gestionadas.length === 1 ? 'acceso lo gestiona' : 'accesos los gestiona'} {ix.appPorSlug.get(ix.gestionadoPor(accesoDe(gestionadas[0])))?.nombre ?? 'otra aplicación'}: no se
          quitan aquí (se repondrían al sincronizar). Desactiva esas cuentas en esa aplicación.
        </Aviso>
      )}
    </DialogoLote>
  );
}

// Aplicacion: pasar a las seleccionadas a un equipo que da la app (se le da si no la tiene) y quitarles el acceso directo
// dado a mano. Nadie pierde la app; desde ahi se maneja por el equipo.
export function PasarAEquipo({ app, personas, onCerrar, onHecho }) {
  const ix = useDatos();
  const equipos = ix.datos.equipos;
  const [equipoId, setEquipoId] = useState(String(equipos.find((e) => ix.deEquipo.get(e.id)?.has(app.id))?.id ?? equipos[0]?.id ?? ''));
  const equipo = ix.equipoPorId.get(Number(equipoId));
  const accesoDe = (u) => ix.directos.get(u.id)?.get(app.id);
  const manuales = personas.filter((u) => !ix.gestionadoPor(accesoDe(u)));
  const gestionadas = personas.length - manuales.length;
  const daLaApp = equipo && ix.deEquipo.get(equipo.id)?.has(app.id);

  if (!equipos.length) {
    return (
      <Modal abierto onCerrar={onCerrar} icono={Users} titulo="Pasar a un equipo" pie={<Button onClick={onCerrar}>Entendido</Button>}>
        <p>No hay equipos. Crea uno primero en la pestaña Equipos.</p>
      </Modal>
    );
  }

  return (
    <DialogoLote
      titulo={`Pasar ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'} a un equipo`}
      icono={Users}
      descripcion={`Quedan con ${app.nombre} por el equipo en vez de acceso directo. Nadie pierde la app.`}
      boton="Pasar al equipo"
      deshabilitar={!equipo}
      onCerrar={onCerrar}
      accion={async () => {
        if (!daLaApp) await api.post('/accesos', { appId: app.id, equipoId: equipo.id });
        await fijarMiembros(equipo, [...equipo.miembros.map((m) => m.id), ...personas.map((p) => p.id)]);
        const fallos = await quitarAccesos(manuales.map(accesoDe));
        onHecho?.();
        return `${personas.length} ${personas.length === 1 ? 'persona agregada' : 'personas agregadas'} a ${equipo.nombre}; ${manuales.length - fallos} ${manuales.length - fallos === 1 ? 'acceso directo quitado' : 'accesos directos quitados'}.`;
      }}
    >
      <div className={s.formulario}>
        <Campo etiqueta="Equipo">
          {(id, aria) => (
            <select id={id} {...aria} value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                  {ix.deEquipo.get(e.id)?.has(app.id) ? ` (ya da ${app.nombre})` : ''}
                </option>
              ))}
            </select>
          )}
        </Campo>
        {equipo && !daLaApp && <Aviso tipo="info">{equipo.nombre} aún no da {app.nombre}: se le dará, así que todos sus miembros actuales también entrarán.</Aviso>}
        {gestionadas > 0 && (
          <Aviso tipo="info">
            {gestionadas} {gestionadas === 1 ? 'acceso directo lo gestiona otra aplicación y se conserva' : 'accesos directos los gestiona otra aplicación y se conservan'} (se repondrían al sincronizar).
          </Aviso>
        )}
        <PersonasResumen personas={personas} />
      </div>
    </DialogoLote>
  );
}

// Agregar varias personas pegando sus correos (uno por linea, o separados por coma o punto y coma).
export function AgregarVarios({ titulo, yaEstan, boton, onAgregar, onCerrar }) {
  const ix = useDatos();
  const [texto, setTexto] = useState('');
  const porCorreo = useMemo(() => new Map(ix.datos.usuarios.map((u) => [u.email.toLowerCase(), u])), [ix.datos.usuarios]);
  const correos = [...new Set(texto.split(/[\s,;]+/).map((c) => c.trim().toLowerCase()).filter(Boolean))];
  const encontradas = correos.map((c) => porCorreo.get(c)).filter(Boolean);
  const nuevas = encontradas.filter((u) => !yaEstan.has(u.id));
  const repetidas = encontradas.length - nuevas.length;
  const noExisten = correos.filter((c) => !porCorreo.has(c));

  return (
    <DialogoLote
      titulo={titulo}
      icono={ClipboardList}
      descripcion="Pega los correos: uno por línea, o separados por coma o punto y coma."
      boton={`${boton} (${nuevas.length})`}
      deshabilitar={!nuevas.length}
      onCerrar={onCerrar}
      accion={async () => {
        await onAgregar(nuevas);
        return `${nuevas.length} ${nuevas.length === 1 ? 'persona agregada' : 'personas agregadas'}.`;
      }}
    >
      <div className={s.formulario}>
        <Campo etiqueta="Correos">
          {(id, aria) => <textarea id={id} {...aria} rows={6} data-autofocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'ana@aed.com.co\nluis@gmail.com'} />}
        </Campo>
        {correos.length > 0 && (
          <div className={s.resumenCorreos}>
            <span className={s.estadoOk}>{nuevas.length} para agregar</span>
            {repetidas > 0 && <span className={s.sub}>{repetidas} ya estaban</span>}
            {noExisten.length > 0 && <span className={s.metodoAviso}>{noExisten.length} no existen en el portal</span>}
          </div>
        )}
        {nuevas.length > 0 && <PersonasResumen personas={nuevas} />}
        {noExisten.length > 0 && (
          <Aviso tipo="info">
            No están en el portal: {noExisten.slice(0, 8).join(', ')}
            {noExisten.length > 8 ? ` y ${noExisten.length - 8} más` : ''}. Créalas primero en Personas.
          </Aviso>
        )}
      </div>
    </DialogoLote>
  );
}
