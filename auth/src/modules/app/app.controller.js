const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const service = require('./app.service');
const { ctx } = require('../usuario/usuario.controller');

const listar = asyncHandler(async (req, res) => ok(res, await service.listar()));
const actualizar = asyncHandler(async (req, res) => ok(res, await service.actualizar(req.params.id, req.body, ctx(req))));

module.exports = { listar, actualizar };
