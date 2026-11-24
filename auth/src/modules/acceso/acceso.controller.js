const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/ApiResponse');
const service = require('./acceso.service');
const { ctx } = require('../usuario/usuario.controller');

const matriz = asyncHandler(async (req, res) => ok(res, await service.matriz()));
// Solo estos campos: `gestionadoPor` lo pone unicamente la API de servicio de una app, nunca el panel.
const conceder = asyncHandler(async (req, res) => {
  const { appId, usuarioId, equipoId } = req.body;
  return created(res, await service.conceder({ appId, usuarioId, equipoId }, ctx(req)));
});
const revocar = asyncHandler(async (req, res) => {
  await service.revocar(req.params.id, ctx(req));
  return noContent(res);
});

module.exports = { matriz, conceder, revocar };
