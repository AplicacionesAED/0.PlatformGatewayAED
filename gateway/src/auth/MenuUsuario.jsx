import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, KeyRound, LogOut, Settings } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import s from './MenuUsuario.module.css';

const iniciales = (nombre) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

// Menu de la persona en sesion (en el encabezado del portal y de la administracion): administracion, contraseña y salir.
export default function MenuUsuario({ usuario }) {
  const { logout } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef(null);
  const boton = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => !raiz.current?.contains(e.target) && setAbierto(false);
    const escape = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div className={s.raiz} ref={raiz}>
      <button ref={boton} type="button" className={s.boton} aria-expanded={abierto} aria-haspopup="menu" onClick={() => setAbierto((a) => !a)}>
        <span className={s.avatar} aria-hidden="true">
          {iniciales(usuario.nombre)}
        </span>
        <span className={s.nombre}>{usuario.nombre}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {abierto && (
        <div className={s.menu} role="menu">
          <div className={s.quien}>
            <strong>{usuario.nombre}</strong>
            <span>{usuario.email}</span>
          </div>
          {usuario.esAdmin && (
            <Link to="/admin" role="menuitem" className={s.item} onClick={() => setAbierto(false)}>
              <Settings size={16} aria-hidden="true" /> Administración
            </Link>
          )}
          {usuario.tienePassword && (
            <Link to="/cambiar-password" role="menuitem" className={s.item} onClick={() => setAbierto(false)}>
              <KeyRound size={16} aria-hidden="true" /> Cambiar contraseña
            </Link>
          )}
          <button type="button" role="menuitem" className={s.item} onClick={logout}>
            <LogOut size={16} aria-hidden="true" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
