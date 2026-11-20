'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('equipos', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      nombre: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      descripcion: { type: Sequelize.STRING(500), allowNull: true },
      creado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      actualizado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable('equipo_miembros', {
      equipo_id: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, references: { model: 'equipos', key: 'id' }, onDelete: 'CASCADE' },
      usuario_id: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE' },
      creado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    // `slug` es el identificador que viaja en la sesion y que cada app reconoce como suyo.
    await queryInterface.createTable('apps', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      slug: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      nombre: { type: Sequelize.STRING(150), allowNull: false },
      activa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    });

    await queryInterface.createTable('accesos', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      app_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'apps', key: 'id' }, onDelete: 'CASCADE' },
      usuario_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE' },
      equipo_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'equipos', key: 'id' }, onDelete: 'CASCADE' },
      creado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    // Un acceso es de una persona O de un equipo, nunca de ambos ni de ninguno; y no se repite.
    await queryInterface.sequelize.query(
      'ALTER TABLE accesos ADD CONSTRAINT accesos_un_destinatario CHECK ((usuario_id IS NULL) <> (equipo_id IS NULL))'
    );
    await queryInterface.sequelize.query('CREATE UNIQUE INDEX accesos_app_usuario ON accesos (app_id, usuario_id) WHERE usuario_id IS NOT NULL');
    await queryInterface.sequelize.query('CREATE UNIQUE INDEX accesos_app_equipo ON accesos (app_id, equipo_id) WHERE equipo_id IS NOT NULL');
  },
};
