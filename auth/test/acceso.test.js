const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { migrar, limpiar } = require('./helpers');
const sequelize = require('../src/config/db');
const { Usuario, Equipo, EquipoMiembro, App, Acceso } = require('../src/models');
const acceso = require('../src/modules/acceso/acceso.service');

const slugs = async (usuarioId) => (await acceso.appsEfectivas(usuarioId)).map((a) => a.slug).sort();
const appId = async (slug) => (await App.findOne({ where: { slug } })).id;
const persona = (email, extra = {}) => Usuario.create({ email, nombre: email, ...extra });

describe('acceso efectivo', () => {
  before(() => migrar());
  beforeEach(() => limpiar());
  after(() => sequelize.close());

  it('sin accesos no ve ninguna app', async () => {
    const u = await persona('a@x.test');
    assert.deepEqual(await slugs(u.id), []);
  });

  it('ve las apps que se le dieron directamente', async () => {
    const u = await persona('a@x.test');
    await acceso.conceder({ appId: await appId('cartera'), usuarioId: u.id }, {});
    assert.deepEqual(await slugs(u.id), ['cartera']);
  });

  it('ve las apps de su equipo', async () => {
    const u = await persona('a@x.test');
    const eq = await Equipo.create({ nombre: 'Contabilidad' });
    await EquipoMiembro.create({ equipo_id: eq.id, usuario_id: u.id });
    await acceso.conceder({ appId: await appId('bases'), equipoId: eq.id }, {});
    assert.deepEqual(await slugs(u.id), ['bases']);
  });

  it('une directas y de equipo sin repetir una app que tiene por los dos lados', async () => {
    const u = await persona('a@x.test');
    const eq = await Equipo.create({ nombre: 'Obra' });
    await EquipoMiembro.create({ equipo_id: eq.id, usuario_id: u.id });
    await acceso.conceder({ appId: await appId('siger'), usuarioId: u.id }, {});
    await acceso.conceder({ appId: await appId('siger'), equipoId: eq.id }, {});
    await acceso.conceder({ appId: await appId('cartera'), equipoId: eq.id }, {});
    assert.deepEqual(await slugs(u.id), ['cartera', 'siger']);
  });

  it('al sacarlo del equipo pierde lo del equipo y conserva lo directo', async () => {
    const u = await persona('a@x.test');
    const eq = await Equipo.create({ nombre: 'Obra' });
    await EquipoMiembro.create({ equipo_id: eq.id, usuario_id: u.id });
    await acceso.conceder({ appId: await appId('siger'), usuarioId: u.id }, {});
    await acceso.conceder({ appId: await appId('cartera'), equipoId: eq.id }, {});
    await EquipoMiembro.destroy({ where: { equipo_id: eq.id, usuario_id: u.id } });
    assert.deepEqual(await slugs(u.id), ['siger']);
  });

  it('una persona inactiva no ve nada', async () => {
    const u = await persona('a@x.test', { activo: false });
    await acceso.conceder({ appId: await appId('cartera'), usuarioId: u.id }, {});
    assert.deepEqual(await slugs(u.id), []);
  });

  it('una app inactiva no aparece', async () => {
    const u = await persona('a@x.test');
    await acceso.conceder({ appId: await appId('cartera'), usuarioId: u.id }, {});
    await acceso.conceder({ appId: await appId('siger'), usuarioId: u.id }, {});
    await App.update({ activa: false }, { where: { slug: 'cartera' } });
    assert.deepEqual(await slugs(u.id), ['siger']);
  });

  it('conceder dos veces lo mismo deja un solo acceso', async () => {
    const u = await persona('a@x.test');
    const id = await appId('cartera');
    await acceso.conceder({ appId: id, usuarioId: u.id }, {});
    await acceso.conceder({ appId: id, usuarioId: u.id }, {});
    assert.equal(await Acceso.count({ where: { usuario_id: u.id } }), 1);
  });

  it('revocar quita el acceso', async () => {
    const u = await persona('a@x.test');
    const a = await acceso.conceder({ appId: await appId('cartera'), usuarioId: u.id }, {});
    await acceso.revocar(a.id, {});
    assert.deepEqual(await slugs(u.id), []);
  });

  it('la base rechaza un acceso sin destinatario o con dos', async () => {
    const u = await persona('a@x.test');
    const eq = await Equipo.create({ nombre: 'X' });
    const id = await appId('cartera');
    await assert.rejects(Acceso.create({ app_id: id }));
    await assert.rejects(Acceso.create({ app_id: id, usuario_id: u.id, equipo_id: eq.id }));
  });
});
