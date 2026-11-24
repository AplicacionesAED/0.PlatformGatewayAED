'use strict';

// Sesiones de suplantacion: un administrador entra como otra persona. El token de renovacion guarda quien suplanta, para
// poder regresar a su cuenta y para que la sesion no se extienda mas alla de su limite.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('refresh_tokens', 'suplantado_por', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('refresh_tokens', 'suplantado_por');
  },
};
