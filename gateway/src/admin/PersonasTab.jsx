import { useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Power, Search, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Aviso, BotonIcono, Button, Campo, Cargando, Insignia, Modal } from '../components/ui.jsx';
import { formatoFecha, useCarga } from './useCarga.js';
import s from './Admin.module.css';

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// La contraseña temporal se muestra UNA vez: el servicio no la guarda en claro y no hay forma de volver a verla.
function ModalTemporal({ datos, onCerrar }) {
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
    <Modal abierto={Boolean(datos)} onCerrar={onCerrar} titulo={datos?.titulo ?? ''} pie={<Button onClick={onCerrar}>Listo, ya la anoté</Button>}>
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

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva persona"
      pie={
        <>
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-nueva" icono={UserPlus} cargando={enviando} disabled={!email || !nombre}>Crear persona</Button>
        </>
      }
    >
      <form id="form-nueva" onSubmit={crear} className={s.formulario} noValidate>
        <Campo etiqueta="Correo" ayuda="Con correo de AED entra con Microsoft; con otro correo recibirá una contraseña temporal.">
          {(id, aria) => <input id={id} {...aria} type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Nombre">
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

export default function PersonasTab() {
  const { usuario: yo } = useAuth();
  const { datos, cargando, error, recargar } = useCarga('/usuarios');
  const [busqueda, setBusqueda] = useState('');
  const [nueva, setNueva] = useState(false);
  const [temporal, setTemporal] = useState(null);
  const [confirmar, setConfirmar] = useState(null); // { persona, tipo }
  const [errorAccion, setErrorAccion] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const filas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return (datos ?? []).filter((u) => !q || normalizar(`${u.nombre} ${u.email}`).includes(q));
  }, [datos, busqueda]);

  async function ejecutar() {
    const { persona, tipo } = confirmar;
    setTrabajando(true);
    setErrorAccion(null);
    try {
      if (tipo === 'reset') {
        const r = await api.post(`/usuarios/${persona.id}/reset-password`);
        setTemporal({ titulo: 'Contraseña restablecida', email: persona.email, password: r.passwordTemporal });
      } else if (tipo === 'desactivar') await api.patch(`/usuarios/${persona.id}`, { activo: false });
      else if (tipo === 'hacerAdmin') await api.patch(`/usuarios/${persona.id}`, { esAdmin: true });
      else if (tipo === 'quitarAdmin') await api.patch(`/usuarios/${persona.id}`, { esAdmin: false });
      setConfirmar(null);
      await recargar();
    } catch (err) {
      setErrorAccion(err.message);
      setConfirmar(null);
    } finally {
      setTrabajando(false);
    }
  }

  async function activar(persona) {
    setErrorAccion(null);
    try {
      await api.patch(`/usuarios/${persona.id}`, { activo: true });
      await recargar();
    } catch (err) {
      setErrorAccion(err.message);
    }
  }

  const textoConfirmar = {
    desactivar: (p) => [`Desactivar a ${p.nombre}`, 'Perderá el acceso al portal y a todas las aplicaciones en menos de una hora. Sus sesiones abiertas se cierran de inmediato.', 'Desactivar'],
    reset: (p) => [`Restablecer la contraseña de ${p.nombre}`, 'Se generará una contraseña temporal nueva y se cerrarán sus sesiones. La anterior deja de servir.', 'Restablecer'],
    hacerAdmin: (p) => [`Hacer administrador a ${p.nombre}`, 'Podrá crear personas, dar y quitar accesos y ver la auditoría.', 'Hacer administrador'],
    quitarAdmin: (p) => [`Quitar administrador a ${p.nombre}`, 'Dejará de poder administrar el portal.', 'Quitar rol'],
  };
  const [tituloConf, cuerpoConf, botonConf] = confirmar ? textoConfirmar[confirmar.tipo](confirmar.persona) : [];

  if (cargando && !datos) return <Cargando />;

  return (
    <section aria-label="Personas">
      <div className={s.barraHerramientas}>
        <label className={s.buscador}>
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="Buscar por nombre o correo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar persona" />
        </label>
        <Button icono={UserPlus} onClick={() => setNueva(true)}>Nueva persona</Button>
      </div>

      {(error || errorAccion) && <Aviso>{errorAccion || error}</Aviso>}

      <div className={s.tablaCaja}>
        <table className={s.tabla}>
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Estado</th>
              <th scope="col">Equipos</th>
              <th scope="col">Último ingreso</th>
              <th scope="col"><span className={s.soloLectores}>Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => {
              const soyYo = p.id === yo.id;
              return (
                <tr key={p.id} className={p.activo ? undefined : s.inactiva}>
                  <td>
                    <strong>{p.nombre}</strong>
                    <span className={s.sub}>{p.email}</span>
                  </td>
                  <td>
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
                  </td>
                  <td>
                    {p.equipos.length ? (
                      <div className={s.insignias}>
                        {p.equipos.map((e) => (
                          <Insignia key={e.id}>{e.nombre}</Insignia>
                        ))}
                      </div>
                    ) : (
                      <span className={s.sub}>—</span>
                    )}
                  </td>
                  <td>{formatoFecha(p.ultimoLogin) ?? <span className={s.sub}>Nunca</span>}</td>
                  <td>
                    <div className={s.acciones}>
                      {!p.corporativo && <BotonIcono icono={KeyRound} etiqueta={`Restablecer contraseña de ${p.nombre}`} onClick={() => setConfirmar({ persona: p, tipo: 'reset' })} />}
                      <BotonIcono
                        icono={p.esAdmin ? ShieldOff : ShieldCheck}
                        etiqueta={soyYo ? 'No puedes cambiar tu propio rol' : p.esAdmin ? `Quitar administrador a ${p.nombre}` : `Hacer administrador a ${p.nombre}`}
                        disabled={soyYo}
                        onClick={() => setConfirmar({ persona: p, tipo: p.esAdmin ? 'quitarAdmin' : 'hacerAdmin' })}
                      />
                      <BotonIcono
                        icono={Power}
                        peligro={p.activo}
                        etiqueta={soyYo ? 'No puedes desactivarte a ti mismo' : p.activo ? `Desactivar a ${p.nombre}` : `Activar a ${p.nombre}`}
                        disabled={soyYo}
                        onClick={() => (p.activo ? setConfirmar({ persona: p, tipo: 'desactivar' }) : activar(p))}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filas.length === 0 && <p className={s.vacio}>{busqueda ? 'Ninguna persona coincide con la búsqueda.' : 'Aún no hay personas.'}</p>}
      </div>

      <ModalNueva
        abierto={nueva}
        onCerrar={() => setNueva(false)}
        onCreada={(r) => {
          setNueva(false);
          setTemporal({ titulo: 'Persona creada', email: r.usuario.email, password: r.passwordTemporal });
          recargar();
        }}
      />
      <ModalTemporal datos={temporal} onCerrar={() => setTemporal(null)} />

      <Modal
        abierto={Boolean(confirmar)}
        onCerrar={() => setConfirmar(null)}
        titulo={tituloConf ?? ''}
        pie={
          <>
            <Button variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button variante={confirmar?.tipo === 'desactivar' ? 'peligro' : 'primario'} cargando={trabajando} onClick={ejecutar}>{botonConf}</Button>
          </>
        }
      >
        <p>{cuerpoConf}</p>
      </Modal>
    </section>
  );
}
