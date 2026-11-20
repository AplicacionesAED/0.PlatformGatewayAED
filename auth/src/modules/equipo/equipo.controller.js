const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/ApiResponse');
const service = require('./equipo.service');
const { ctx } = require('../usuario/usuario.controller');

const listar = asyncHandler(async (req, res) => ok(res, await service.listar()));
const crear = asyncHandler(async (req, res) => created(res, await service.crear(req.body, ctx(req))));
const actualizar = asyncHandler(async (req, res) => ok(res, await service.actualizar(req.params.id, req.body, ctx(req))));
const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.id, ctx(req));
  return noContent(res);
});
const fijarMiembros = asyncHandler(async (req, res) => ok(res, await service.fijarMiembros(req.params.id, req.body.usuarioIds, ctx(req))));

module.exports = { listar, crear, actualizar, eliminar, fijarMiembros };
