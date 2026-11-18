import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Clock, History, Lock, Search } from 'lucide-react';
import { APPS } from './apps.js';
import styles from './App.module.css';

const BASE = import.meta.env.BASE_URL;

// Fotos del hero: proyectos de AED, tomadas de aed.com.co (Todos los proyectos).
const FOTOS = [
  { src: `${BASE}proyectos/baia-kabo.webp`, pie: 'Baía Kabo' },
  { src: `${BASE}proyectos/kristal-blu.webp`, pie: 'Kristal Blu' },
  { src: `${BASE}proyectos/vela-village.webp`, pie: 'Vela Village' },
  { src: `${BASE}proyectos/matimba.webp`, pie: 'Matimbá Club & Spa' },
];

const PROYECTOS = [
  { nombre: 'OLIV Cartagena', logo: `${BASE}proyectos/logo-oliv.webp` },
  { nombre: 'ALMAR Matimba', logo: `${BASE}proyectos/logo-almar.webp` },
  { nombre: 'Baía Kristal Cartagena', logo: `${BASE}proyectos/logo-baia-kristal.webp` },
];

const CLAVE_RECIENTES = 'aed-portal-recientes';
const AREAS = [...new Set(APPS.map((a) => a.area))];

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function leerRecientes() {
  try {
    const ids = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function guardarReciente(id) {
  try {
    const ids = [id, ...leerRecientes().filter((x) => x !== id)].slice(0, 4);
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(ids));
  } catch {
    /* sin almacenamiento: no se recuerdan recientes */
  }
}

function saludo(fecha) {
  const h = Number(fecha.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }));
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

