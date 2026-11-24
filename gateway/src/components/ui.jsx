// Piezas de interfaz compartidas por el login y la administracion: mismos tokens y proporciones que las apps de AED
// (campos de 44 px, botones con foco visible, dialogos nativos <dialog>).
import { useEffect, useId, useRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import s from './ui.module.css';

export function Button({ variante = 'primario', cargando = false, icono: Icono, children, className = '', ...props }) {
  return (
    <button type="button" className={`${s.btn} ${s[variante]} ${className}`} {...props} disabled={cargando || props.disabled}>
      {cargando ? <Loader2 size={16} className={s.girar} aria-hidden="true" /> : Icono && <Icono size={16} strokeWidth={2.1} aria-hidden="true" />}
      {children}
    </button>
  );
}

// Boton solo de icono: siempre con nombre accesible (aria-label) y area de 44 px.
export function BotonIcono({ icono: Icono, etiqueta, peligro = false, ...props }) {
  return (
    <button type="button" className={`${s.iconBtn} ${peligro ? s.iconPeligro : ''}`} aria-label={etiqueta} title={etiqueta} {...props}>
      <Icono size={17} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

export function Insignia({ tono = 'neutro', icono: Icono, children }) {
  return (
    <span className={`${s.badge} ${s[`tono_${tono}`]}`}>
      {Icono && <Icono size={12} strokeWidth={2.4} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Campo({ etiqueta, ayuda, error, children }) {
  const id = useId();
  return (
    <div className={s.campo}>
      <label htmlFor={id} className={s.etiqueta}>
        {etiqueta}
      </label>
      {children(id, { 'aria-invalid': error ? true : undefined, 'aria-describedby': error || ayuda ? `${id}-nota` : undefined })}
      {(error || ayuda) && (
        <p id={`${id}-nota`} className={error ? s.error : s.ayuda}>
          {error || ayuda}
        </p>
      )}
    </div>
  );
}

export function Aviso({ tipo = 'error', children }) {
  const Icono = tipo === 'ok' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`${s.aviso} ${s[`aviso_${tipo}`]}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono size={18} strokeWidth={2.1} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className={s.cargando} role="status">
      <Loader2 size={20} className={s.girar} aria-hidden="true" /> {texto}
    </div>
  );
}

// Dialogo modal sobre <dialog>: el navegador maneja el foco, Escape y la capa de fondo. `lateral` lo pega al borde derecho a
// toda la altura (fichas de persona, equipo y aplicacion).
// `icono` y `descripcion` (opcionales) arman un encabezado con contexto: que hace el dialogo y por que. `tono="peligro"`
// pinta el icono en rojo (eliminar, desactivar).
export function Modal({ abierto, onCerrar, titulo, children, pie, ancho = 480, lateral = false, icono: Icono, descripcion, tono }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (abierto && !d.open) {
      d.showModal();
      // showModal pone el foco en lo primero enfocable (el boton de cerrar); un campo marcado con data-autofocus lo recibe.
      d.querySelector('[data-autofocus]')?.focus();
    }
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      className={`${s.modal} ${lateral ? s.lateral : ''}`}
      style={{ '--ancho': `${ancho}px` }}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onClick={(e) => e.target === ref.current && onCerrar()}
      aria-label={titulo}
    >
      {abierto && (
        <div className={s.modalCuerpo}>
          <header className={`${s.modalCabecera} ${Icono || descripcion ? s.modalCabeceraRica : ''}`}>
            {Icono && (
              <span className={`${s.modalIcono} ${tono === 'peligro' ? s.modalIconoPeligro : ''}`} aria-hidden="true">
                <Icono size={22} strokeWidth={2} />
              </span>
            )}
            <div className={s.modalTitulos}>
              <h2>{titulo}</h2>
              {descripcion && <p>{descripcion}</p>}
            </div>
            <BotonIcono icono={X} etiqueta="Cerrar" onClick={onCerrar} />
          </header>
          <div className={s.modalContenido}>{children}</div>
          {pie && <footer className={s.modalPie}>{pie}</footer>}
        </div>
      )}
    </dialog>
  );
}
