import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, LogIn, Plus, Power, ShieldCheck, ShieldOff, Users, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Aviso, BotonIcono, Button, Cargando, Insignia, Modal } from '../components/ui.jsx';
import { ACCIONES, describir } from './auditoriaTexto.js';
import { fijarMiembros, useDatos } from './datos.jsx';
import { Avatar, IconoApp, IconoEquipo, colorApp, tonoAccion } from './colores.jsx';
import { formatoFecha } from './useCarga.js';
import s from './Admin.module.css';

// La contraseña temporal se muestra UNA vez: el servicio no la guarda en claro y no hay forma de volver a verla.
export function ModalTemporal({ datos, onCerrar }) {
  const [copiada, setCopiada] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(datos.password);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  }
  return (
    <Modal
      abierto={Boolean(datos)}
      onCerrar={onCerrar}
      titulo={datos?.titulo ?? ''}
      icono={KeyRound}
      descripcion={datos?.password ? 'Cópiala ahora: no se vuelve a mostrar.' : 'Cuenta corporativa: entra con Microsoft.'}
      pie={<Button icono={Check} onClick={onCerrar}>Listo, ya la anoté</Button>}
    >
      {datos?.password ? (
        <>
          <p>
            Contraseña temporal para <strong>{datos.email}</strong>:
          </p>
          <div className={s.temporal}>
            <code>{datos.password}</code>
            <Button variante="secundario" icono={copiada ? Check : Copy} onClick={copiar}>
              {copiada ? 'Copiada' : 'Copiar'}
            </Button>
          </div>
          <Aviso tipo="info">Solo se muestra esta vez. Entrégasela a la persona por un canal seguro: deberá cambiarla al entrar.</Aviso>
        </>
      ) : (
        <p>
          <strong>{datos?.email}</strong> entrará con su cuenta de Microsoft. No necesita contraseña.
        </p>
      )}
    </Modal>
  );
}

export function InsigniasPersona({ p }) {
  return (
    <div className={s.insignias}>
      <Insignia tono={p.activo ? 'ok' : 'error'}>{p.activo ? 'Activa' : 'Inactiva'}</Insignia>
      {p.esAdmin && <Insignia tono="info" icono={ShieldCheck}>Administrador</Insignia>}
      {p.corporativo ? (
        <Insignia>{p.microsoftVinculado ? 'Microsoft' : 'Microsoft (aún no ha entrado)'}</Insignia>
      ) : !p.tienePassword ? (
        <Insignia tono="aviso">Sin contraseña</Insignia>
      ) : p.debeCambiarPassword ? (
        <Insignia tono="aviso">Contraseña temporal</Insignia>
      ) : (
        <Insignia>Contraseña</Insignia>
      )}
    </div>
  );
}

const ICONO_CONFIRMAR = { desactivar: Power, reset: KeyRound, hacerAdmin: ShieldCheck, quitarAdmin: ShieldOff, suplantar: LogIn };

const TEXTO_CONFIRMAR = {
  desactivar: (p) => [`Desactivar a ${p.nombre}`, 'Perderá el acceso al portal y a todas las aplicaciones en menos de una hora. Sus sesiones abiertas se cierran de inmediato.', 'Desactivar'],
  reset: (p) => [`Restablecer la contraseña de ${p.nombre}`, 'Se generará una contraseña temporal nueva y se cerrarán sus sesiones. La anterior deja de servir.', 'Restablecer'],
  hacerAdmin: (p) => [`Hacer administrador a ${p.nombre}`, 'Podrá crear personas, dar y quitar accesos y ver la auditoría.', 'Hacer administrador'],
  quitarAdmin: (p) => [`Quitar administrador a ${p.nombre}`, 'Dejará de poder administrar el portal.', 'Quitar rol'],
  suplantar: (p) => [
    `Entrar como ${p.nombre}`,
    `Verás el portal y las aplicaciones exactamente como ${p.nombre}. Lo que hagas en las aplicaciones quedará a su nombre; el portal registra que fuiste tú. Tu sesión de administrador se cierra mientras tanto: una franja arriba te permite regresar, y la sesión termina sola en máximo una hora.`,
    'Entrar como esta persona',
  ],
};

function Actividad({ persona, version }) {
  const ix = useDatos();
  const [estado, setEstado] = useState({ filas: null, error: null });

  useEffect(() => {
    let vigente = true;
    api
      .pagina(`/auditoria?usuarioId=${persona.id}&limit=8`)
      .then(({ data }) => vigente && setEstado({ filas: data, error: null }))
      .catch((err) => vigente && setEstado({ filas: [], error: err.message }));
    return () => {
      vigente = false;
    };
  }, [persona.id, version]);

  if (!estado.filas) return <Cargando />;
  return (
    <>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      {estado.filas.length === 0 ? (
        <p className={s.sub}>Sin actividad registrada.</p>
      ) : (
        <ol className={s.actividad}>
          {estado.filas.map((f) => (
            <li key={f.id} className={s[`tono_${tonoAccion(f.accion)}`]}>
              <span className={s.actividadFecha}>{formatoFecha(f.creado_en)}</span>
              <span>
                <strong>{ACCIONES[f.accion] ?? f.accion}</strong>
                {f.actor_id && f.actor_id !== persona.id && f.actor && <> por {f.actor.nombre}</>}
              </span>
              {describir(f, ix) && <span className={s.sub}>{describir(f, ix)}</span>}
            </li>
          ))}
        </ol>
      )}
      <Link className={s.enlace} to={`/admin/auditoria?usuario=${persona.id}`}>
        Ver toda su actividad
      </Link>
    </>
  );
}

