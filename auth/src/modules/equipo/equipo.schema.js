const { z } = require('zod');

const crearEquipoSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().trim().max(500).nullish(),
});

const actualizarEquipoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    descripcion: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que actualizar' });

const miembrosSchema = z.object({ usuarioIds: z.array(z.number().int().positive()).max(1000) });

module.exports = { crearEquipoSchema, actualizarEquipoSchema, miembrosSchema };
