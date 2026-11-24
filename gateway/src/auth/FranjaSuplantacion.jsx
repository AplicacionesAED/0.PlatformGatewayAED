import { useState } from 'react';
import { Undo2, UserRoundCog } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import { Button } from '../components/ui.jsx';
import s from './FranjaSuplantacion.module.css';

// Mientras un administrador entra como otra persona, esta franja queda arriba en todo el portal: recuerda como quien se
// esta viendo y permite regresar a la cuenta propia. La sesion suplantada se cierra sola a la hora.
export default function FranjaSuplantacion() {
  const auth = useAuth();
  const [regresando, setRegresando] = useState(false);
  const [error, setError] = useState(null);
  const u = auth?.usuario;
  if (!u?.suplantadoPor) return null;

  async function regresar() {
    setRegresando(true);
    setError(null);
    try {
      await auth.regresar();
    } catch (err) {
      setError(err.message);
      setRegresando(false);
    }
  }

  return (
    <div className={s.franja} role="region" aria-label="Sesión como otra persona">
      <div className={s.interna}>
        <UserRoundCog size={20} aria-hidden="true" className={s.icono} />
        <p className={s.texto}>
          Estás viendo el portal como <strong>{u.nombre}</strong>. Lo que hagas en las aplicaciones quedará a su nombre.
          <span className={s.nota}> Sesión de {u.suplantadoPor.nombre} · termina sola en máximo una hora.</span>
          {error && <span className={s.error}> {error}</span>}
        </p>
        <Button icono={Undo2} cargando={regresando} onClick={regresar} className={s.boton}>
          Regresar a mi cuenta
        </Button>
      </div>
    </div>
  );
}
