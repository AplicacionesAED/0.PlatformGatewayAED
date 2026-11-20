const express = require('express');
const validate = require('../../middlewares/validate');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const { idParam } = require('../usuario/usuario.schema');
const { concederSchema } = require('./acceso.schema');
const controller = require('./acceso.controller');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/matriz', controller.matriz);
router.post('/', validate(concederSchema), controller.conceder);
router.delete('/:id', validate(idParam, 'params'), controller.revocar);

module.exports = router;
