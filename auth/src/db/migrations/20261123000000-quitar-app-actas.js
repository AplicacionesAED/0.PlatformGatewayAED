'use strict';

// El Bot de Actas todavia no esta en el portal (sin tarjeta ni ruta en el gateway): se quita del catalogo para que no figure en la
// administracion de accesos. Borra tambien los accesos que tuviera (ON DELETE CASCADE). Cuando entre al portal se vuelve a agregar con
// una migracion nueva.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM apps WHERE slug = 'actas'");
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "INSERT INTO apps (slug, nombre) VALUES ('actas', 'Bot de Actas Teams + IA') ON CONFLICT (slug) DO NOTHING"
    );
  },
};
