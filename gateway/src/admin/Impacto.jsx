// Dialogos que muestran las consecuencias ANTES de tocar accesos: quien pierde una app al quitarsela a un equipo, y que
// accesos directos sobran cuando un equipo ya da la app (limpieza). Los accesos gestionados por una app (p. ej. RR.HH.)
// nunca se ofrecen para limpiar: esa app los volveria a crear.
import { useState } from 'react';
import { CheckCircle2, Eraser, UserMinus } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, Button, Modal } from '../components/ui.jsx';
import { Avatar, IconoApp } from './colores.jsx';
import { quitarAccesos, useDatos } from './datos.jsx';
import s from './Admin.module.css';

const MAX = 6;

// Avatares y nombres de hasta MAX personas, y "y N más".
export function PersonasResumen({ personas }) {
  if (personas.length === 0) return <p className={s.sub}>Nadie.</p>;
  return (
    <ul className={s.resumenPersonas}>
      {personas.slice(0, MAX).map((p) => (
        <li key={p.id}>
          <Avatar nombre={p.nombre} />
          <span>{p.nombre}</span>
        </li>
      ))}
      {personas.length > MAX && <li className={s.sub}>y {personas.length - MAX} más</li>}
    </ul>
  );
}

// Quitar `app` a `equipo`: muestra quien la pierde y quien la conserva, y pide confirmar.
export function ConfirmarQuitarApp({ equipo, app, onCerrar, onHecho }) {
  const ix = useDatos();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const { pierden, conservan } = ix.impactoQuitarApp(equipo, app.id);

  async function confirmar() {
    setTrabajando(true);
    setError(null);
    try {
      await api.delete(`/accesos/${ix.deEquipo.get(equipo.id).get(app.id)}`);
      await ix.recargar();
      onHecho?.();
      onCerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      icono={UserMinus}
      tono={pierden.length ? 'peligro' : undefined}
      titulo={`Quitar ${app.nombre} a ${equipo.nombre}`}
      descripcion="Revisa a quién afecta antes de confirmar."
      ancho={560}
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button variante={pierden.length ? 'peligro' : 'primario'} cargando={trabajando} onClick={confirmar}>
            Quitar aplicación
          </Button>
        </>
      }
    >
      <div className={s.impacto}>
        <IconoApp app={app} tam={18} />
        <p>
          <strong>{pierden.length}</strong> {pierden.length === 1 ? 'persona pierde' : 'personas pierden'} {app.nombre} y{' '}
          <strong>{conservan.length}</strong> {conservan.length === 1 ? 'la conserva' : 'la conservan'} porque la tienen directa o por otro equipo.
        </p>
      </div>
      {pierden.length > 0 && (
        <section className={s.impactoGrupo}>
          <h3>La pierden</h3>
          <PersonasResumen personas={pierden} />
        </section>
      )}
      {conservan.length > 0 && (
        <section className={s.impactoGrupo}>
          <h3>La conservan</h3>
          <PersonasResumen personas={conservan} />
        </section>
      )}
      {error && <Aviso>{error}</Aviso>}
    </Modal>
  );
}

// Ofrece quitar accesos directos que sobran (`lista` = [{ persona, accesoId }]).
export function OfrecerLimpieza({ app, lista, motivo, onCerrar }) {
  const ix = useDatos();
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function limpiar() {
    setTrabajando(true);
    const fallos = await quitarAccesos(lista.map((r) => r.accesoId));
    await ix.recargar();
    setTrabajando(false);
    const n = lista.length - fallos;
    setResultado(
      `${n} ${n === 1 ? 'acceso directo quitado' : 'accesos directos quitados'}.` + (fallos ? ` ${fallos} no se ${fallos === 1 ? 'pudo' : 'pudieron'} quitar.` : '')
    );
  }

  return (
    <Modal
      abierto
      onCerrar={trabajando ? () => {} : onCerrar}
      icono={Eraser}
      titulo="Accesos directos que sobran"
      descripcion={motivo}
      ancho={560}
      pie={
        resultado ? (
          <Button icono={CheckCircle2} onClick={onCerrar}>Listo</Button>
        ) : (
          <>
            <Button variante="secundario" disabled={trabajando} onClick={onCerrar}>Dejarlos</Button>
            <Button icono={Eraser} cargando={trabajando} onClick={limpiar}>
              Quitar {lista.length} {lista.length === 1 ? 'acceso directo' : 'accesos directos'}
            </Button>
          </>
        )
      }
    >
      {resultado ? (
        <Aviso tipo="ok">{resultado} Siguen entrando a {app.nombre} por su equipo.</Aviso>
      ) : (
        <>
          <p>
            {lista.length === 1 ? 'Esta persona tiene' : 'Estas personas tienen'} {app.nombre} dada a mano y además por un equipo. Si quitas el
            acceso directo, la app queda manejada solo por el equipo: al sacarlas del equipo la pierden. Nadie pierde la app ahora.
          </p>
          <PersonasResumen personas={lista.map((r) => r.persona)} />
        </>
      )}
    </Modal>
  );
}
