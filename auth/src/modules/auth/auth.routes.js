const express = require('express');
const validate = require('../../middlewares/validate');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const { loginSchema, cambiarPasswordSchema, suplantarSchema } = require('./auth.schema');
const controller = require('./auth.controller');
const azure = require('./auth.azure');

const router = express.Router();

router.post('/login', validate(loginSchema), controller.login);
router.get('/azure/login', azure.iniciarLogin);
router.get('/azure/callback', azure.callback);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/cambiar-password', requireAuth, validate(cambiarPasswordSchema), controller.cambiarPassword);
// Suplantacion: bajo /auth para que llegue la cookie de renovacion (su ruta es /api/auth). Entrar exige ser administrador
// (y no estar ya suplantando); regresar usa solo la cookie de renovacion de la sesion suplantada.
router.post('/suplantar', requireAuth, requireAdmin, validate(suplantarSchema), controller.suplantar);
router.post('/suplantar/fin', controller.terminarSuplantacion);
// Latido de actividad (script /actividad.js del gateway): bajo /auth para que llegue la cookie de renovacion.
router.post('/actividad', controller.actividad);

module.exports = router;
