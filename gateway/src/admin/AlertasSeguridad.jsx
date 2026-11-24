// Alertas de seguridad de los ultimos 7 dias (posibles robos de sesion, cuentas bloqueadas, inicios fallidos y correos con
// varios fallos). Van arriba de la auditoria y como contador en su pestaña, para que no se pierdan entre los registros.
import { useEffect, useState } from 'react';
import { KeyRound, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { formatoFecha } from './useCarga.js';
import s from './Admin.module.css';

export const DIAS_ALERTAS = 7;

export function useAlertas() {
  const [alertas, setAlertas] = useState(null);
  useEffect(() => {
    let vigente = true;
    api
      .get(`/auditoria/alertas?dias=${DIAS_ALERTAS}`)
      .then((a) => vigente && setAlertas(a))
      .catch(() => {}); // sin alertas no se rompe nada: la auditoria sigue mostrando todo
    return () => {
      vigente = false;
    };
  }, []);
  return alertas;
}

// Lo que pide atencion: robos de sesion, bloqueos y correos con fallos repetidos (los fallos sueltos son normales).
export const totalAlertas = (a) => (a ? a.sesionReuso + a.bloqueos + a.repetidos.length : 0);

// Dia de hace N dias en hora de Colombia (AAAA-MM-DD), para el filtro "desde".
const haceDias = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

// `onFiltrar({ accion, usuario })` pone los filtros de la auditoria (desde hace 7 dias).
export default function AlertasSeguridad({ alertas, onFiltrar }) {
  if (!alertas) return null;
  const desde = haceDias(DIAS_ALERTAS);

  if (totalAlertas(alertas) === 0) {
    return (
      <p className={s.alertasCalma}>
        <ShieldCheck size={18} aria-hidden="true" /> Sin alertas de seguridad en los últimos {DIAS_ALERTAS} días
        {alertas.fallidos ? ` (${alertas.fallidos} ${alertas.fallidos === 1 ? 'inicio fallido suelto' : 'inicios fallidos sueltos'})` : ''}.
      </p>
    );
  }

  const tarjetas = [
    ['sesion.reuso', 'Posibles robos de sesión', alertas.sesionReuso, ShieldAlert, 'Se reusó un token de sesión ya cambiado: se cerraron todas las sesiones de esa persona.'],
    ['login.bloqueado', 'Cuentas bloqueadas', alertas.bloqueos, Lock, '5 contraseñas malas seguidas: la cuenta queda bloqueada 15 minutos.'],
    ['login.fallido', 'Inicios fallidos', alertas.fallidos, KeyRound, 'Contraseña mala, correo inexistente o cuenta inactiva.'],
  ];

  return (
    <section className={s.alertas} aria-label={`Alertas de seguridad de los últimos ${DIAS_ALERTAS} días`}>
      <h2 className={s.alertasTitulo}>
        <ShieldAlert size={18} aria-hidden="true" /> Alertas de seguridad · últimos {DIAS_ALERTAS} días
      </h2>
      <div className={s.alertasTarjetas}>
        {tarjetas.map(([accion, nombre, total, Icono, ayuda]) => (
          <button
            key={accion}
            type="button"
            className={`${s.alertaTarjeta} ${total ? s.alertaActiva : ''}`}
            title={ayuda}
            onClick={() => onFiltrar({ accion, desde })}
          >
            <Icono size={18} aria-hidden="true" />
            <span className={s.alertaCifra}>{total}</span>
            <span>{nombre}</span>
          </button>
        ))}
      </div>
      {alertas.repetidos.length > 0 && (
        <div className={s.alertasRepetidos}>
          <span className={s.sub}>Correos con 3 o más inicios fallidos (posible intento de adivinar la contraseña):</span>
          <ul>
            {alertas.repetidos.map((r) => (
              <li key={r.email ?? 'sin-correo'}>
                <button type="button" className={s.nombreBoton} onClick={() => onFiltrar({ accion: 'login.fallido', desde, usuario: r.usuarioId ?? '' })}>
                  {r.email ?? 'sin correo'}
                </button>
                <span className={s.sub}>
                  {r.intentos} intentos · último {formatoFecha(r.ultimo)}
                  {r.usuarioId ? '' : ' · no es una persona del portal'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
