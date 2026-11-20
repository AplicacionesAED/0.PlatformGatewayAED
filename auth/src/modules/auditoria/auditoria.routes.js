const express = require('express');
const { z } = require('zod');
const validate = require('../../middlewares/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const service = require('./auditoria.service');

const consultaSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  accion: z.string().trim().max(60).optional(),
  actorId: z.coerce.number().int().positive().optional(),
});

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get(
  '/',
  validate(consultaSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { rows, total } = await service.listar(req.query);
    return ok(res, rows, { total, limit: req.query.limit, offset: req.query.offset });
  })
);

module.exports = router;
