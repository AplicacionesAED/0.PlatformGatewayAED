const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/ApiResponse');
const service = require('./usuario.service');

const ctx = (req) => ({ actorId: req.usuario.id, ip: req.ip });

const listar = asyncHandler(async (req, res) => ok(res, await service.listar()));
const crear = asyncHandler(async (req, res) => created(res, await service.crear(req.body, ctx(req))));
const actualizar = asyncHandler(async (req, res) => ok(res, await service.actualizar(req.params.id, req.body, ctx(req))));
const resetearPassword = asyncHandler(async (req, res) => ok(res, await service.resetearPassword(req.params.id, ctx(req))));

module.exports = { listar, crear, actualizar, resetearPassword, ctx };
