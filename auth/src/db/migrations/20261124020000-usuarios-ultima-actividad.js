'use strict';

// Ultima vez que la persona uso el portal o alguna app: inicio de sesion, renovacion de la sesion (cualquier app la renueva
// mientras se trabaja, como maximo cada hora) o entrada al portal. Mas fiel que ultimo_login, que puede ser de hace semanas
// aunque la persona trabaje a diario. Arranca igual a ultimo_login.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('usuarios', 'ultima_actividad', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.sequelize.query('UPDATE usuarios SET ultima_actividad = ultimo_login WHERE ultimo_login IS NOT NULL');
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('usuarios', 'ultima_actividad');
  },
};
