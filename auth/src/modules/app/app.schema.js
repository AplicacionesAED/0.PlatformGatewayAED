const { z } = require('zod');

const actualizarAppSchema = z
  .object({
    nombre: z.string().trim().min(1).max(150).optional(),
    activa: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que actualizar' });

module.exports = { actualizarAppSchema };