// Todo lo de una persona en un solo lugar: estado, acciones, aplicaciones (y de donde le llegan), equipos y actividad.
export default function FichaPersona({ id, onCerrar }) {
  const auth = useAuth();
  const yo = auth.usuario;
  const ix = useDatos();
  const [confirmar, setConfirmar] = useState(null); // tipo
  const [temporal, setTemporal] = useState(null);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [pendientes, setPendientes] = useState(() => new Set());
  const [equipoNuevo, setEquipoNuevo] = useState('');
  const [version, setVersion] = useState(0);

  const p = id != null ? ix.personaPorId?.get(id) : null;

  useEffect(() => {
    setError(null);
    setEquipoNuevo('');
  }, [id]);

  async function tras(promesa) {
    setError(null);
    try {
      await promesa;
      await ix.recargar();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  async function ejecutar() {
    setTrabajando(true);
    try {
      if (confirmar === 'reset') {
        await tras(
          api.post(`/usuarios/${p.id}/reset-password`).then((r) => setTemporal({ titulo: 'Contraseña restablecida', email: p.email, password: r.passwordTemporal }))
        );
      } else if (confirmar === 'desactivar') await tras(api.patch(`/usuarios/${p.id}`, { activo: false }));
      else if (confirmar === 'hacerAdmin') await tras(api.patch(`/usuarios/${p.id}`, { esAdmin: true }));
      else if (confirmar === 'quitarAdmin') await tras(api.patch(`/usuarios/${p.id}`, { esAdmin: false }));
      else if (confirmar === 'suplantar') {
        setError(null);
        // Si sale bien, la pagina se recarga en el portal ya como esa persona.
        await auth.suplantar(p.id).catch((err) => setError(err.message));
      }
    } finally {
      setTrabajando(false);
      setConfirmar(null);
    }
  }

  async function alternarApp(app, accesoId) {
    setPendientes((x) => new Set(x).add(app.id));
    await tras(accesoId ? api.delete(`/accesos/${accesoId}`) : api.post('/accesos', { appId: app.id, usuarioId: p.id }));
    setPendientes((x) => {
      const n = new Set(x);
      n.delete(app.id);
      return n;
    });
  }

  function agregarAEquipo() {
    const equipo = ix.equipoPorId.get(Number(equipoNuevo));
    if (!equipo) return;
    setEquipoNuevo('');
    tras(fijarMiembros(equipo, [...equipo.miembros.map((m) => m.id), p.id]));
  }

  function quitarDeEquipo(e) {
    const equipo = ix.equipoPorId.get(e.id);
    tras(fijarMiembros(equipo, equipo.miembros.map((m) => m.id).filter((m) => m !== p.id)));
  }

  const abierto = Boolean(p);
  const soyYo = p?.id === yo.id;
  const origenes = p ? ix.origenes(p) : new Map();
  const [tituloConf, cuerpoConf, botonConf] = confirmar && p ? TEXTO_CONFIRMAR[confirmar](p) : [];
  const susEquipos = p ? new Set(p.equipos.map((e) => e.id)) : new Set();
  const otrosEquipos = (ix.datos?.equipos ?? []).filter((e) => !susEquipos.has(e.id));

  return (
    <>
      <Modal abierto={abierto} onCerrar={onCerrar} titulo={p?.nombre ?? ''} ancho={760} lateral>
        {p && (
          <>
            <div className={s.fichaHero} style={{ '--c': '#20a7a1' }}>
              <Avatar nombre={p.nombre} grande />
              <div className={s.fichaHeroTexto}>
                <span className={s.fichaHeroEmail}>{p.email}</span>
                <InsigniasPersona p={p} />
                <span className={s.fichaHeroDato}>Último ingreso: {formatoFecha(p.ultimoLogin) ?? 'nunca'}</span>
              </div>
            </div>

            <div className={s.fichaAcciones}>
              {/* Solo personas activas que no son administradoras (el servicio aplica la misma regla). */}
              {p.activo && !p.esAdmin && !soyYo && (
                <Button icono={LogIn} onClick={() => setConfirmar('suplantar')}>
                  Entrar como esta persona
                </Button>
              )}
              {!p.corporativo && (
                <Button variante="secundario" icono={KeyRound} onClick={() => setConfirmar('reset')}>
                  Restablecer contraseña
                </Button>
              )}
              <Button
                variante="secundario"
                icono={p.esAdmin ? ShieldOff : ShieldCheck}
                disabled={soyYo}
                title={soyYo ? 'No puedes cambiar tu propio rol' : undefined}
                onClick={() => setConfirmar(p.esAdmin ? 'quitarAdmin' : 'hacerAdmin')}
              >
                {p.esAdmin ? 'Quitar administrador' : 'Hacer administrador'}
              </Button>
              {p.activo ? (
                <Button variante="secundario" icono={Power} disabled={soyYo} title={soyYo ? 'No puedes desactivarte a ti mismo' : undefined} onClick={() => setConfirmar('desactivar')}>
                  Desactivar
                </Button>
              ) : (
                <Button variante="secundario" icono={Power} onClick={() => tras(api.patch(`/usuarios/${p.id}`, { activo: true }))}>
                  Activar
                </Button>
              )}
            </div>

            {error && <Aviso>{error}</Aviso>}
            {!p.activo && <Aviso tipo="info">Está inactiva: no entra a ninguna aplicación aunque las tenga asignadas.</Aviso>}

            <section className={s.fichaSeccion} aria-labelledby="ficha-apps">
              <h3 id="ficha-apps">Aplicaciones</h3>
              <p className={s.sub}>La casilla da la aplicación directamente. Lo que llega por un equipo se quita desde el equipo.</p>
              <ul className={s.listaApps}>
                {(ix.datos?.apps ?? []).map((a) => {
                  const o = origenes.get(a.id);
                  return (
                    <li key={a.id} className={o ? s.appConAcceso : undefined} style={{ '--c': colorApp(a) }}>
                      <label className={s.casilla}>
                        <input type="checkbox" checked={Boolean(o?.accesoId)} disabled={pendientes.has(a.id)} onChange={() => alternarApp(a, o?.accesoId)} />
                        <IconoApp app={a} tam={16} />
                        <span>
                          {a.nombre}
                          {!a.activa && <span className={s.sub}>Aplicación inactiva</span>}
                        </span>
                      </label>
                      <span className={s.filaMarcas}>
                        {/* Directo dado por una app (p. ej. RR.HH.): esa app lo repone al sincronizar. */}
                        {o?.accesoId && ix.gestionadoPor(o.accesoId) && (
                          <Insignia>Gestionado por {ix.appPorSlug.get(ix.gestionadoPor(o.accesoId))?.nombre ?? ix.gestionadoPor(o.accesoId)}</Insignia>
                        )}
                        {/* Directo dado a mano que sobra: tambien le llega por un equipo. */}
                        {o?.accesoId && !ix.gestionadoPor(o.accesoId) && o.equipos.length > 0 && <Insignia tono="aviso">Directo redundante</Insignia>}
                        {o?.equipos.length > 0 && (
                          <Insignia tono="info" icono={Users}>
                            Por {o.equipos.map((e) => e.nombre).join(', ')}
                          </Insignia>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className={s.fichaSeccion} aria-labelledby="ficha-equipos">
              <h3 id="ficha-equipos">Equipos</h3>
              {p.equipos.length === 0 ? (
                <p className={s.sub}>No pertenece a ningún equipo.</p>
              ) : (
                <ul className={s.listaFilas}>
                  {p.equipos.map((e) => (
                    <li key={e.id}>
                      <span>
                        <IconoEquipo equipo={e} />
                        {e.nombre}
                      </span>
                      <BotonIcono icono={X} etiqueta={`Sacar a ${p.nombre} de ${e.nombre}`} onClick={() => quitarDeEquipo(e)} />
                    </li>
                  ))}
                </ul>
              )}
              {otrosEquipos.length > 0 && (
                <div className={s.agregar}>
                  <select value={equipoNuevo} onChange={(e) => setEquipoNuevo(e.target.value)} aria-label="Equipo al que agregarla">
                    <option value="">Agregar a un equipo…</option>
                    {otrosEquipos.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                  <Button variante="secundario" icono={Plus} disabled={!equipoNuevo} onClick={agregarAEquipo}>
                    Agregar
                  </Button>
                </div>
              )}
            </section>

            <section className={s.fichaSeccion} aria-labelledby="ficha-actividad">
              <h3 id="ficha-actividad">Actividad reciente</h3>
              <Actividad persona={p} version={version} />
            </section>
          </>
        )}
      </Modal>

      <Modal
        abierto={Boolean(confirmar)}
        onCerrar={() => setConfirmar(null)}
        titulo={tituloConf ?? ''}
        icono={ICONO_CONFIRMAR[confirmar]}
        tono={confirmar === 'desactivar' ? 'peligro' : undefined}
        descripcion={p?.email}
        pie={
          <>
            <Button variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button variante={confirmar === 'desactivar' ? 'peligro' : 'primario'} icono={ICONO_CONFIRMAR[confirmar]} cargando={trabajando} onClick={ejecutar}>{botonConf}</Button>
          </>
        }
      >
        <p>{cuerpoConf}</p>
      </Modal>
      <ModalTemporal datos={temporal} onCerrar={() => setTemporal(null)} />
    </>
  );
}
