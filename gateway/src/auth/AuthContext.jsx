import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import { nombrePropio } from '../nombrePropio.js';

// Interruptor de despliegue: mientras el servicio de login (auth/) y el gateway no esten publicados, el portal se construye
// SIN login (VITE_PORTAL_AUTH distinto de "true") y se comporta exactamente como antes: sin sesion y con todas las tarjetas.
export const AUTH_ACTIVA = import.meta.env.VITE_PORTAL_AUTH === 'true';

const AuthContext = createContext(null);

const conNombres = (u) =>
  u && { ...u, nombre: nombrePropio(u.nombre), ...(u.suplantadoPor && { suplantadoPor: { ...u.suplantadoPor, nombre: nombrePropio(u.suplantadoPor.nombre) } }) };

// Estado de la sesion: { cargando, usuario, errorConexion }. El usuario solo se borra con un 401 real; si el servidor no
// responde (un despliegue, red caida) NO se manda a la persona al login: se avisa y se puede reintentar.
export function AuthProvider({ children }) {
  const [estado, setEstado] = useState({ cargando: true, usuario: null, errorConexion: false });

  const cargar = useCallback(async () => {
    try {
      setEstado({ cargando: false, usuario: conNombres(await api.get('/me')), errorConexion: false });
    } catch (err) {
      const sinSesion = err instanceof ApiError && err.status === 401;
      setEstado({ cargando: false, usuario: null, errorConexion: !sinSesion });
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const valor = useMemo(
    () => ({
      ...estado,
      recargar: () => {
        setEstado((e) => ({ ...e, cargando: true }));
        return cargar();
      },
      login: async (email, password) => {
        const usuario = conNombres(await api.post('/auth/login', { email, password }));
        setEstado({ cargando: false, usuario, errorConexion: false });
        return usuario;
      },
      cambiarPassword: async (passwordActual, passwordNueva) => {
        const usuario = conNombres(await api.post('/auth/cambiar-password', { passwordActual, passwordNueva }));
        setEstado({ cargando: false, usuario, errorConexion: false });
        return usuario;
      },
      // Suplantacion: entrar como otra persona y regresar. Tras cada cambio se recarga la pagina entera para que nada de la
      // sesion anterior (datos de administracion, apps) quede en memoria.
      suplantar: async (usuarioId) => {
        await api.post('/auth/suplantar', { usuarioId });
        window.location.assign(import.meta.env.BASE_URL);
      },
      regresar: async () => {
        const suplantada = estado.usuario?.id;
        try {
          await api.post('/auth/suplantar/fin');
          window.location.assign(`${import.meta.env.BASE_URL}admin/personas${suplantada ? `?persona=${suplantada}` : ''}`);
        } catch (err) {
          // La sesion suplantada ya vencio o quien suplanta dejo de ser administrador: toca volver a iniciar sesion.
          if (err instanceof ApiError && err.status === 401) window.location.assign(`${import.meta.env.BASE_URL}login`);
          else throw err;
        }
      },
      logout: async () => {
        try {
          await api.post('/auth/logout');
        } finally {
          setEstado({ cargando: false, usuario: null, errorConexion: false });
        }
      },
    }),
    [estado, cargar]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

// Con el interruptor apagado no hay proveedor: devuelve null y el portal funciona sin sesion.
export const useAuth = () => useContext(AuthContext);
