'use strict';

// Quién administra cada acceso directo: NULL = lo dio un administrador en el portal; un slug de app (hoy 'hrsm') = lo creó
// esa app con su API de servicio y lo vuelve a crear al sincronizar. Así el panel no ofrece "limpiar" accesos que la app
// repondría, y avisa al quitarlos a mano.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('accesos', 'gestionado_por', { type: Sequelize.STRING(40), allowNull: true });
    // Los accesos directos a RR.HH. que ya existen los creó (o los repondría) su alta automática: cada cuenta activa de
    // RR.HH. se registra en el portal al sincronizar.
    await queryInterface.sequelize.query(
      "UPDATE accesos SET gestionado_por = 'hrsm' WHERE usuario_id IS NOT NULL AND app_id = (SELECT id FROM apps WHERE slug = 'hrsm')"
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('accesos', 'gestionado_por');
  },
};
