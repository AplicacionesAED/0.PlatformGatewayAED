'use strict';

// El nombre visible de SIGER pasa a "Siger" (panel de administracion, login, auditoria). El slug no cambia. Solo toca la
// fila si sigue con el nombre sembrado, por si alguien ya la renombro a mano.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("UPDATE apps SET nombre = 'Siger' WHERE slug = 'siger' AND nombre = 'SIGER'");
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("UPDATE apps SET nombre = 'SIGER' WHERE slug = 'siger' AND nombre = 'Siger'");
  },
};
