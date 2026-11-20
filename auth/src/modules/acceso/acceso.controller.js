const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/ApiResponse');
const service = require('./acceso.service');
const { ctx } = require('../usuario/usuario.controller');

const matriz = asyncHandler(async (req, res) => ok(res, await service.matriz()));
const conceder = asyncHandler(async (req, res) => created(res, await service.conceder(req.body, ctx(req))));
const revocar = asyncHandler(async (req, res) => {
  await service.revocar(req.params.id, ctx(req));
  return noContent(res);
});

module.exports = { matriz, conceder, revocar };
