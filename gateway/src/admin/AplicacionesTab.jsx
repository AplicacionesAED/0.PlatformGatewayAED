import { useMemo, useState } from 'react';
import { ChevronRight, Plus, X } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, BotonIcono, Button, Cargando, Insignia, Modal } from '../components/ui.jsx';
import BuscarPersona from './BuscarPersona.jsx';
import { useAbrirPersona, useDatos } from './datos.jsx';
import { Avatar, IconoApp, IconoEquipo, colorApp } from './colores.jsx';
import s from './Admin.module.css';

// Quien entra a una app: equipos con acceso, personas con acceso directo y el total que resulta.
function FichaApp({ app, onCerrar }) {
  const ix = useDatos();
  const abrirPersona = useAbrirPersona();
  const [equipoNuevo, setEquipoNuevo] = useState('');
  const [error, setError] = useState(null);

  async function tras(promesa) {
    setError(null);
    try {
      await promesa;
      await ix.recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const equipos = (ix.datos?.equipos ?? []).filter((e) => ix.deEquipo.get(e.id)?.has(app.id));
  const sinAcceso = (ix.datos?.equipos ?? []).filter((e) => !ix.deEquipo.get(e.id)?.has(app.id));
  const directas = (ix.datos?.usuarios ?? []).filter((u) => ix.directos.get(u.id)?.has(app.id));
  const conDirecta = new Set(directas.map((u) => u.id));
  const total = (ix.datos?.usuarios ?? []).filter((u) => u.activo && ix.origenes(u).has(app.id)).length;

  return (
    <Modal abierto onCerrar={onCerrar} titulo={app.nombre} ancho={560} lateral>
      <div className={s.fichaHero} style={{ '--c': colorApp(app) }}>
        <IconoApp app={app} tam={26} />
        <div className={s.fichaHeroTexto}>
          <span className={s.fichaHeroCifra}>{total}</span>
          <span className={s.fichaHeroDato}>{total === 1 ? 'persona activa entra' : 'personas activas entran'} a esta aplicación</span>
        </div>
      </div>
      {!app.activa && <Aviso tipo="info">La aplicación está inactiva: nadie entra, aunque tenga acceso asignado.</Aviso>}
      {error && <Aviso>{error}</Aviso>}

      <section className={s.fichaSeccion} aria-labelledby="app-equipos">
        <h3 id="app-equipos">Equipos</h3>
        {equipos.length === 0 ? (
          <p className={s.sub}>Ningún equipo tiene acceso.</p>
        ) : (
          <ul className={s.listaFilas}>
            {equipos.map((e) => (
              <li key={e.id}>
                <span>
                  <IconoEquipo equipo={e} />
                  {e.nombre} <span className={s.sub}>{e.miembros.length} {e.miembros.length === 1 ? 'miembro' : 'miembros'}</span>
                </span>
                <BotonIcono icono={X} etiqueta={`Quitar ${app.nombre} al equipo ${e.nombre}`} onClick={() => tras(api.delete(`/accesos/${ix.deEquipo.get(e.id).get(app.id)}`))} />
              </li>
            ))}
          </ul>
        )}
        {sinAcceso.length > 0 && (
          <div className={s.agregar}>
            <select value={equipoNuevo} onChange={(e) => setEquipoNuevo(e.target.value)} aria-label="Equipo al que dar acceso">
              <option value="">Dar acceso a un equipo…</option>
              {sinAcceso.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
            <Button
              variante="secundario"
              icono={Plus}
              disabled={!equipoNuevo}
              onClick={() => {
                const equipoId = Number(equipoNuevo);
                setEquipoNuevo('');
                tras(api.post('/accesos', { appId: app.id, equipoId }));
              }}
            >
              Agregar
            </Button>
          </div>
        )}
      </section>

      <section className={s.fichaSeccion} aria-labelledby="app-personas">
        <h3 id="app-personas">Personas con acceso directo</h3>
        <BuscarPersona
          personas={ix.datos?.usuarios ?? []}
          excluir={conDirecta}
          etiqueta={`Buscar persona para dar acceso a ${app.nombre}`}
          placeholder="Dar acceso a una persona…"
          onElegir={(p) => tras(api.post('/accesos', { appId: app.id, usuarioId: p.id }))}
        />
        {directas.length === 0 ? (
          <p className={s.sub}>Nadie tiene acceso directo.</p>
        ) : (
          <ul className={s.listaFilas}>
            {directas.map((u) => (
              <li key={u.id} className={u.activo ? undefined : s.inactiva}>
                <div className={s.personaCelda}>
                  <Avatar nombre={u.nombre} />
                  <span>
                    <button type="button" className={s.nombreBoton} onClick={() => abrirPersona(u.id)}>{u.nombre}</button>
                    <span className={s.sub}>{u.email}{u.activo ? '' : ' · inactiva'}</span>
                  </span>
                </div>
                <BotonIcono icono={X} etiqueta={`Quitar ${app.nombre} a ${u.nombre}`} onClick={() => tras(api.delete(`/accesos/${ix.directos.get(u.id).get(app.id)}`))} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}

export default function AplicacionesTab() {
  const ix = useDatos();
  const [abierta, setAbierta] = useState(null);

  const resumen = useMemo(() => {
    if (!ix.datos) return [];
    return ix.datos.apps.map((a) => ({
      app: a,
      personas: ix.datos.usuarios.filter((u) => u.activo && ix.origenes(u).has(a.id)).length,
      equipos: ix.datos.equipos.filter((e) => ix.deEquipo.get(e.id)?.has(a.id)).length,
      directas: ix.datos.usuarios.filter((u) => ix.directos.get(u.id)?.has(a.id)).length,
    }));
  }, [ix]);

  if (ix.cargando && !ix.datos) return <Cargando />;
  const app = abierta != null ? ix.appPorId.get(abierta) : null;
  const activas = ix.datos.usuarios.filter((u) => u.activo).length;

  return (
    <section aria-label="Aplicaciones">
      <p className={s.sub}>Elige una aplicación para ver quién entra y dar o quitar acceso.</p>
      {ix.error && <Aviso>{ix.error}</Aviso>}

      <div className={s.tarjetas}>
        {resumen.map(({ app: a, personas, equipos, directas }) => {
          const parte = activas ? Math.round((personas / activas) * 100) : 0;
          return (
            <button key={a.id} type="button" className={`${s.tarjeta} ${s.tarjetaBoton} ${s.tarjetaColor}`} style={{ '--c': colorApp(a) }} onClick={() => setAbierta(a.id)}>
              <span className={s.tarjetaTitulo}>
                <IconoApp app={a} tam={20} />
                <span className={s.tarjetaNombre}>{a.nombre}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </span>
              {!a.activa && <Insignia tono="aviso">Inactiva</Insignia>}
              <span className={s.cifra}>
                {personas} <span className={s.sub}>{personas === 1 ? 'persona activa' : 'personas activas'}</span>
              </span>
              <span className={s.proporcion} role="img" aria-label={`${parte}% de las personas activas`}>
                <span style={{ width: `${parte}%` }} />
              </span>
              <span className={s.datosTarjeta}>
                <span>{parte}% del total</span>
                <span>{equipos} {equipos === 1 ? 'equipo' : 'equipos'}</span>
                <span>{directas} {directas === 1 ? 'directo' : 'directos'}</span>
              </span>
            </button>
          );
        })}
      </div>

      {app && <FichaApp key={app.id} app={app} onCerrar={() => setAbierta(null)} />}
    </section>
  );
}
