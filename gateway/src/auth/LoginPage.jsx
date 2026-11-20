import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { api } from '../api/client.js';
import { APPS } from '../apps.js';
import { Aviso, BotonIcono, Button, Campo } from '../components/ui.jsx';
import { useAuth } from './AuthContext.jsx';
import { destinoSeguro, esRutaDelPortal } from './destino.js';
import AuthLayout from './AuthLayout.jsx';
import s from './Auth.module.css';

// Codigos que devuelve el servicio al volver de Microsoft (?error=...).
const ERRORES_MICROSOFT = {
  OAuthAccountNotFound: 'Tu cuenta de Microsoft aún no tiene acceso al portal. Pide a TI que te registre.',
  OAuthAccountInactive: 'Tu cuenta está desactivada. Contacta a TI.',
  OAuthError: 'No se pudo iniciar sesión con Microsoft. Intenta de nuevo.',
};

function LogoMicrosoft() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function LoginPage() {
  const { usuario, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destino = destinoSeguro(params.get('next'));
  // Si se llego pidiendo una app (/siger/...), se dice cual: asi el login no parece generico ni que la persona se perdio.
  const appDestino = APPS.find((a) => a.href && destino.startsWith(a.href));
  const errorMicrosoft = ERRORES_MICROSOFT[params.get('error')] ?? (params.get('error') ? ERRORES_MICROSOFT.OAuthError : null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const ir = (ruta) => (esRutaDelPortal(ruta) ? navigate(ruta, { replace: true }) : window.location.assign(ruta));

  // Quien ya tiene sesion no necesita ver el login.
  useEffect(() => {
    if (usuario) ir(usuario.debeCambiarPassword ? `/cambiar-password?next=${encodeURIComponent(destino)}` : destino);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password); // al actualizarse `usuario`, el efecto de arriba redirige
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      titulo="Iniciar sesión"
      subtitulo={
        appDestino
          ? `Para abrir ${appDestino.nombre}, entra con tu cuenta de AED o con tu correo y contraseña.`
          : 'Entra con tu cuenta de AED o con tu correo y contraseña.'
      }
    >
      {errorMicrosoft && <Aviso>{errorMicrosoft}</Aviso>}

      <a className={s.microsoft} href={api.urlMicrosoft(destino)}>
        <LogoMicrosoft /> Entrar con Microsoft
      </a>
      <p className={s.nota}>Si tienes correo de AED, usa siempre esta opción.</p>

      <div className={s.separador} role="separator">
        <span>o con correo y contraseña</span>
      </div>

      <form onSubmit={enviar} className={s.form} noValidate>
        <Campo etiqueta="Correo">
          {(id, aria) => (
            <input id={id} {...aria} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Campo>
        <Campo etiqueta="Contraseña">
          {(id, aria) => (
            <div className={s.conIcono}>
              <input
                id={id}
                {...aria}
                type={verPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <BotonIcono
                icono={verPassword ? EyeOff : Eye}
                etiqueta={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={verPassword}
                onClick={() => setVerPassword((v) => !v)}
              />
            </div>
          )}
        </Campo>

        {error && <Aviso>{error}</Aviso>}
        <Button type="submit" icono={LogIn} cargando={enviando} disabled={!email || !password}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