// Estado en vivo de cada app con `salud`: 'ok', 'caida' o undefined (sin dato: p. ej. en desarrollo, donde la ruta
// devuelve el index.html de Vite y no JSON).
function useSalud() {
  const [salud, setSalud] = useState({});
  useEffect(() => {
    let vivo = true;
    async function revisar() {
      const res = await Promise.all(
        APPS.filter((a) => a.salud && a.estado === 'disponible').map(async (a) => {
          try {
            const r = await fetch(a.salud, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
            if (!r.ok) return [a.id, 'caida'];
            const tipo = r.headers.get('content-type') || '';
            return [a.id, tipo.includes('json') ? 'ok' : undefined];
          } catch {
            return [a.id, 'caida'];
          }
        }),
      );
      if (vivo) setSalud(Object.fromEntries(res));
    }
    revisar();
    const t = setInterval(revisar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);
  return salud;
}

function Contador({ valor }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(valor);
      return undefined;
    }
    let raf;
    const inicio = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - inicio) / 900);
      setN(Math.round(valor * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return n;
}

function Insignia({ disponible, estado }) {
  if (!disponible) {
    return (
      <span className={`${styles.badge} ${styles.badgeSoon}`}>
        <Clock size={12} strokeWidth={2.2} /> En desarrollo
      </span>
    );
  }
  if (estado === 'caida') {
    return (
      <span className={`${styles.badge} ${styles.badgeDown}`}>
        <span className={styles.dot} /> Sin respuesta
      </span>
    );
  }
  return (
    <span className={`${styles.badge} ${styles.badgeLive}`}>
      <span className={`${styles.dot} ${estado === 'ok' ? styles.dotPulse : ''}`} />
      {estado === 'ok' ? 'En línea' : 'Disponible'}
    </span>
  );
}

// Luz que sigue al cursor sobre la tarjeta (posición en variables CSS, sin re-render).
function moverLuz(e) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

function AppCard({ app, indice, estado }) {
  const Icono = app.icono;
  const disponible = app.estado === 'disponible';
  // Bloqueada: figura como disponible pero la tarjeta no abre la app (se sigue pudiendo entrar por URL).
  const bloqueada = disponible && app.bloqueada;

  const contenido = (
    <>
      <div className={styles.cardMedia} aria-hidden="true">
        <span className={styles.icon}>
          <Icono size={26} strokeWidth={1.7} />
        </span>
        <span className={styles.area}>{app.area}</span>
        <Insignia disponible={disponible} estado={estado} />
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{app.nombre}</h3>
        <p className={styles.cardText}>{app.descripcion}</p>
      </div>
      <div className={styles.cardFoot}>
        {bloqueada ? (
          <>
            <span>Acceso bloqueado</span>
            <Lock size={15} strokeWidth={2.2} aria-hidden="true" />
          </>
        ) : disponible ? (
          <>
            <span>Abrir aplicación</span>
            <ArrowRight size={16} strokeWidth={2.2} className={styles.arrow} aria-hidden="true" />
          </>
        ) : (
          <span>En preparación</span>
        )}
      </div>
    </>
  );

  const estilo = { '--acento': app.acento, '--i': indice };

  if (disponible && !bloqueada) {
    return (
      <a
        className={`${styles.card} ${styles.cardLive}`}
        href={app.href}
        style={estilo}
        onPointerMove={moverLuz}
        onClick={() => guardarReciente(app.id)}
      >
        {contenido}
      </a>
    );
  }
  return (
    <div className={`${styles.card} ${styles.cardOff}`} style={estilo} aria-disabled="true">
      {contenido}
    </div>
  );
}

function Seccion({ titulo, apps, salud }) {
  if (apps.length === 0) return null;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{titulo}</h2>
        <span className={styles.count}>{apps.length}</span>
      </div>
      <div className={styles.grid}>
        {apps.map((app, i) => (
          <AppCard key={app.id} app={app} indice={i} estado={salud[app.id]} />
        ))}
      </div>
    </section>
  );
}

function Hero({ busqueda, setBusqueda, alEnter, inputRef }) {
  const ahora = useAhora();
  const [foto, setFoto] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setFoto((f) => (f + 1) % FOTOS.length), 7000);
    return () => clearInterval(t);
  }, []);

  const fecha = ahora.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  });
  const totalDisponibles = APPS.filter((a) => a.estado === 'disponible').length;

  return (
    <div className={styles.top}>
      <div className={styles.fotos} aria-hidden="true">
        {FOTOS.map((f, i) => (
          <img key={f.src} src={f.src} alt="" className={i === foto ? styles.fotoOn : undefined} />
        ))}
      </div>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <img className={styles.logo} src={`${BASE}aed-logo.png`} alt="AED" />
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.product}>Plataforma</span>
          <span className={styles.fecha}>{fecha}</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>{saludo(ahora)}</span>
            <h1 className={styles.title}>
              Las herramientas de AED, <span className={styles.titleAccent}>en un solo lugar.</span>
            </h1>
            <p className={styles.lead}>
              Cada módulo del negocio, de la contratación a la obra, con un único punto de entrada.
            </p>
            <label className={styles.search}>
              <Search size={19} strokeWidth={2} aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                placeholder="Buscar aplicación…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && alEnter()}
                aria-label="Buscar aplicación"
                aria-keyshortcuts="/"
              />
              <kbd className={styles.kbd} aria-hidden="true">
                /
              </kbd>
            </label>
          </div>

          <dl className={styles.stats}>
            <div>
              <dt>Aplicaciones activas</dt>
              <dd>
                <Contador valor={totalDisponibles} />
              </dd>
            </div>
            <div>
              <dt>Áreas de negocio</dt>
              <dd>
                <Contador valor={AREAS.length} />
              </dd>
            </div>
            <div>
              <dt>En desarrollo</dt>
              <dd>
                <Contador valor={APPS.length - totalDisponibles} />
              </dd>
            </div>
          </dl>
        </div>

        <div className={styles.heroFoot}>
          <span className={styles.pie}>{FOTOS[foto].pie}</span>
          <div className={styles.puntos} role="group" aria-label="Fotos de proyectos">
            {FOTOS.map((f, i) => (
              <button
                key={f.src}
                type="button"
                className={i === foto ? styles.puntoOn : undefined}
                aria-label={`Foto ${i + 1}`}
                aria-pressed={i === foto}
                onClick={() => setFoto(i)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [busqueda, setBusqueda] = useState('');
  const [area, setArea] = useState('Todas');
  const [recientes] = useState(() =>
    leerRecientes()
      .map((id) => APPS.find((a) => a.id === id && a.estado === 'disponible' && !a.bloqueada))
      .filter(Boolean),
  );
  const salud = useSalud();
  const inputRef = useRef(null);

  // "/" enfoca la búsqueda desde cualquier parte de la página.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return APPS.filter(
      (a) =>
        (area === 'Todas' || a.area === area) &&
        (!q || normalizar(`${a.nombre} ${a.area} ${a.descripcion}`).includes(q)),
    );
  }, [busqueda, area]);

  const disponibles = filtradas.filter((a) => a.estado === 'disponible');
  const proximamente = filtradas.filter((a) => a.estado !== 'disponible');

  // Enter en la búsqueda abre la primera app que se pueda abrir.
  function abrirPrimera() {
    const app = disponibles.find((a) => !a.bloqueada);
    if (!busqueda.trim() || !app) return;
    guardarReciente(app.id);
    window.location.href = app.href;
  }

  return (
    <>
      <Hero busqueda={busqueda} setBusqueda={setBusqueda} alEnter={abrirPrimera} inputRef={inputRef} />

      <main className={styles.main}>
        {recientes.length > 0 && (
          <nav className={styles.recientes} aria-label="Usadas recientemente">
            <span className={styles.recientesTitulo}>
              <History size={15} strokeWidth={2.2} aria-hidden="true" /> Recientes
            </span>
            {recientes.map((app) => {
              const Icono = app.icono;
              return (
                <a
                  key={app.id}
                  href={app.href}
                  className={styles.reciente}
                  style={{ '--acento': app.acento }}
                  onClick={() => guardarReciente(app.id)}
                >
                  <span className={styles.recienteIcono}>
                    <Icono size={15} strokeWidth={2} aria-hidden="true" />
                  </span>
                  {app.nombre}
                </a>
              );
            })}
          </nav>
        )}

        <div className={styles.filters} role="group" aria-label="Filtrar por área">
          {['Todas', ...AREAS].map((a) => (
            <button
              key={a}
              type="button"
              className={`${styles.chip} ${area === a ? styles.chipOn : ''}`}
              aria-pressed={area === a}
              onClick={() => setArea(a)}
            >
              {a}
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <p className={styles.empty}>No hay aplicaciones que coincidan con la búsqueda.</p>
        ) : (
          <>
            <Seccion titulo="Disponibles" apps={disponibles} salud={salud} />
            <Seccion titulo="En desarrollo" apps={proximamente} salud={salud} />
          </>
        )}
      </main>

      <section className={styles.proyectos} aria-labelledby="titulo-proyectos">
        <div className={styles.proyectosInner}>
          <div className={styles.proyectosText}>
            <span className={styles.eyebrow}>Proyectos AED</span>
            <h2 id="titulo-proyectos" className={styles.proyectosTitulo}>
              El software que acompaña cada proyecto.
            </h2>
          </div>
          <ul className={styles.logos}>
            {PROYECTOS.map((p) => (
              <li key={p.nombre}>
                <img src={p.logo} alt={p.nombre} loading="lazy" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} AED</span>
        <span>Plataforma AED</span>
      </footer>
    </>
  );
}
