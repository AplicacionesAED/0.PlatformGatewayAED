import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Carga una ruta del servicio y permite recargarla tras un cambio. `ruta` debe ser un string (si cambia, vuelve a cargar).
export function useCarga(ruta) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });

  const recargar = useCallback(async () => {
    try {
      setEstado({ datos: await api.get(ruta), cargando: false, error: null });
    } catch (err) {
      setEstado((anterior) => ({ ...anterior, cargando: false, error: err.message }));
    }
  }, [ruta]);

  useEffect(() => {
    setEstado((anterior) => ({ ...anterior, cargando: true }));
    recargar();
  }, [recargar]);

  return { ...estado, recargar };
}

export const formatoFecha = (valor) =>
  valor ? new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }) : null;
