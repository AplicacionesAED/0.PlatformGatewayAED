import { Link, NavLink, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AppWindow, ArrowLeft, ScrollText, UserRound, UserX, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import MenuUsuario from '../auth/MenuUsuario.jsx';
import PersonasTab from './PersonasTab.jsx';
import EquiposTab from './EquiposTab.jsx';
import AplicacionesTab from './AplicacionesTab.jsx';
import AuditoriaTab from './AuditoriaTab.jsx';
import FichaPersona from './FichaPersona.jsx';
import { AdminDatos, useDatos } from './datos.jsx';
import { DirectoOEquipo } from './Impacto.jsx';
import { DIAS_ALERTAS, totalAlertas, useAlertas } from './AlertasSeguridad.jsx';
import s from './Admin.module.css';

const SECCIONES = [
  ['personas', 'Personas', UserRound],
  ['equipos', 'Equipos', Users],
  ['aplicaciones', 'Aplicaciones', AppWindow],
  ['auditoria', 'Auditoría', ScrollText],
];

// La ficha de persona se abre con ?persona=ID desde cualquier pestaña (tabla, equipo, aplicación, auditoría).
function FichaDesdeUrl() {
  const [params, setParams] = useSearchParams();
  const id = Number(params.get('persona')) || null;
  return (
    <FichaPersona
      id={id}
      onCerrar={() =>
        setParams((p) => {
          const n = new URLSearchParams(p);
          n.delete('persona');
          return n;
        })
      }
    />
  );
}

// Pregunta comun tras agregar personas a un equipo (buscador, "Agregar varios", copiar o mover, ficha, lote).
function PreguntaAlEntrar() {
  const ix = useDatos();
  return ix.alEntrar && ix.datos ? <DirectoOEquipo key={`${ix.alEntrar.equipoId}-${ix.alEntrar.ids.join(',')}`} /> : null;
}

// Cifras de un vistazo en la cabecera. "Sin aplicaciones" = personas activas que no entran a nada (revisar).
function Indicadores() {
  const ix = useDatos();
  if (!ix.datos) return <div className={s.indicadores} aria-hidden="true" />;
  const { usuarios, equipos, apps } = ix.datos;
  const activas = usuarios.filter((u) => u.activo);
  const sinApps = activas.filter((u) => ix.appsDe(u).length === 0).length;
  const lista = [
    ['Personas activas', activas.length, UserRound, '#20a7a1'],
    ['Equipos', equipos.length, Users, '#8f95ff'],
    ['Aplicaciones activas', apps.filter((a) => a.activa).length, AppWindow, '#22e76a'],
    ['Sin aplicaciones', sinApps, UserX, sinApps ? '#ffb547' : '#22e76a'],
  ];
  return (
    <dl className={s.indicadores}>
      {lista.map(([nombre, valor, Icono, color]) => (
        <div key={nombre} className={s.indicador} style={{ '--c': color }}>
          <dt>
            <Icono size={16} aria-hidden="true" /> {nombre}
          </dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminPage() {
  const { usuario } = useAuth();
  const alertas = useAlertas();
  const pendientes = totalAlertas(alertas);

  return (
    <AdminDatos>
      <div className={s.cabecera}>
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

        <div className={s.hero}>
          <div>
            <h1 className={s.titulo}>Accesos al portal</h1>
            <p className={s.lead}>Quién entra a cada aplicación. Los permisos dentro de cada aplicación se siguen configurando en ella.</p>
          </div>
          <Indicadores />
          <nav className={s.tabs} aria-label="Secciones de administración">
            {SECCIONES.map(([ruta, nombre, Icono]) => (
              <NavLink key={ruta} to={ruta} className={({ isActive }) => `${s.tab} ${isActive ? s.tabOn : ''}`}>
                <Icono size={16} aria-hidden="true" /> {nombre}
                {ruta === 'auditoria' && pendientes > 0 && (
                  <span className={s.tabAlerta} title={`${pendientes} alertas de seguridad en los últimos ${DIAS_ALERTAS} días`}>
                    {pendientes}
                    <span className={s.soloLectores}> alertas de seguridad</span>
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <main className={s.main}>
        <Routes>
          <Route index element={<Navigate to="personas" replace />} />
          <Route path="personas" element={<PersonasTab />} />
          <Route path="equipos" element={<EquiposTab />} />
          <Route path="aplicaciones" element={<AplicacionesTab />} />
          <Route path="accesos" element={<Navigate to="/admin/aplicaciones" replace />} />
          <Route path="auditoria" element={<AuditoriaTab alertas={alertas} />} />
          <Route path="*" element={<Navigate to="personas" replace />} />
        </Routes>
      </main>

      <FichaDesdeUrl />
      <PreguntaAlEntrar />
    </AdminDatos>
  );
}
