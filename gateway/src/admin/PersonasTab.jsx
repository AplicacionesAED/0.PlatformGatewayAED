import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, KeyRound, Power, Search, ShieldCheck, UserPlus, Users, AppWindow, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Aviso, Button, Campo, Cargando, Modal } from '../components/ui.jsx';
import { coincide, fijarMiembros, normalizar, useAbrirPersona, useDatos } from './datos.jsx';
import { ModalTemporal, UltimaActividad } from './FichaPersona.jsx';
import { Avatar, MiniApp } from './colores.jsx';
import SelectorApp from './SelectorApp.jsx';
import { enLinea, formatoFecha, ultimaHora } from './useCarga.js';
import s from './Admin.module.css';

// Como entra la persona, en una sola linea (la ficha muestra el detalle completo).
function Metodo({ p }) {
  if (p.corporativo) {
    return (
      <span className={s.metodo} title={p.microsoftVinculado ? 'Entra con su cuenta de Microsoft' : 'Entrará con Microsoft; aún no ha entrado'}>
        <span className={s.logoMs} aria-hidden="true" />
        Microsoft{p.microsoftVinculado ? '' : ' (pendiente)'}
      </span>
    );
  }
  if (!p.tienePassword) return <span className={`${s.metodo} ${s.metodoAviso}`}>Sin contraseña</span>;
  return (
    <span className={`${s.metodo} ${p.debeCambiarPassword ? s.metodoAviso : ''}`}>
      <KeyRound size={13} aria-hidden="true" />
      {p.debeCambiarPassword ? 'Contraseña temporal' : 'Contraseña'}
    </span>
  );
}

function ModalNueva({ abierto, onCerrar, onCreada }) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function crear(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await api.post('/usuarios', { email, nombre, esAdmin });
      setEmail('');
      setNombre('');
      setEsAdmin(false);
      onCreada(r);
    } catch (err) {
      setError(err.details?.fieldErrors?.email ? 'Escribe un correo válido' : err.message);
    } finally {
      setEnviando(false);
    }
  }

  // Solo para la vista previa: el servicio decide de verdad con PORTAL_CORPORATE_DOMAINS (hoy aed.com.co).
  const corporativo = /@aed\.com\.co$/i.test(email.trim());
  const correoListo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      icono={UserPlus}
      titulo="Nueva persona"
      descripcion="Crea la cuenta del portal. Después le das aplicaciones y equipos desde su ficha."
      ancho={540}
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-nueva" icono={UserPlus} cargando={enviando} disabled={!email || !nombre}>Crear persona</Button>
        </>
      }
    >
      <form id="form-nueva" onSubmit={crear} className={s.formulario} noValidate>
        <div className={s.vistaPrevia} style={{ '--c': '#20a7a1' }} aria-hidden="true">
          <Avatar nombre={nombre.trim() || 'Nueva persona'} grande />
          <div>
            <strong>{nombre.trim() || 'Nueva persona'}</strong>
            <span className={s.sub}>{email.trim() || 'correo@empresa.com'}</span>
            {correoListo && (
              <span className={s.vistaPreviaDato}>{corporativo ? 'Entrará con su cuenta de Microsoft' : 'Recibirá una contraseña temporal al crearla'}</span>
            )}
          </div>
        </div>
        <Campo etiqueta="Correo" ayuda="Con correo de AED entra con Microsoft; con otro correo recibirá una contraseña temporal.">
          {(id, aria) => <input id={id} {...aria} type="email" autoComplete="off" required data-autofocus value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Nombre completo">
          {(id, aria) => <input id={id} {...aria} type="text" autoComplete="off" required value={nombre} onChange={(e) => setNombre(e.target.value)} />}
        </Campo>
        <label className={s.casilla}>
          <input type="checkbox" checked={esAdmin} onChange={(e) => setEsAdmin(e.target.checked)} /> Administrador del portal
        </label>
        {error && <Aviso>{error}</Aviso>}
      </form>
    </Modal>
  );
}

const POR_PAGINA = 50;

const LOTE = {
  equipo: { titulo: 'Agregar a un equipo', boton: 'Agregar', icono: Users },
  app: { titulo: 'Dar acceso a una aplicación', boton: 'Dar acceso', icono: AppWindow },
  desactivar: { titulo: 'Desactivar personas', boton: 'Desactivar', icono: Power },
};

