const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(200),
});

const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1).max(200),
  passwordNueva: z.string().min(1).max(200),
});

module.exports = { loginSchema, cambiarPasswordSchema };
