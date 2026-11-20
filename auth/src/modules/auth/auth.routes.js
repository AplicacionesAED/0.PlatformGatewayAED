const express = require('express');
const validate = require('../../middlewares/validate');
const { requireAuth } = require('../../middlewares/auth');
const { loginSchema, cambiarPasswordSchema } = require('./auth.schema');
const controller = require('./auth.controller');
const azure = require('./auth.azure');

const router = express.Router();

router.post('/login', validate(loginSchema), controller.login);
router.get('/azure/login', azure.iniciarLogin);
router.get('/azure/callback', azure.callback);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/cambiar-password', requireAuth, validate(cambiarPasswordSchema), controller.cambiarPassword);

module.exports = router;
