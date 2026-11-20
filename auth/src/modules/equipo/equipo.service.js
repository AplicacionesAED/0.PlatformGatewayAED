const ApiError = require('../../utils/ApiError');
const sequelize = require('../../config/db');
const { Equipo, EquipoMiembro, Usuario } = require('../../models');
const auditoria = require('../auditoria/auditoria.service');

const INCLUIR_MIEMBROS = [{ model: Usuario, as: 'miembros', attributes: ['id', 'email', 'nombre'], through: { attributes: [] } }];

const serializar = (e) => ({
  id: e.id,
  nombre: e.nombre,
  descripcion: e.descripcion,
  miembros: (e.miembros ?? []).map((m) => ({ id: m.id, email: m.email, nombre: m.nombre })),
});

async function obtener(id) {
  const equipo = await Equipo.findByPk(id, { include: INCLUIR_MIEMBROS });
  if (!equipo) throw new ApiError(404, 'El equipo no existe');
  return equipo;
}

async function listar() {
  return (await Equipo.findAll({ include: INCLUIR_MIEMBROS, order: [['nombre', 'ASC']] })).map(serializar);
}

async function crear({ nombre, descripcion }, ctx) {
  if (await Equipo.findOne({ where: { nombre } })) throw new ApiError(409, 'Ya existe un equipo con ese nombre');
  const equipo = await Equipo.create({ nombre, descripcion: descripcion ?? null });
  await auditoria.registrar({ ...ctx, accion: 'equipo.crear', entidad: 'equipo', entidadId: equipo.id, detalle: { nombre } });
  return serializar(await obtener(equipo.id));
}

async function actualizar(id, { nombre, descripcion }, ctx) {
  const equipo = await obtener(id);
  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (descripcion !== undefined) cambios.descripcion = descripcion;
  await equipo.update(cambios);
  await auditoria.registrar({ ...ctx, accion: 'equipo.actualizar', entidad: 'equipo', entidadId: id, detalle: cambios });
  return serializar(await obtener(id));
}

// Sus accesos y membresias se van en cascada: las personas pierden lo que ese equipo les daba.
async function eliminar(id, ctx) {
  const equipo = await obtener(id);
  await equipo.destroy();
  await auditoria.registrar({ ...ctx, accion: 'equipo.eliminar', entidad: 'equipo', entidadId: id, detalle: { nombre: equipo.nombre } });
}

// Reemplaza la lista completa de miembros (lo que llega es el resultado final, no una diferencia).
async function fijarMiembros(id, usuarioIds, ctx) {
  await obtener(id);
  const ids = [...new Set(usuarioIds)];
  if (ids.length && (await Usuario.count({ where: { id: ids } })) !== ids.length) throw new ApiError(404, 'Alguna de las personas no existe');

  await sequelize.transaction(async (transaction) => {
    await EquipoMiembro.destroy({ where: { equipo_id: id }, transaction });
    await EquipoMiembro.bulkCreate(ids.map((usuario_id) => ({ equipo_id: id, usuario_id })), { transaction });
  });
  await auditoria.registrar({ ...ctx, accion: 'equipo.miembros', entidad: 'equipo', entidadId: id, detalle: { usuarioIds: ids } });
  return serializar(await obtener(id));
}

module.exports = { listar, crear, actualizar, eliminar, fijarMiembros };
