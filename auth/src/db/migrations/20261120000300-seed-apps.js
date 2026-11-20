'use strict';

// Catalogo inicial: el slug es la ruta de la app detras del gateway. Idempotente (solo inserta los que faltan).
const APPS = [
  ['solicitudes', 'Solicitudes de Contratación'],
  ['cartera', 'Cartera'],
  ['hrsm', 'Recursos Humanos'],
  ['bases', 'Bases Presupuestales'],
  ['comercial', 'Centro de Aplicaciones Comerciales'],
  ['siger', 'SISGER'],
  ['actas', 'Bot de Actas Teams + IA'],
];

module.exports = {
  async up(queryInterface) {
    for (const [slug, nombre] of APPS) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query('INSERT INTO apps (slug, nombre) VALUES (:slug, :nombre) ON CONFLICT (slug) DO NOTHING', {
        replacements: { slug, nombre },
      });
    }
  },
};
