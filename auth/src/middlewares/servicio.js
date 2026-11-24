// Llamadas de servidor a servidor de una app (hoy RR.HH.) para dar de alta a su propia gente en el portal. Cada app tiene su
// llave en PORTAL_SERVICE_KEY_<SLUG> (p. ej. PORTAL_SERVICE_KEY_HRSM) y la manda en la cabecera X-Portal-Service-Key. Sin la
// variable, esa app no tiene API de servicio. Una llave solo vale para su propia app (`:app` de la ruta).
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { App } = require('../models');

const huella = (valor) => crypto.createHash('sha256').update(String(valor)).digest();

async function requireServicio(req, res, next) {
  try {
    const slug = String(req.params.app ?? '').toLowerCase();
    const esperada = /^[a-z0-9_-]{1,40}$/.test(slug) ? process.env[`PORTAL_SERVICE_KEY_${slug.toUpperCase().replace(/-/g, '_')}`] : null;
    const recibida = req.get('x-portal-service-key');
    // Comparacion en tiempo constante sobre las huellas (mismo largo siempre).
    if (!esperada || !recibida || !crypto.timingSafeEqual(huella(esperada), huella(recibida))) {
      return next(new ApiError(401, 'Llave de servicio inválida'));
    }
    const app = await App.findOne({ where: { slug } });
    if (!app) return next(new ApiError(404, 'La aplicación no existe'));
    req.servicio = { app };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireServicio };
