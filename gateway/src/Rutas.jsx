import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AUTH_ACTIVA, useAuth } from './auth/AuthContext.jsx';
import { Button, Cargando } from './components/ui.jsx';
import Portal from './App.jsx';
import LoginPage from './auth/LoginPage.jsx';
import CambiarPasswordPage from './auth/CambiarPasswordPage.jsx';
import FranjaSuplantacion from './auth/FranjaSuplantacion.jsx';

// La administracion solo la usan unas pocas personas: no se baja con el portal.
const AdminPage = lazy(() => import('./admin/AdminPage.jsx'));

function Pantalla({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', gap: 16, padding: 24, textAlign: 'center' }}>{children}</div>;
}

// Exige sesion (y, si se pide, rol de administrador). Un cambio de contraseña pendiente se atiende antes que cualquier otra pantalla.
function RequiereSesion({ admin = false, children }) {
  const { cargando, usuario, errorConexion, recargar } = useAuth();
  const { pathname, search } = useLocation();

  if (cargando) return <Pantalla><Cargando texto="Verificando tu sesión…" /></Pantalla>;
  if (errorConexion) {
    return (
      <Pantalla>
        <div>
          <p style={{ marginBottom: 12 }}>No se pudo conectar con el servidor.</p>
          <Button onClick={recargar}>Reintentar</Button>
        </div>
      </Pantalla>
    );
  }
  if (!usuario) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  if (usuario.debeCambiarPassword && pathname !== '/cambiar-password') {
    return <Navigate to={`/cambiar-password?next=${encodeURIComponent(pathname + search)}`} replace />;
  }
  if (admin && !usuario.esAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function Rutas() {
  // Sin login activo (interruptor apagado) el portal es el de siempre: una sola pantalla, sin sesion.
  if (!AUTH_ACTIVA) return <Portal />;

  return (
    <>
      <FranjaSuplantacion />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cambiar-password" element={<RequiereSesion><CambiarPasswordPage /></RequiereSesion>} />
        <Route
          path="/admin/*"
          element={
            <RequiereSesion admin>
              <Suspense fallback={<Pantalla><Cargando /></Pantalla>}>
                <AdminPage />
              </Suspense>
            </RequiereSesion>
          }
        />
        <Route path="/" element={<RequiereSesion><Portal /></RequiereSesion>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
