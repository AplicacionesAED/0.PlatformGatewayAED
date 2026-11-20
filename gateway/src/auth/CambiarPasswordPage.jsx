import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Circle, KeyRound } from 'lucide-react';
import { Aviso, Button, Campo } from '../components/ui.jsx';
import { useAuth } from './AuthContext.jsx';
import { destinoSeguro, esRutaDelPortal } from './destino.js';
import AuthLayout from './AuthLayout.jsx';
import s from './Auth.module.css';

// Mismas reglas que valida el servicio (el servicio manda: esto solo da respuesta inmediata).
const REGLAS = [
  [/.{8,}/, 'Mínimo 8 caracteres'],
  [/[A-Z]/, 'Al menos una letra mayúscula'],
  [/[0-9]/, 'Al menos un número'],
  [/[^A-Za-z0-9]/, 'Al menos un carácter especial (!@#$%…)'],
];

export default function CambiarPasswordPage() {
  const { usuario, cambiarPassword, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destino = destinoSeguro(params.get('next'));

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cumple = REGLAS.map(([patron]) => patron.test(nueva));
  const coincide = nueva !== '' && nueva === repetida;
  const listo = actual !== '' && cumple.every(Boolean) && coincide;
  const obligatorio = usuario.debeCambiarPassword;

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await cambiarPassword(actual, nueva);
      if (esRutaDelPortal(destino)) navigate(destino, { replace: true });
      else window.location.assign(destino);
    } catch (err) {
      setError(err.details?.requisitos_faltantes ? `${err.message}: ${err.details.requisitos_faltantes.join(', ')}` : err.message);
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      titulo={obligatorio ? 'Crea tu contraseña' : 'Cambiar contraseña'}
      subtitulo={obligatorio ? 'Entraste con una contraseña temporal. Para continuar, define una propia.' : 'Elige una contraseña nueva para tu cuenta.'}
    >
      <form onSubmit={enviar} className={s.form} noValidate>
        <Campo etiqueta={obligatorio ? 'Contraseña temporal' : 'Contraseña actual'}>
          {(id, aria) => <input id={id} {...aria} type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Contraseña nueva">
          {(id, aria) => <input id={id} {...aria} type="password" autoComplete="new-password" required value={nueva} onChange={(e) => setNueva(e.target.value)} />}
        </Campo>

        <ul className={s.reglas} aria-label="Requisitos de la contraseña">
          {REGLAS.map(([, texto], i) => (
            <li key={texto} className={cumple[i] ? s.reglaOk : undefined}>
              {cumple[i] ? <Check size={15} strokeWidth={2.6} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
              {texto}
              <span className={s.soloLectores}>{cumple[i] ? ' (cumple)' : ' (falta)'}</span>
            </li>
          ))}
        </ul>

        <Campo etiqueta="Repite la contraseña nueva" error={repetida && !coincide ? 'No coinciden' : null}>
          {(id, aria) => <input id={id} {...aria} type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />}
        </Campo>

        {error && <Aviso>{error}</Aviso>}
        <Button type="submit" icono={KeyRound} cargando={enviando} disabled={!listo}>
          {enviando ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
        {obligatorio ? (
          <button type="button" className={s.enlace} onClick={logout}>
            Cerrar sesión
          </button>
        ) : (
          <button type="button" className={s.enlace} onClick={() => navigate('/')}>
            Cancelar
          </button>
        )}
      </form>
    </AuthLayout>
  );
}
