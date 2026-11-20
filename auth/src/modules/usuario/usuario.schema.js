const { z } = require('zod');

const idParam = z.object({ id: z.coerce.number().int().positive() });

const crearUsuarioSchema = z.object({
  email: z.string().trim().email().max(255),
  nombre: z.string().trim().min(1).max(200),
  esAdmin: z.boolean().optional(),
});

const actualizarUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(1).max(200).optional(),
    activo: z.boolean().optional(),
    esAdmin: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que actualizar' });

module.exports = { idParam, crearUsuarioSchema, actualizarUsuarioSchema };
