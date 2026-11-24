import { useMemo, useState } from 'react';
import { ChevronRight, Eraser, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, BotonIcono, Button, Cargando, Insignia, Modal } from '../components/ui.jsx';
import BuscarPersona from './BuscarPersona.jsx';
import ListaPaginada from './ListaPaginada.jsx';
import { ConfirmarQuitarApp, OfrecerLimpieza } from './Impacto.jsx';
import { useAbrirPersona, useDatos } from './datos.jsx';
import { Avatar, IconoApp, IconoEquipo, colorApp } from './colores.jsx';
import s from './Admin.module.css';

const textoPersona = (u) => `${u.nombre} ${u.email}`;

// Quien entra a una app: equipos con acceso, personas con acceso directo y el total que resulta.
function FichaApp({ app, onCerrar }) {
  const ix = useDatos();
  const abrirPersona = useAbrirPersona();
  const [equipoNuevo, setEquipoNuevo] = useState('');
  const [error, setError] = useState(null);
  const [quitandoEquipo, setQuitandoEquipo] = useState(null); // equipo
  const [limpieza, setLimpieza] = useState(null); // { lista, motivo }
  const [quitandoGestionado, setQuitandoGestionado] = useState(null); // persona con acceso gestionado por una app

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
  const accesoDe = (u) => ix.directos.get(u.id).get(app.id);
  const gestor = (u) => ix.gestionadoPor(accesoDe(u));
  const nombreGestor = (slug) => ix.appPorSlug.get(slug)?.nombre ?? slug;
  const gestionadas = directas.filter((u) => gestor(u)).length;
  const sobran = ix.redundantes(app.id);
  const sobranIds = new Set(sobran.map((r) => r.persona.id));

  // Dar la app a un equipo; si algunos miembros ya la tenian dada a mano, se ofrece dejarla solo por el equipo.
  async function darAEquipo(equipoId) {
    const equipo = ix.equipoPorId.get(equipoId);
    const lista = ix.redundantes(app.id, equipo);
    setError(null);
    try {
      await api.post('/accesos', { appId: app.id, equipoId });
      await ix.recargar();
      if (lista.length) setLimpieza({ lista, motivo: `${equipo.nombre} ya da ${app.nombre} a ${lista.length === 1 ? 'esta persona' : 'estas personas'}.` });
    } catch (err) {
      setError(err.message);
    }
  }

  function quitarDirecto(u) {
    if (gestor(u)) setQuitandoGestionado(u);
    else tras(api.delete(`/accesos/${accesoDe(u)}`));
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={app.nombre} ancho={760} lateral>
      <div className={s.fichaHero} style={{ '--c': colorApp(app) }}>
        <IconoApp app={app} tam={26} />
        <div className={s.fichaHeroTexto}>
          <span className={s.fichaHeroCifra}>{total}</span>
          <span className={s.fichaHeroDato}>{total === 1 ? 'persona activa entra' : 'personas activas entran'} a esta aplicación</span>
        </div>
      </div>
      {!app.activa && <Aviso tipo="info">La aplicación está inactiva: nadie entra, aunque tenga acceso asignado.</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {sobran.length > 0 && (
        <div className={s.avisoAccion}>
          <Eraser size={18} aria-hidden="true" />
          <p>
            <strong>{sobran.length}</strong> {sobran.length === 1 ? 'acceso directo sobra' : 'accesos directos sobran'}: esas personas también tienen {app.nombre} por un equipo.
          </p>
          <Button variante="secundario" onClick={() => setLimpieza({ lista: sobran, motivo: `También tienen ${app.nombre} por un equipo.` })}>
            Revisar
          </Button>
        </div>
      )}

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
                <BotonIcono icono={X} etiqueta={`Quitar ${app.nombre} al equipo ${e.nombre}`} onClick={() => setQuitandoEquipo(e)} />
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
                darAEquipo(equipoId);
              }}
            >
              Agregar
            </Button>
          </div>
        )}
      </section>

      <section className={s.fichaSeccion} aria-labelledby="app-personas">
        <h3 id="app-personas">Personas con acceso directo ({directas.length})</h3>
        {gestionadas > 0 && (
          <p className={s.sub}>
            {gestionadas === directas.length ? 'Todas las gestiona' : `${gestionadas} de ellas las gestiona`} {nombreGestor(gestor(directas.find((u) => gestor(u))))}: se crean y se quitan desde esa aplicación.
          </p>
        )}
        <BuscarPersona
          personas={ix.datos?.usuarios ?? []}
          excluir={conDirecta}
          etiqueta={`Buscar persona para dar acceso a ${app.nombre}`}
          placeholder="Dar acceso a una persona…"
          icono={UserPlus}
          onElegir={(p) => tras(api.post('/accesos', { appId: app.id, usuarioId: p.id }))}
        />
        <ListaPaginada
          items={directas}
          etiqueta={`las personas con acceso a ${app.nombre}`}
          vacio="Nadie tiene acceso directo."
          textoDe={textoPersona}
          renderFila={(u) => (
            <li key={u.id} className={u.activo ? undefined : s.inactiva}>
              <div className={s.personaCelda}>
                <Avatar nombre={u.nombre} />
                <span>
                  <button type="button" className={s.nombreBoton} onClick={() => abrirPersona(u.id)}>{u.nombre}</button>
                  <span className={s.sub}>{u.email}{u.activo ? '' : ' · inactiva'}</span>
                </span>
              </div>
              <span className={s.filaMarcas}>
                {/* Si todas son gestionadas ya lo dice el encabezado: la marca por fila solo distingue cuando hay mezcla. */}
                {gestor(u) && gestionadas !== directas.length && <Insignia tono="info">Gestionado por {nombreGestor(gestor(u))}</Insignia>}
                {sobranIds.has(u.id) && <Insignia tono="aviso">También por equipo</Insignia>}
                <BotonIcono icono={X} etiqueta={`Quitar ${app.nombre} a ${u.nombre}`} onClick={() => quitarDirecto(u)} />
              </span>
            </li>
          )}
        />
      </section>

      {quitandoEquipo && <ConfirmarQuitarApp equipo={quitandoEquipo} app={app} onCerrar={() => setQuitandoEquipo(null)} />}
      {limpieza && <OfrecerLimpieza app={app} lista={limpieza.lista} motivo={limpieza.motivo} onCerrar={() => setLimpieza(null)} />}
      {quitandoGestionado && (
        <Modal
          abierto
          onCerrar={() => setQuitandoGestionado(null)}
          icono={Trash2}
          tono="peligro"
          titulo={`Quitar ${app.nombre} a ${quitandoGestionado.nombre}`}
          descripcion={`Este acceso lo gestiona ${nombreGestor(gestor(quitandoGestionado))}.`}
          pie={
            <>
              <Button variante="secundario" onClick={() => setQuitandoGestionado(null)}>Cancelar</Button>
              <Button
                variante="peligro"
                onClick={() => {
                  const u = quitandoGestionado;
                  setQuitandoGestionado(null);
                  tras(api.delete(`/accesos/${accesoDe(u)}`));
                }}
              >
                Quitar de todas formas
              </Button>
            </>
          }
        >
          <p>
            Si la cuenta sigue activa en {nombreGestor(gestor(quitandoGestionado))}, el acceso vuelve a aparecer en su próxima sincronización. Para quitarlo
            de forma definitiva, desactiva la cuenta en {nombreGestor(gestor(quitandoGestionado))}.
          </p>
        </Modal>
      )}
    </Modal>
  );
}

