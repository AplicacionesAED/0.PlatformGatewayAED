const { z } = require('zod');

// Un acceso es de una persona O de un equipo (exactamente uno de los dos).
const concederSchema = z
  .object({
    appId: z.number().int().positive(),
    usuarioId: z.number().int().positive().optional(),
    equipoId: z.number().int().positive().optional(),
  })
  .refine((v) => (v.usuarioId === undefined) !== (v.equipoId === undefined), { message: 'Indica una persona o un equipo, no ambos ni ninguno' });

module.exports = { concederSchema };
