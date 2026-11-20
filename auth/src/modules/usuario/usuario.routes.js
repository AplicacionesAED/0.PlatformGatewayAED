const express = require('express');
const validate = require('../../middlewares/validate');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const { idParam, crearUsuarioSchema, actualizarUsuarioSchema } = require('./usuario.schema');
const controller = require('./usuario.controller');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', controller.listar);
router.post('/', validate(crearUsuarioSchema), controller.crear);
router.patch('/:id', validate(idParam, 'params'), validate(actualizarUsuarioSchema), controller.actualizar);
router.post('/:id/reset-password', validate(idParam, 'params'), controller.resetearPassword);

module.exports = router;