export default function AplicacionesTab() {
  const ix = useDatos();
  const [abierta, setAbierta] = useState(null);

  const resumen = useMemo(() => {
    if (!ix.datos) return [];
    const origenes = ix.datos.usuarios.map((u) => [u, ix.origenes(u)]);
    return ix.datos.apps.map((a) => ({
      app: a,
      personas: origenes.filter(([u, o]) => u.activo && o.has(a.id)).length,
      equipos: ix.datos.equipos.filter((e) => ix.deEquipo.get(e.id)?.has(a.id)).length,
      directas: ix.datos.usuarios.filter((u) => ix.directos.get(u.id)?.has(a.id)).length,
      sobran: ix.redundantes(a.id).length,
    }));
  }, [ix]);

  if (ix.cargando && !ix.datos) return <Cargando />;
  const app = abierta != null ? ix.appPorId.get(abierta) : null;
  const activas = ix.datos.usuarios.filter((u) => u.activo).length;

  return (
    <section aria-label="Aplicaciones">
      <p className={s.sub}>Elige una aplicación para ver quién entra y dar o quitar acceso.</p>
      {ix.error && <Aviso>{ix.error}</Aviso>}

      {/* Mismas filas compactas que Equipos: identidad, proporcion de personas, como llega el acceso y total. */}
      <div className={s.filasEquipo}>
        {resumen.map(({ app: a, personas, equipos, directas, sobran }) => {
          const parte = activas ? Math.round((personas / activas) * 100) : 0;
          return (
            <button key={a.id} type="button" className={`${s.filaEquipo} ${s.filaApp}`} style={{ '--c': colorApp(a) }} onClick={() => setAbierta(a.id)}>
              <IconoApp app={a} tam={20} />
              <span className={s.filaEquipoTexto}>
                <strong>{a.nombre}</strong>
                <span className={s.sub}>
                  {equipos} {equipos === 1 ? 'equipo' : 'equipos'} · {directas} {directas === 1 ? 'acceso directo' : 'accesos directos'}
                  {sobran > 0 && ` · ${sobran} ${sobran === 1 ? 'sobra' : 'sobran'}`}
                  {!a.activa && ' · inactiva'}
                </span>
              </span>
              <span className={s.filaAppProporcion} role="img" aria-label={`${parte}% de las personas activas`}>
                <span className={s.proporcion}>
                  <span style={{ width: `${parte}%` }} />
                </span>
                <span className={s.sub}>{parte}% del total</span>
              </span>
              <span className={s.filaEquipoCifra}>
                <strong>{personas}</strong> {personas === 1 ? 'persona' : 'personas'}
              </span>
              <ChevronRight size={18} aria-hidden="true" className={s.filaEquipoFlecha} />
            </button>
          );
        })}
      </div>

      {app && <FichaApp key={app.id} app={app} onCerrar={() => setAbierta(null)} />}
    </section>
  );
}
