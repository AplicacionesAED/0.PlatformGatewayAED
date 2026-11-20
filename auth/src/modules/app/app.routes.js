const express = require('express');
const validate = require('../../middlewares/validate');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const { idParam } = require('../usuario/usuario.schema');
const { actualizarAppSchema } = require('./app.schema');
const controller = require('./app.controller');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', controller.listar);
router.patch('/:id', validate(idParam, 'params'), validate(actualizarAppSchema), controller.actualizar);

module.exports = router;
