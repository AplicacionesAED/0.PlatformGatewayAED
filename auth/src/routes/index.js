// UNICO lugar que mapea rutas URL a routers de modulo. El gateway publica todo esto bajo /portal/api (y entrega el servicio sin /portal).
const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const authController = require('../modules/auth/auth.controller');

const router = express.Router();

router.use('/auth', require('../modules/auth/auth.routes'));
// Quien soy y a que apps puedo entrar: lo consulta la landing (tambien con un cambio de contraseña pendiente).
router.get('/me', requireAuth, authController.me);
// Llave publica con la que las apps verifican las sesiones.
router.get('/.well-known/jwks.json', authController.jwks);
router.use('/usuarios', require('../modules/usuario/usuario.routes'));
router.use('/equipos', require('../modules/equipo/equipo.routes'));
router.use('/apps', require('../modules/app/app.routes'));
router.use('/accesos', require('../modules/acceso/acceso.routes'));
router.use('/auditoria', require('../modules/auditoria/auditoria.routes'));
// De servidor a servidor: una app da de alta a su gente (llave PORTAL_SERVICE_KEY_<APP>).
router.use('/servicio/:app', require('../modules/servicio/servicio.routes'));

module.exports = router;