// Acciones sobre varias personas a la vez. El equipo se fija en una sola llamada; apps y desactivar van de a una persona
// (el servicio no tiene operacion en lote) y se informa cuantas fallaron.
function ModalLote({ tipo, personas, onCerrar, onHecho }) {
  const { usuario: yo } = useAuth();
  const ix = useDatos();
  const [destino, setDestino] = useState('');
  const [progreso, setProgreso] = useState(null);
  const [error, setError] = useState(null);

  const afectadas =
    tipo === 'desactivar'
      ? personas.filter((p) => p.activo && p.id !== yo.id)
      : tipo === 'app'
        ? personas.filter((p) => !ix.directos.get(p.id)?.has(Number(destino)))
        : personas;

  async function ejecutar() {
    setError(null);
    let fallos = 0;
    try {
      if (tipo === 'equipo') {
        const equipo = ix.equipoPorId.get(Number(destino));
        setProgreso(0);
        await fijarMiembros(equipo, [...equipo.miembros.map((m) => m.id), ...afectadas.map((p) => p.id)]);
        setProgreso(afectadas.length);
      } else {
        for (const [i, p] of afectadas.entries()) {
          setProgreso(i);
          try {
            if (tipo === 'app') await api.post('/accesos', { appId: Number(destino), usuarioId: p.id });
            else await api.patch(`/usuarios/${p.id}`, { activo: false });
          } catch {
            fallos += 1;
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setProgreso(null);
      return;
    }
    await ix.recargar();
    onHecho(fallos ? `${fallos} de ${afectadas.length} no se pudieron cambiar. Revisa la auditoría.` : null);
  }

  const trabajando = progreso !== null;
  const listo = tipo === 'desactivar' || destino;

  return (
    <Modal
      abierto
      onCerrar={trabajando ? () => {} : onCerrar}
      titulo={LOTE[tipo].titulo}
      icono={LOTE[tipo].icono}
      tono={tipo === 'desactivar' ? 'peligro' : undefined}
      descripcion={`${personas.length} ${personas.length === 1 ? 'persona seleccionada' : 'personas seleccionadas'}`}
      pie={
        <>
          <Button variante="secundario" disabled={trabajando} onClick={onCerrar}>Cancelar</Button>
          <Button variante={tipo === 'desactivar' ? 'peligro' : 'primario'} cargando={trabajando} disabled={!listo || afectadas.length === 0} onClick={ejecutar}>
            {LOTE[tipo].boton} ({afectadas.length})
          </Button>
        </>
      }
    >
      {tipo === 'equipo' && (
        <Campo etiqueta="Equipo">
          {(id, aria) => (
            <select id={id} {...aria} value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Elige un equipo…</option>
              {ix.datos.equipos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          )}
        </Campo>
      )}
      {tipo === 'app' && (
        <Campo etiqueta="Aplicación" ayuda="Se da directamente a cada persona. Quienes ya la tienen directa se omiten.">
          {(id, aria) => (
            <select id={id} {...aria} value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Elige una aplicación…</option>
              {ix.datos.apps.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}{a.activa ? '' : ' (inactiva)'}</option>
              ))}
            </select>
          )}
        </Campo>
      )}
      {tipo === 'desactivar' && (
        <p>
          {afectadas.length} {afectadas.length === 1 ? 'persona perderá' : 'personas perderán'} el acceso al portal y a todas las aplicaciones. Sus sesiones abiertas se cierran de inmediato.
          {afectadas.length < personas.length && ' Las que ya están inactivas (y tú) se omiten.'}
        </p>
      )}
      {trabajando && tipo !== 'equipo' && (
        <p className={s.sub} role="status">
          Procesando {progreso + 1} de {afectadas.length}…
        </p>
      )}
      {error && <Aviso>{error}</Aviso>}
    </Modal>
  );
}

export default function PersonasTab() {
  const ix = useDatos();
  const abrirPersona = useAbrirPersona();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [nueva, setNueva] = useState(false);
  const [temporal, setTemporal] = useState(null);
  const [lote, setLote] = useState(null);
  const [avisoLote, setAvisoLote] = useState(null);
  const [appFiltro, setAppFiltro] = useState('');
  const [pagina, setPagina] = useState(1);

  const personas = ix.datos?.usuarios ?? [];

  const filtros = useMemo(() => {
    if (!ix.datos) return [];
    const lista = [
      ['todas', 'Todas', () => true],
      ['activas', 'Activas', (u) => u.activo],
      ['inactivas', 'Inactivas', (u) => !u.activo],
      ['enLinea', 'En línea', enLinea],
      ['ultimaHora', 'Última hora', ultimaHora],
      ['admins', 'Administradores', (u) => u.esAdmin],
      ['sinApps', 'Sin aplicaciones', (u) => u.activo && ix.appsDe(u).length === 0],
      ['nunca', 'Nunca han entrado', (u) => !u.ultimoLogin],
      ['temporal', 'Contraseña temporal', (u) => u.debeCambiarPassword],
    ];
    return lista.map(([clave, nombre, fn]) => ({ clave, nombre, fn, total: ix.datos.usuarios.filter(fn).length }));
  }, [ix]);

  // Cuantas personas tienen cada app (directo o por equipo), para los botones del filtro por aplicacion.
  const porApp = useMemo(() => {
    if (!ix.datos) return [];
    const origenes = ix.datos.usuarios.map((u) => ix.origenes(u));
    return ix.datos.apps.map((app) => ({ app, total: origenes.filter((o) => o.has(app.id)).length }));
  }, [ix]);

  const filas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const fn = filtros.find((f) => f.clave === filtro)?.fn ?? (() => true);
    // Filtro por aplicacion: quien la tiene asignada por cualquier camino (directo o equipo).
    const conApp = appFiltro ? (u) => ix.origenes(u).has(Number(appFiltro)) : () => true;
    return personas.filter((u) => fn(u) && conApp(u) && coincide(q, u.nombre, u.email));
  }, [personas, busqueda, filtro, filtros, appFiltro, ix]);

  if (ix.cargando && !ix.datos) return <Cargando />;

  // Paginacion en el navegador: los datos ya estan cargados (las fichas y los filtros los necesitan todos); lo costoso era
  // dibujar cientos de filas con avatar a la vez.
  const totalPaginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);
  const desde = filas.length ? (paginaActual - 1) * POR_PAGINA + 1 : 0;
  const hasta = (paginaActual - 1) * POR_PAGINA + visibles.length;

  const todasMarcadas = visibles.length > 0 && visibles.every((p) => seleccion.has(p.id));
  const todoElFiltroMarcado = filas.length > 0 && filas.every((p) => seleccion.has(p.id));
  const alternar = (id) =>
    setSeleccion((actual) => {
      const n = new Set(actual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alternarTodas = () =>
    setSeleccion((actual) => {
      const n = new Set(actual);
      for (const p of visibles) {
        if (todasMarcadas) n.delete(p.id);
        else n.add(p.id);
      }
      return n;
    });
  const marcarTodoElFiltro = () =>
    setSeleccion((actual) => {
      const n = new Set(actual);
      for (const p of filas) n.add(p.id);
      return n;
    });
  const cambiarFiltro = (setter) => (valor) => {
    setter(valor);
    setPagina(1);
  };
  const seleccionadas = personas.filter((p) => seleccion.has(p.id));

  return (
    <section aria-label="Personas">
      <div className={s.barraHerramientas}>
        <label className={s.buscador}>
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="Buscar por nombre o correo…" value={busqueda} onChange={(e) => cambiarFiltro(setBusqueda)(e.target.value)} aria-label="Buscar persona" />
        </label>
        <SelectorApp opciones={porApp} valor={appFiltro} total={personas.length} onCambiar={cambiarFiltro(setAppFiltro)} />
        <Button icono={UserPlus} onClick={() => setNueva(true)} className={s.empujarDerecha}>Nueva persona</Button>
      </div>

      <div className={s.chips} role="group" aria-label="Filtrar personas">
        {filtros.map((f) => (
          <button key={f.clave} type="button" className={s.chip} aria-pressed={filtro === f.clave} onClick={() => cambiarFiltro(setFiltro)(f.clave)}>
            {f.nombre} <span className={s.chipTotal}>{f.total}</span>
          </button>
        ))}
      </div>

      {ix.error && <Aviso>{ix.error}</Aviso>}
      {avisoLote && <Aviso>{avisoLote}</Aviso>}

      {seleccion.size > 0 && (
        <div className={s.barraLote} role="region" aria-label="Acciones sobre las personas seleccionadas">
          <strong>{seleccion.size} {seleccion.size === 1 ? 'seleccionada' : 'seleccionadas'}</strong>
          {!todoElFiltroMarcado && filas.length > visibles.length && (
            <Button variante="secundario" onClick={marcarTodoElFiltro}>
              Seleccionar las {filas.length} del filtro
            </Button>
          )}
          <Button variante="secundario" icono={Users} onClick={() => setLote('equipo')} disabled={!ix.datos.equipos.length}>
            Agregar a equipo
          </Button>
          <Button variante="secundario" icono={AppWindow} onClick={() => setLote('app')}>
            Dar aplicación
          </Button>
          <Button variante="secundario" icono={Power} onClick={() => setLote('desactivar')}>
            Desactivar
          </Button>
          <Button variante="secundario" icono={X} onClick={() => setSeleccion(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}

      <div className={s.tablaCaja}>
        <table className={`${s.tabla} ${s.tablaCompacta}`}>
          <thead>
            <tr>
              <th scope="col" className={s.celdaMarca}>
                <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} aria-label="Seleccionar las personas de esta página" />
              </th>
              <th scope="col">Persona</th>
              <th scope="col">Estado</th>
              <th scope="col">Ingreso con</th>
              <th scope="col">Aplicaciones</th>
              <th scope="col">Última actividad</th>
              <th scope="col"><span className={s.soloLectores}>Abrir</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const apps = ix.appsDe(p);
              return (
                <tr key={p.id} className={`${s.filaAbrible} ${p.activo ? '' : s.inactiva}`} onClick={() => abrirPersona(p.id)}>
                  <td className={s.celdaMarca} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={seleccion.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Seleccionar a ${p.nombre}`} />
                  </td>
                  <td>
                    <div className={s.personaCelda}>
                      <Avatar nombre={p.nombre} />
                      <span>
                        <button type="button" className={s.nombreBoton} onClick={(e) => { e.stopPropagation(); abrirPersona(p.id); }}>
                          {p.nombre}
                        </button>
                        <span className={s.sub}>{p.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className={s.nowrap}>
                    <span className={`${s.estado} ${p.activo ? s.estadoOk : s.estadoNo}`}>{p.activo ? 'Activa' : 'Inactiva'}</span>
                    {p.esAdmin && (
                      <span className={s.admin} title="Administrador del portal">
                        <ShieldCheck size={13} aria-hidden="true" /> Admin
                      </span>
                    )}
                  </td>
                  <td className={s.nowrap}>
                    <Metodo p={p} />
                  </td>
                  <td>
                    {apps.length ? (
                      <div className={s.miniApps}>
                        {apps.map((a) => (
                          <MiniApp key={a.id} app={a} />
                        ))}
                      </div>
                    ) : (
                      <span className={s.ninguna}>Ninguna</span>
                    )}
                  </td>
                  <td className={s.nowrap} title={p.ultimaActividad ? `${formatoFecha(p.ultimaActividad)} · último inicio de sesión: ${formatoFecha(p.ultimoLogin) ?? 'nunca'}` : undefined}>
                    <UltimaActividad p={p} />
                  </td>
                  <td className={s.celdaFlecha}>
                    <ChevronRight size={18} aria-hidden="true" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filas.length === 0 && <p className={s.vacio}>{busqueda || filtro !== 'todas' || appFiltro ? 'Ninguna persona coincide.' : 'Aún no hay personas.'}</p>}
      </div>

      {filas.length > 0 && (
        <nav className={s.paginacionPie} aria-label="Páginas de personas">
          <span aria-live="polite">
            {desde}–{hasta} de {filas.length}
          </span>
          <div className={s.paginas}>
            <Button variante="secundario" icono={ChevronLeft} disabled={paginaActual === 1} onClick={() => setPagina(paginaActual - 1)} aria-label="Página anterior" />
            <span className={s.paginaTexto}>
              Página {paginaActual} de {totalPaginas}
            </span>
            <Button variante="secundario" icono={ChevronRight} disabled={paginaActual === totalPaginas} onClick={() => setPagina(paginaActual + 1)} aria-label="Página siguiente" />
          </div>
        </nav>
      )}

      <ModalNueva
        abierto={nueva}
        onCerrar={() => setNueva(false)}
        onCreada={(r) => {
          setNueva(false);
          setTemporal({ titulo: 'Persona creada', email: r.usuario.email, password: r.passwordTemporal, id: r.usuario.id });
          ix.recargar();
        }}
      />
      <ModalTemporal
        datos={temporal}
        onCerrar={() => {
          // Tras crearla se abre su ficha para darle aplicaciones y equipos.
          if (temporal?.id) abrirPersona(temporal.id);
          setTemporal(null);
        }}
      />
      {lote && (
        <ModalLote
          tipo={lote}
          personas={seleccionadas}
          onCerrar={() => setLote(null)}
          onHecho={(aviso) => {
            setLote(null);
            setSeleccion(new Set());
            setAvisoLote(aviso);
          }}
        />
      )}
    </section>
  );
}
