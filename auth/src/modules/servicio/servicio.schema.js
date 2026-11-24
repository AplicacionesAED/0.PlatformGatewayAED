const { z } = require('zod');

const correo = z.string().trim().email().max(255);

const personaSchema = z.object({ email: correo, nombre: z.string().trim().min(1).max(200) });
const correoSchema = z.object({ email: correo });
const cambiarCorreoSchema = z.object({ anterior: correo, nuevo: correo, nombre: z.string().trim().min(1).max(200) });

module.exports = { personaSchema, correoSchema, cambiarCorreoSchema };
