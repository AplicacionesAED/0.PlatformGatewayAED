import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import MenuUsuario from '../auth/MenuUsuario.jsx';
import PersonasTab from './PersonasTab.jsx';
import EquiposTab from './EquiposTab.jsx';
import AccesosTab from './AccesosTab.jsx';
import AuditoriaTab from './AuditoriaTab.jsx';
import s from './Admin.module.css';

const SECCIONES = [
  ['personas', 'Personas'],
  ['equipos', 'Equipos'],
  ['accesos', 'Accesos'],
  ['auditoria', 'Auditoría'],
];

export default function AdminPage() {
  const { usuario } = useAuth();

  return (
    <>
      <header className={s.barra}>
        <div className={s.barraInterna}>
          <img className={s.logo} src={`${import.meta.env.BASE_URL}aed-logo.png`} alt="AED" />
          <span className={s.divisor} aria-hidden="true" />
          <span className={s.producto}>Administración</span>
          <Link to="/" className={s.volver}>
            <ArrowLeft size={16} aria-hidden="true" /> Volver al portal
          </Link>
          <MenuUsuario usuario={usuario} />
        </div>
      </header>

      <main className={s.main}>
        <div>
          <h1 className={s.titulo}>Accesos al portal</h1>
          <p className={s.lead}>Quién entra a cada aplicación. Los permisos dentro de cada aplicación se siguen configurando en ella.</p>
        </div>

        <nav className={s.tabs} aria-label="Secciones de administración">
          {SECCIONES.map(([ruta, nombre]) => (
            <NavLink key={ruta} to={ruta} className={({ isActive }) => `${s.tab} ${isActive ? s.tabOn : ''}`}>
              {nombre}
            </NavLink>
          ))}
        </nav>

        <Routes>
          <Route index element={<Navigate to="personas" replace />} />
          <Route path="personas" element={<PersonasTab />} />
          <Route path="equipos" element={<EquiposTab />} />
          <Route path="accesos" element={<AccesosTab />} />
          <Route path="auditoria" element={<AuditoriaTab />} />
          <Route path="*" element={<Navigate to="personas" replace />} />
        </Routes>
      </main>
    </>
  );
}
