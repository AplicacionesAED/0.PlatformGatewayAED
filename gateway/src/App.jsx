import { useMemo, useState } from 'react';
import { ArrowRight, Clock, Lock, Search } from 'lucide-react';
import { APPS } from './apps.js';
import styles from './App.module.css';

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function AppCard({ app, indice }) {
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
        {disponible ? (
          <span className={`${styles.badge} ${styles.badgeLive}`}>
            <span className={styles.dot} /> Disponible
          </span>
        ) : (
          <span className={`${styles.badge} ${styles.badgeSoon}`}>
            <Clock size={12} strokeWidth={2.2} /> En desarrollo
          </span>
        )}
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
      <a className={`${styles.card} ${styles.cardLive}`} href={app.href} style={estilo}>
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

function Seccion({ titulo, apps }) {
  if (apps.length === 0) return null;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{titulo}</h2>
        <span className={styles.count}>{apps.length}</span>
      </div>
      <div className={styles.grid}>
        {apps.map((app, i) => (
          <AppCard key={app.id} app={app} indice={i} />
        ))}
      </div>
    </section>
  );
}

const AREAS = [...new Set(APPS.map((a) => a.area))];

export default function App() {
  const [busqueda, setBusqueda] = useState('');
  const [area, setArea] = useState('Todas');

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
  const totalDisponibles = APPS.filter((a) => a.estado === 'disponible').length;
  const totalDesarrollo = APPS.length - totalDisponibles;

  return (
    <>
      <div className={styles.top}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <img className={styles.logo} src={`${import.meta.env.BASE_URL}aed-logo.png`} alt="AED" />
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.product}>Plataforma</span>
          </div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroText}>
              <span className={styles.eyebrow}>Ecosistema de software AED</span>
              <h1 className={styles.title}>Las herramientas de AED, en un solo lugar.</h1>
              <p className={styles.lead}>
                Cada módulo del negocio, de la contratación a la obra, con un único punto de entrada. Elija una
                aplicación para comenzar.
              </p>
              <label className={styles.search}>
                <Search size={19} strokeWidth={2} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Buscar aplicación…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  aria-label="Buscar aplicación"
                />
              </label>
            </div>

            <dl className={styles.stats}>
              <div>
                <dt>Aplicaciones activas</dt>
                <dd>{totalDisponibles}</dd>
              </div>
              <div>
                <dt>Áreas de negocio</dt>
                <dd>{AREAS.length}</dd>
              </div>
              <div>
                <dt>En desarrollo</dt>
                <dd>{totalDesarrollo}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <main className={styles.main}>
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
            <Seccion titulo="Disponibles" apps={disponibles} />
            <Seccion titulo="En desarrollo" apps={proximamente} />
          </>
        )}
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} AED</span>
        <span>Plataforma AED</span>
      </footer>
    </>
  );
}
