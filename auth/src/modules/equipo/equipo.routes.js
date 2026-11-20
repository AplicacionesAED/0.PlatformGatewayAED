const express = require('express');
const validate = require('../../middlewares/validate');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const { idParam } = require('../usuario/usuario.schema');
const { crearEquipoSchema, actualizarEquipoSchema, miembrosSchema } = require('./equipo.schema');
const controller = require('./equipo.controller');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', controller.listar);
router.post('/', validate(crearEquipoSchema), controller.crear);
router.patch('/:id', validate(idParam, 'params'), validate(actualizarEquipoSchema), controller.actualizar);
router.delete('/:id', validate(idParam, 'params'), controller.eliminar);
router.put('/:id/miembros', validate(idParam, 'params'), validate(miembrosSchema), controller.fijarMiembros);

module.exports = router;
