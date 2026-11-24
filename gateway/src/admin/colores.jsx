// Color de identidad de cada cosa en la administracion: las apps usan el mismo acento e icono que su tarjeta del portal
// (apps.js); equipos y personas reciben un color fijo de la paleta de marca segun su id, asi siempre se ven iguales.
import { AppWindow } from 'lucide-react';
import { APPS } from '../apps.js';
import s from './Admin.module.css';

const POR_SLUG = new Map(APPS.filter((a) => a.slug).map((a) => [a.slug, a]));
const PALETA = ['#232bed', '#0f8f8a', '#c0551a', '#3b6ea5', '#1a8a4a', '#0b2d4d', '#7a3fb0', '#20a7a1'];

export const colorApp = (app) => POR_SLUG.get(app?.slug)?.acento ?? '#3b6ea5';
export const iconoApp = (app) => POR_SLUG.get(app?.slug)?.icono ?? AppWindow;
export const colorDe = (id) => PALETA[Math.abs(Number(id) || 0) % PALETA.length];

// Dos letras siempre: primera de las dos primeras palabras, o las dos primeras de una sola palabra ("Obra" -> "OB").
export const iniciales = (nombre = '') => {
  const partes = nombre.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return partes
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
};

// Tono de cada accion de la auditoria: ingresos en verde, fallos y alertas en rojo, cambios de administracion por tipo.
export function tonoAccion(accion) {
  if (accion === 'login.ok') return 'ok';
  if (accion === 'login.fallido' || accion === 'login.bloqueado' || accion === 'sesion.reuso' || accion === 'equipo.eliminar' || accion === 'acceso.revocar') return 'error';
  if (accion.startsWith('acceso.')) return 'acceso';
  if (accion.startsWith('equipo.')) return 'equipo';
  if (accion.startsWith('usuario.') || accion.startsWith('password.')) return 'info';
  return 'neutro';
}

export function Avatar({ nombre, id, grande = false }) {
  return (
    <span className={`${s.avatar} ${grande ? s.avatarGrande : ''}`} style={{ '--c': colorDe(id) }} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

export function IconoApp({ app, tam = 18 }) {
  const Icono = iconoApp(app);
  return (
    <span className={s.iconoApp} style={{ '--c': colorApp(app) }} aria-hidden="true">
      <Icono size={tam} strokeWidth={2.25} />
    </span>
  );
}

// Un equipo se reconoce por sus iniciales sobre su color (no un icono generico igual para todos).
export function IconoEquipo({ equipo, grande = false }) {
  return (
    <span className={`${s.iconoApp} ${s.iconoEquipo} ${grande ? s.iconoEquipoGrande : ''}`} style={{ '--c': colorDe(equipo.id) }} aria-hidden="true">
      {iniciales(equipo.nombre)}
    </span>
  );
}

// Cuadrito de una app para filas compactas: solo el icono en su color; el nombre va en el tooltip y para lectores.
export function MiniApp({ app }) {
  const Icono = iconoApp(app);
  return (
    <span className={s.miniApp} style={{ '--c': colorApp(app) }} title={app.nombre} role="img" aria-label={app.nombre}>
      <Icono size={13} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}

// Insignia de una app con su color (tablas y tarjetas de equipo).
export function InsigniaApp({ app }) {
  return (
    <span className={s.insigniaApp} style={{ '--c': colorApp(app) }}>
      {app.nombre}
    </span>
  );
}
