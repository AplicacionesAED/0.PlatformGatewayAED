const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { migrar, limpiar } = require('./helpers');

process.env.PORTAL_CORPORATE_DOMAINS = 'aed.com.co';
process.env.PORTAL_SERVICE_KEY_HRSM = 'llave-de-prueba-hrsm';

const sequelize = require('../src/config/db');
const app = require('../src/app');
const security = require('../src/utils/security');
const { Usuario, App, Acceso, Equipo, EquipoMiembro, Auditoria } = require('../src/models');
const accesoService = require('../src/modules/acceso/acceso.service');

let server;
let base;

async function llamar(ruta, cuerpo, llave = 'llave-de-prueba-hrsm', appSlug = 'hrsm') {
  const res = await fetch(`${base}/api/servicio/${appSlug}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(llave ? { 'x-portal-service-key': llave } : {}), 'x-portal-solicitado-por': 'rrhh@empresa.test' },
    body: JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  return { status: res.status, body: texto ? JSON.parse(texto) : null };
}
const appId = async (slug) => (await App.findOne({ where: { slug } })).id;
const slugsDe = async (email) => (await accesoService.appsEfectivas((await Usuario.findOne({ where: { email } })).id)).map((a) => a.slug);

describe('API de servicio (RR.HH. da de alta a su gente)', () => {
  before(async () => {
    migrar();
    await new Promise((ok) => {
      server = app.listen(0, '127.0.0.1', ok);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(() => limpiar());
  after(async () => {
    await new Promise((ok) => server.close(ok));
    await sequelize.close();
  });

  it('exige la llave de su propia app', async () => {
    assert.equal((await llamar('/personas', { email: 'a@gmail.test', nombre: 'A' }, null)).status, 401);
    assert.equal((await llamar('/personas', { email: 'a@gmail.test', nombre: 'A' }, 'otra')).status, 401);
    // La llave de RR.HH. no sirve para otra app (Cartera no tiene llave configurada).
    assert.equal((await llamar('/personas', { email: 'a@gmail.test', nombre: 'A' }, 'llave-de-prueba-hrsm', 'cartera')).status, 401);
    assert.equal((await llamar('/personas', { email: 'no-es-correo', nombre: 'A' })).status, 422);
    assert.equal(await Usuario.count(), 0);
  });

  it('crea a la persona sin contraseña con acceso a RR.HH., y repetir no duplica', async () => {
    const r = await llamar('/personas', { email: 'Ana@Gmail.test', nombre: 'Ana' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.nuevo, true);
    const ana = await Usuario.findOne({ where: { email: 'ana@gmail.test' } });
    assert.equal(ana.password_hash, null);
    assert.equal(ana.es_admin, false);
    assert.deepEqual(await slugsDe('ana@gmail.test'), ['hrsm']);
    // El acceso queda marcado como gestionado por RR.HH.
    assert.equal((await Acceso.findOne({ where: { usuario_id: ana.id } })).gestionado_por, 'hrsm');

    const otra = await llamar('/personas', { email: 'ana@gmail.test', nombre: 'Ana María' });
    assert.equal(otra.body.data.nuevo, false);
    assert.equal(await Usuario.count(), 1);
    assert.equal(await Acceso.count(), 1);
    assert.equal((await Usuario.findByPk(ana.id)).nombre, 'Ana María');

    const registro = await Auditoria.findOne({ where: { accion: 'servicio.registrar' } });
    assert.equal(registro.detalle.solicitadoPor, 'rrhh@empresa.test');
    assert.equal(registro.detalle.servicio, 'hrsm');
  });

  it('a alguien que ya usa otras apps solo le agrega RR.HH., sin tocar su nombre', async () => {
    const beto = await Usuario.create({ email: 'beto@gmail.test', nombre: 'Beto' });
    await Acceso.create({ app_id: await appId('cartera'), usuario_id: beto.id });
    // Tenia RR.HH. dado a mano: al registrarlo la app, el acceso pasa a ser gestionado por ella. Cartera sigue siendo manual.
    await Acceso.create({ app_id: await appId('hrsm'), usuario_id: beto.id });
    await llamar('/personas', { email: 'beto@gmail.test', nombre: 'Otro nombre' });
    assert.equal((await Usuario.findByPk(beto.id)).nombre, 'Beto');
    assert.deepEqual((await slugsDe('beto@gmail.test')).sort(), ['cartera', 'hrsm']);
    assert.equal((await Acceso.findOne({ where: { usuario_id: beto.id, app_id: await appId('hrsm') } })).gestionado_por, 'hrsm');
    assert.equal((await Acceso.findOne({ where: { usuario_id: beto.id, app_id: await appId('cartera') } })).gestionado_por, null);
  });

  it('genera contraseña temporal solo para personas que son únicamente de RR.HH.', async () => {
    await llamar('/personas', { email: 'ana@gmail.test', nombre: 'Ana' });
    const r = await llamar('/personas/password-temporal', { email: 'ana@gmail.test' });
    assert.equal(r.status, 200);
    const ana = await Usuario.findOne({ where: { email: 'ana@gmail.test' } });
    assert.ok(await security.verifyPassword(r.body.data.passwordTemporal, ana.password_hash));
    assert.equal(ana.debe_cambiar_password, true);

    // Con otra app por equipo ya no es de RR.HH. solamente.
    const eq = await Equipo.create({ nombre: 'Finanzas' });
    await EquipoMiembro.create({ equipo_id: eq.id, usuario_id: ana.id });
    await Acceso.create({ app_id: await appId('bases'), equipo_id: eq.id });
    assert.equal((await llamar('/personas/password-temporal', { email: 'ana@gmail.test' })).status, 409);

    // Administradores, corporativos, inexistentes y personas sin RR.HH. tampoco.
    const adm = await Usuario.create({ email: 'adm@gmail.test', nombre: 'Adm', es_admin: true });
    await Acceso.create({ app_id: await appId('hrsm'), usuario_id: adm.id });
    assert.equal((await llamar('/personas/password-temporal', { email: 'adm@gmail.test' })).status, 409);
    await llamar('/personas', { email: 'carlos@aed.com.co', nombre: 'Carlos' });
    assert.equal((await llamar('/personas/password-temporal', { email: 'carlos@aed.com.co' })).status, 409);
    assert.equal((await llamar('/personas/password-temporal', { email: 'nadie@gmail.test' })).status, 404);
    await Usuario.create({ email: 'sin@gmail.test', nombre: 'Sin apps' });
    assert.equal((await llamar('/personas/password-temporal', { email: 'sin@gmail.test' })).status, 409);
  });

  it('quitar el acceso solo retira RR.HH. directo y conserva lo demás', async () => {
    await llamar('/personas', { email: 'ana@gmail.test', nombre: 'Ana' });
    const ana = await Usuario.findOne({ where: { email: 'ana@gmail.test' } });
    await Acceso.create({ app_id: await appId('siger'), usuario_id: ana.id });
    const r = await llamar('/personas/quitar-acceso', { email: 'ana@gmail.test' });
    assert.equal(r.body.data.quitado, true);
    assert.deepEqual(await slugsDe('ana@gmail.test'), ['siger']);
    assert.equal((await llamar('/personas/quitar-acceso', { email: 'ana@gmail.test' })).body.data.quitado, false);
    assert.equal((await llamar('/personas/quitar-acceso', { email: 'nadie@gmail.test' })).body.data.quitado, false);
  });

  it('cambiar el correo renombra la cuenta (conserva la contraseña) si es solo de RR.HH.; si no, da de alta el nuevo', async () => {
    await llamar('/personas', { email: 'ana@gmail.test', nombre: 'Ana' });
    const { body } = await llamar('/personas/password-temporal', { email: 'ana@gmail.test' });
    const r = await llamar('/personas/cambiar-correo', { anterior: 'ana@gmail.test', nuevo: 'ana.perez@gmail.test', nombre: 'Ana Pérez' });
    assert.equal(r.status, 200);
    const renombrada = await Usuario.findOne({ where: { email: 'ana.perez@gmail.test' } });
    assert.ok(renombrada);
    assert.ok(await security.verifyPassword(body.data.passwordTemporal, renombrada.password_hash));
    assert.equal(await Usuario.count({ where: { email: 'ana@gmail.test' } }), 0);

    const beto = await Usuario.create({ email: 'beto@gmail.test', nombre: 'Beto' });
    await Acceso.create({ app_id: await appId('cartera'), usuario_id: beto.id });
    await Acceso.create({ app_id: await appId('hrsm'), usuario_id: beto.id });
    await llamar('/personas/cambiar-correo', { anterior: 'beto@gmail.test', nuevo: 'beto2@gmail.test', nombre: 'Beto' });
    assert.deepEqual(await slugsDe('beto@gmail.test'), ['cartera']);
    assert.deepEqual(await slugsDe('beto2@gmail.test'), ['hrsm']);
  });
});
