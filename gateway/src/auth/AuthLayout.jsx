import { FOTOS } from '../fotos.js';
import s from './Auth.module.css';

// Marco comun del login y del cambio de contraseña: panel de marca con foto y tarjeta del formulario.
export default function AuthLayout({ titulo, subtitulo, children }) {
  return (
    <main className={s.pagina}>
      <aside className={s.marca} aria-hidden="true">
        <img className={s.fondo} src={FOTOS[0].src} alt="" />
        <div className={s.marcaContenido}>
          <img className={s.logo} src={`${import.meta.env.BASE_URL}aed-logo.png`} alt="" />
          <div>
            <span className={s.eyebrow}>Plataforma AED</span>
            <p className={s.frase}>
              Las herramientas de AED, <span className={s.acento}>en un solo lugar.</span>
            </p>
          </div>
          <span className={s.pie}>{FOTOS[0].pie}</span>
        </div>
      </aside>

      <section className={s.panel}>
        <div className={s.tarjeta}>
          <img className={s.logoMovil} src={`${import.meta.env.BASE_URL}aed-logo.png`} alt="AED" />
          <header className={s.cabecera}>
            <h1>{titulo}</h1>
            {subtitulo && <p>{subtitulo}</p>}
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
