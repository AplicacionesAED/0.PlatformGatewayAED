const express = require('express');
const { z } = require('zod');
const validate = require('../../middlewares/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const service = require('./auditoria.service');

const consultaSchema = z.object({
  // Hasta 1000 por pagina: el panel exporta a Excel pidiendo paginas grandes.
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  accion: z.string().trim().max(60).optional(),
  actorId: z.coerce.number().int().positive().optional(),
  // Todo lo que toca a una persona: lo que hizo y lo que se hizo sobre ella (su cuenta, sus accesos, sus equipos).
  usuarioId: z.coerce.number().int().positive().optional(),
  // Dias completos en hora de Colombia (AAAA-MM-DD), ambos incluidos.
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const alertasSchema = z.object({ dias: z.coerce.number().int().min(1).max(90).default(7) });

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get(
  '/alertas',
  validate(alertasSchema, 'query'),
  asyncHandler(async (req, res) => ok(res, await service.alertas(req.query)))
);

router.get(
  '/',
  validate(consultaSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { rows, total } = await service.listar(req.query);
    return ok(res, rows, { total, limit: req.query.limit, offset: req.query.offset });
  })
);

module.exports = router;
