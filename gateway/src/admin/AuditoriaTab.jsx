import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client.js';
import { Aviso, Button, Cargando } from '../components/ui.jsx';
import { formatoFecha } from './useCarga.js';
import s from './Admin.module.css';

const LIMITE = 50;

const ACCIONES = {
  'login.ok': 'Inicio de sesión',
  'login.fallido': 'Inicio de sesión fallido',
  'login.bloqueado': 'Cuenta bloqueada por intentos',
  logout: 'Cierre de sesión',
  'sesion.reuso': 'Posible robo de sesión',
  'password.cambio': 'Cambio de contraseña',
  'usuario.crear': 'Persona creada',
  'usuario.actualizar': 'Persona modificada',
  'usuario.reset-password': 'Contraseña restablecida',
  'equipo.crear': 'Equipo creado',
  'equipo.actualizar': 'Equipo modificado',
  'equipo.eliminar': 'Equipo eliminado',
  'equipo.miembros': 'Miembros del equipo',
  'acceso.conceder': 'Acceso concedido',
  'acceso.revocar': 'Acceso quitado',
  'app.actualizar': 'Aplicación modificada',
};

const detalleTexto = (d) =>
  Object.entries(d ?? {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');

export default function AuditoriaTab() {
  const [accion, setAccion] = useState('');
  const [offset, setOffset] = useState(0);
  const [estado, setEstado] = useState({ filas: [], total: 0, cargando: true, error: null });

  useEffect(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true }));
    api
      .pagina(`/auditoria?limit=${LIMITE}&offset=${offset}${accion ? `&accion=${encodeURIComponent(accion)}` : ''}`)
      .then(({ data, meta }) => vigente && setEstado({ filas: data, total: meta.total ?? 0, cargando: false, error: null }))
      .catch((err) => vigente && setEstado((e) => ({ ...e, cargando: false, error: err.message })));
    return () => {
      vigente = false;
    };
  }, [accion, offset]);

  const desde = estado.total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + LIMITE, estado.total);

  return (
    <section aria-label="Auditoría">
      <div className={s.barraHerramientas}>
        <label className={s.filtro}>
          <span>Acción</span>
          <select
            value={accion}
            onChange={(e) => {
              setAccion(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([valor, nombre]) => (
              <option key={valor} value={valor}>{nombre}</option>
            ))}
          </select>
        </label>
        <div className={s.paginacion}>
          <span aria-live="polite">{desde}–{hasta} de {estado.total}</span>
          <Button variante="secundario" icono={ChevronLeft} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMITE))} aria-label="Página anterior" />
          <Button variante="secundario" icono={ChevronRight} disabled={hasta >= estado.total} onClick={() => setOffset(offset + LIMITE)} aria-label="Página siguiente" />
        </div>
      </div>

      {estado.error && <Aviso>{estado.error}</Aviso>}
      {estado.cargando && estado.filas.length === 0 ? (
        <Cargando />
      ) : (
        <div className={s.tablaCaja}>
          <table className={s.tabla}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Quién</th>
                <th scope="col">Acción</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {estado.filas.map((f) => (
                <tr key={f.id}>
                  <td className={s.nowrap}>{formatoFecha(f.creado_en)}</td>
                  <td>{f.actor ? <><strong>{f.actor.nombre}</strong><span className={s.sub}>{f.actor.email}</span></> : <span className={s.sub}>—</span>}</td>
                  <td>{ACCIONES[f.accion] ?? f.accion}</td>
                  <td className={s.detalle}>{detalleTexto(f.detalle)}{f.ip ? <span className={s.sub}> · IP {f.ip}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {estado.filas.length === 0 && <p className={s.vacio}>No hay registros.</p>}
        </div>
      )}
    </section>
  );
}
