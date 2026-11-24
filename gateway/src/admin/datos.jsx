// Datos compartidos por toda la administracion: personas, equipos, apps y accesos se cargan una vez y se recargan tras cada
// cambio. Las fichas (persona, equipo, aplicacion) y las pestañas leen de aqui, asi todas muestran lo mismo.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

export const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// `q` ya normalizada; vacia coincide con todo.
export const coincide = (q, ...textos) => !q || normalizar(textos.join(' ')).includes(q);

function indexar({ usuarios, equipos, apps, accesos }) {
  const personaPorId = new Map(usuarios.map((u) => [u.id, u]));
  const equipoPorId = new Map(equipos.map((e) => [e.id, e]));
  const appPorId = new Map(apps.map((a) => [a.id, a]));
  const appPorSlug = new Map(apps.map((a) => [a.slug, a]));
  const directos = new Map(); // usuarioId -> Map(appId -> id del acceso)
  const deEquipo = new Map(); // equipoId -> Map(appId -> id del acceso)
  for (const a of accesos) {
    const [mapa, clave] = a.usuario_id != null ? [directos, a.usuario_id] : [deEquipo, a.equipo_id];
    if (!mapa.has(clave)) mapa.set(clave, new Map());
    mapa.get(clave).set(a.app_id, a.id);
  }

  // Por cada app que la persona tiene por algun lado: si es directa (id del acceso) y por cuales equipos le llega.
  const origenes = (u) => {
    const r = new Map();
    const de = (appId) => {
      if (!r.has(appId)) r.set(appId, { app: appPorId.get(appId), accesoId: null, equipos: [] });
      return r.get(appId);
    };
    for (const [appId, accesoId] of directos.get(u.id) ?? []) de(appId).accesoId = accesoId;
    for (const e of u.equipos) for (const appId of deEquipo.get(e.id)?.keys() ?? []) de(appId).equipos.push(e);
    return r;
  };
  // Apps activas que tiene asignadas (no mira si la persona esta activa).
  const appsDe = (u) => [...origenes(u).values()].map((o) => o.app).filter((a) => a?.activa);

  // App que administra un acceso directo (slug, p. ej. 'hrsm') o null si lo dio un administrador.
  const gestionPorId = new Map(accesos.map((a) => [a.id, a.gestionado_por ?? null]));
  const gestionadoPor = (accesoId) => (accesoId ? gestionPorId.get(accesoId) ?? null : null);

  // Que pasa si `equipo` deja de dar `appId`: quien la pierde y quien la conserva (directa o por otro equipo).
  const impactoQuitarApp = (equipo, appId) => {
    const pierden = [];
    const conservan = [];
    for (const m of equipo.miembros) {
      const u = personaPorId.get(m.id);
      if (!u) continue;
      const o = origenes(u).get(appId);
      if (o?.accesoId || o?.equipos.some((e) => e.id !== equipo.id)) conservan.push(u);
      else pierden.push(u);
    }
    return { pierden, conservan };
  };

  // Apps que `u` perderia al salir de `equipo` (si ademas entra a `destino`, lo que ese equipo da no se pierde).
  const pierdeAlSalir = (equipo, u, destino = null) => {
    const perdidas = [];
    for (const appId of deEquipo.get(equipo.id)?.keys() ?? []) {
      if (destino && deEquipo.get(destino.id)?.has(appId)) continue;
      const o = origenes(u).get(appId);
      if (o?.accesoId || o?.equipos.some((e) => e.id !== equipo.id)) continue;
      perdidas.push(appPorId.get(appId));
    }
    return perdidas;
  };

  // Que pasa si se elimina `equipo`: por persona, las apps que dejaria de tener.
  const impactoEliminarEquipo = (equipo) => {
    const porPersona = [];
    for (const appId of deEquipo.get(equipo.id)?.keys() ?? []) {
      for (const u of impactoQuitarApp(equipo, appId).pierden) {
        let fila = porPersona.find((f) => f.persona.id === u.id);
        if (!fila) porPersona.push((fila = { persona: u, apps: [] }));
        fila.apps.push(appPorId.get(appId));
      }
    }
    return porPersona;
  };

  // Accesos directos que sobran: dados a mano (no gestionados por una app) a alguien que ya tiene la app por un equipo.
  // Con `equipo`, solo entre sus miembros y contando la app que ese equipo va a dar.
  const redundantes = (appId, equipo = null) => {
    const lista = [];
    const candidatos = equipo ? equipo.miembros.map((m) => personaPorId.get(m.id)).filter(Boolean) : usuarios;
    for (const u of candidatos) {
      const accesoId = directos.get(u.id)?.get(appId);
      if (!accesoId || gestionadoPor(accesoId)) continue;
      if (equipo || origenes(u).get(appId)?.equipos.length) lista.push({ persona: u, accesoId });
    }
    return lista;
  };

  return { personaPorId, equipoPorId, appPorId, appPorSlug, directos, deEquipo, origenes, appsDe, gestionadoPor, impactoQuitarApp, impactoEliminarEquipo, redundantes, pierdeAlSalir };
}

const Contexto = createContext(null);

export function AdminDatos({ children }) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });

  const recargar = useCallback(async () => {
    try {
      const [usuarios, equipos, matriz] = await Promise.all([api.get('/usuarios'), api.get('/equipos'), api.get('/accesos/matriz')]);
      setEstado({ datos: { usuarios, equipos, apps: matriz.apps, accesos: matriz.accesos }, cargando: false, error: null });
    } catch (err) {
      setEstado((anterior) => ({ ...anterior, cargando: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const indices = useMemo(() => (estado.datos ? indexar(estado.datos) : null), [estado.datos]);
  const valor = useMemo(() => ({ ...estado, ...indices, recargar }), [estado, indices, recargar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useDatos = () => useContext(Contexto);

// La ficha de persona vive en la URL (?persona=ID): se abre desde cualquier pestaña y se puede compartir el enlace.
export function useAbrirPersona() {
  const [, setParams] = useSearchParams();
  return useCallback(
    (id) =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('persona', String(id));
        return n;
      }),
    [setParams]
  );
}

// Quita varios accesos (de a uno: el servicio no tiene operacion en lote). Devuelve cuantos fallaron.
export async function quitarAccesos(ids) {
  let fallos = 0;
  for (const id of ids) {
    try {
      await api.delete(`/accesos/${id}`);
    } catch {
      fallos += 1;
    }
  }
  return fallos;
}

// Fija los miembros de un equipo (el servicio reemplaza la lista completa con lo que recibe).
export const fijarMiembros = (equipo, ids) => api.put(`/equipos/${equipo.id}/miembros`, { usuarioIds: [...new Set(ids)] });
