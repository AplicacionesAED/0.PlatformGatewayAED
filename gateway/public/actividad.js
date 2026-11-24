// Latido de actividad del portal AED. Lo carga el portal y cada app detras del gateway con:
//   <script src="/actividad.js" defer></script>
// Mientras la pestaña esta visible y la persona la usa (mouse, teclado, toques o scroll en los ultimos INACTIVA_MS), avisa
// al portal cada CADA_MS. Asi el panel de administracion sabe quien esta en linea con unos minutos de precision.
// No toca la sesion: el portal identifica a la persona con su cookie de renovacion sin rotarla, y un error se ignora.
(function () {
  if (window.__latidoPortal) return; // por si una app lo incluye dos veces
  window.__latidoPortal = true;

  var CADA_MS = 2 * 60 * 1000;
  var INACTIVA_MS = 10 * 60 * 1000;
  var ultimaInteraccion = Date.now();
  var ultimoEnvio = 0;

  function enviar() {
    var ahora = Date.now();
    if (document.visibilityState !== 'visible') return;
    if (ahora - ultimaInteraccion > INACTIVA_MS) return;
    if (ahora - ultimoEnvio < CADA_MS) return;
    ultimoEnvio = ahora;
    fetch('/portal/api/auth/actividad', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(function () {});
  }

  // Al volver a usar la pagina tras un rato quieta, el aviso sale de inmediato (si ya paso CADA_MS desde el anterior).
  function interaccion() {
    ultimaInteraccion = Date.now();
    enviar();
  }

  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (evento) {
    window.addEventListener(evento, interaccion, { passive: true, capture: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') interaccion();
  });
  setInterval(enviar, 30 * 1000);
  enviar();
})();
