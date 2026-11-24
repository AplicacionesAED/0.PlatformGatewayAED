import { useEffect, useId, useRef, useState } from 'react';
import { AppWindow, Check, ChevronDown } from 'lucide-react';
import { MiniApp, colorApp } from './colores.jsx';
import s from './Admin.module.css';

// Selector de aplicacion con icono, nombre y cantidad (un <select> nativo no puede mostrar iconos). Patron listbox:
// boton que abre una lista; flechas, Enter y Escape; se cierra al hacer clic afuera.
//   opciones: [{ app, total }]   valor: id de la app como string ('' = todas)   total: personas en "Todas"
export default function SelectorApp({ opciones, valor, onCambiar, total }) {
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const raiz = useRef(null);
  const boton = useRef(null);
  const lista = useRef(null);
  const id = useId();

  const items = [{ app: null, total }, ...opciones];
  const indiceElegido = Math.max(0, items.findIndex((o) => (o.app ? String(o.app.id) : '') === valor));
  const elegido = items[indiceElegido];

  useEffect(() => {
    if (!abierto) return undefined;
    setActiva(indiceElegido);
    lista.current?.focus();
    const fuera = (e) => !raiz.current?.contains(e.target) && setAbierto(false);
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  function elegir(i) {
    onCambiar(items[i].app ? String(items[i].app.id) : '');
    setAbierto(false);
    boton.current?.focus();
  }

  function teclas(e) {
    if (e.key === 'ArrowDown') setActiva((i) => Math.min(items.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setActiva((i) => Math.max(0, i - 1));
    else if (e.key === 'Home') setActiva(0);
    else if (e.key === 'End') setActiva(items.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') elegir(activa);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setAbierto(false);
      if (e.key === 'Escape') boton.current?.focus();
      return;
    } else return;
    e.preventDefault();
  }

  const contenido = (o) => (
    <>
      {o.app ? (
        <MiniApp app={o.app} />
      ) : (
        <span className={s.selectorTodas} aria-hidden="true">
          <AppWindow size={13} strokeWidth={2.4} />
        </span>
      )}
      <span className={s.selectorNombre}>{o.app ? o.app.nombre : 'Todas las aplicaciones'}</span>
      <span className={s.chipTotal}>{o.total}</span>
    </>
  );

  return (
    <div className={s.selectorApp} ref={raiz}>
      <button
        ref={boton}
        type="button"
        className={s.selectorBoton}
        style={elegido.app ? { '--c': colorApp(elegido.app) } : undefined}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={`Filtrar por aplicación: ${elegido.app ? elegido.app.nombre : 'todas'}`}
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={(e) => (e.key === 'ArrowDown' || e.key === 'ArrowUp') && (e.preventDefault(), setAbierto(true))}
      >
        {contenido(elegido)}
        <ChevronDown size={16} aria-hidden="true" className={s.selectorFlecha} />
      </button>
      {abierto && (
        <ul
          ref={lista}
          id={id}
          role="listbox"
          tabIndex={-1}
          className={s.selectorLista}
          aria-label="Aplicaciones"
          aria-activedescendant={`${id}-${activa}`}
          onKeyDown={teclas}
        >
          {items.map((o, i) => (
            <li
              key={o.app?.id ?? 'todas'}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === indiceElegido}
              className={`${s.selectorOpcion} ${i === activa ? s.selectorOpcionActiva : ''}`}
              style={o.app ? { '--c': colorApp(o.app) } : undefined}
              onPointerEnter={() => setActiva(i)}
              onClick={() => elegir(i)}
            >
              {contenido(o)}
              {i === indiceElegido && <Check size={16} aria-hidden="true" className={s.selectorCheck} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
