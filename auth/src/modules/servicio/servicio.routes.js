const express = require('express');
const validate = require('../../middlewares/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const { requireServicio } = require('../../middlewares/servicio');
const { personaSchema, correoSchema, cambiarCorreoSchema } = require('./servicio.schema');
const service = require('./servicio.service');

// /api/servicio/:app/... -- solo con la llave de servicio de esa app (ver middlewares/servicio.js). La cabecera opcional
// X-Portal-Solicitado-Por (correo de quien lo pidio dentro de la app) se guarda en la auditoria.
const router = express.Router({ mergeParams: true });
router.use(requireServicio);

const ctx = (req) => ({ ip: req.ip, solicitadoPor: (req.get('x-portal-solicitado-por') ?? '').slice(0, 255) || null });
const accion = (fn) => asyncHandler(async (req, res) => ok(res, await fn(req.servicio.app, req.body, ctx(req))));

router.post('/personas', validate(personaSchema), accion(service.registrar));
router.post('/personas/quitar-acceso', validate(correoSchema), accion(service.quitarAcceso));
router.post('/personas/cambiar-correo', validate(cambiarCorreoSchema), accion(service.cambiarCorreo));
router.post('/personas/password-temporal', validate(correoSchema), accion(service.passwordTemporal));

module.exports = router;
