import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Inter alojada en el proyecto (sin Google Fonts), igual que las apps.
import '@fontsource-variable/inter';
import { AUTH_ACTIVA, AuthProvider } from './auth/AuthContext.jsx';
import Rutas from './Rutas.jsx';
import './index.css';

const app = (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <Rutas />
  </BrowserRouter>
);

createRoot(document.getElementById('root')).render(<StrictMode>{AUTH_ACTIVA ? <AuthProvider>{app}</AuthProvider> : app}</StrictMode>);
