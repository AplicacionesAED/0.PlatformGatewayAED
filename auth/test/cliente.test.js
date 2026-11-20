const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const security = require('../src/utils/security');
const portal = require('../cliente/portalAuth');

const usuario = { id: 3, email: 'Ana@AED.com.co', nombre: 'Ana', debe_cambiar_password: false };
const sesion = (token) => ({ cookies: token ? { portal_session: token } : {} });
const emitir = (extra = {}, u = usuario) => security.createAccessToken({ ...u, ...extra }, { apps: ['siger', 'cartera'], equipos: [] });

describe('portalAuth (cliente de las apps)', () => {
  let servidor;
  let pedidos;
  let respuesta;

  before(async () => {
    servidor = http.createServer((req, res) => {
      pedidos += 1;
      res.writeHead(respuesta.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(respuesta.body()));
    });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    process.env.PORTAL_JWKS_URL = `http://127.0.0.1:${servidor.address().port}/jwks.json`;
  });
  after(() => new Promise((ok) => servidor.close(ok)));
  beforeEach(() => {
    pedidos = 0;
    respuesta = { status: 200, body: () => security.getJwks() };
    portal._reiniciarCache();
  });

  it('una sesion valida con acceso a la app resuelve ok, con el correo en minusculas', async () => {
    const r = await portal.resolverSesion(sesion(emitir()), 'siger');
    assert.deepEqual(r, { estado: 'ok', email: 'ana@aed.com.co', nombre: 'Ana' });
  });

  it('sin cookie no hay sesion y ni siquiera consulta al portal', async () => {
    assert.deepEqual(await portal.resolverSesion(sesion(null), 'siger'), { estado: 'sin-sesion' });
    assert.equal(pedidos, 0);
  });

  it('una sesion valida sin acceso a esa app resuelve sin-acceso', async () => {
    const r = await portal.resolverSesion(sesion(emitir()), 'bases');
    assert.equal(r.estado, 'sin-acceso');
    assert.equal(r.email, 'ana@aed.com.co');
  });

  it('con cambio de contraseña pendiente resuelve cambiar-password aunque tenga la app', async () => {
    const r = await portal.resolverSesion(sesion(emitir({ debe_cambiar_password: true })), 'siger');
    assert.equal(r.estado, 'cambiar-password');
  });

  it('rechaza un token firmado con otra llave', async () => {
    const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const falso = jwt.sign({ type: 'access', email: 'ana@aed.com.co', apps: ['siger'] }, otra, {
      algorithm: 'RS256',
      issuer: 'portal.aed-it.com',
      audience: 'aed-apps',
      keyid: security.getJwks().keys[0].kid,
    });
    assert.deepEqual(await portal.resolverSesion(sesion(falso), 'siger'), { estado: 'sin-sesion' });
  });

  it('rechaza un token alterado, uno sin firma y valores que no son un token', async () => {
    const [h, , s] = emitir().split('.');
    const cuerpo = Buffer.from(JSON.stringify({ type: 'access', email: 'admin@aed.com.co', apps: ['siger'] })).toString('base64url');
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sinFirma = `${b({ alg: 'none', typ: 'JWT', kid: security.getJwks().keys[0].kid })}.${cuerpo}.`;
    for (const malo of [`${h}.${cuerpo}.${s}`, sinFirma, 'basura', 'a.b.c']) {
      assert.equal((await portal.resolverSesion(sesion(malo), 'siger')).estado, 'sin-sesion');
    }
  });

  it('un token vencido ya no vale', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const token = emitir();
    t.mock.timers.tick(61 * 60 * 1000);
    assert.equal((await portal.resolverSesion(sesion(token), 'siger')).estado, 'sin-sesion');
  });

  it('guarda las llaves en cache: varias peticiones, una sola lectura del JWKS', async () => {
    const token = emitir();
    for (let i = 0; i < 5; i += 1) await portal.resolverSesion(sesion(token), 'siger');
    assert.equal(pedidos, 1);
  });

  it('si el portal no responde no lanza: simplemente no hay sesion', async () => {
    respuesta = { status: 503, body: () => ({}) };
    assert.deepEqual(await portal.resolverSesion(sesion(emitir()), 'siger'), { estado: 'sin-sesion' });
  });

  it('un kid desconocido relee el JWKS una vez y no martilla al portal con tokens inventados', async () => {
    const token = emitir();
    await portal.resolverSesion(sesion(token), 'siger'); // carga la llave real
    const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const desconocido = jwt.sign({ type: 'access', email: 'x@y.z', apps: ['siger'] }, otra, { algorithm: 'RS256', keyid: 'kid-inventado' });
    for (let i = 0; i < 5; i += 1) await portal.resolverSesion(sesion(desconocido), 'siger');
    assert.ok(pedidos <= 2, `pedidos al JWKS: ${pedidos}`);
  });

  it('el modo sale de PORTAL_AUTH y un valor invalido cae a off', () => {
    const antes = process.env.PORTAL_AUTH;
    const error = console.error;
    console.error = () => {};
    try {
      delete process.env.PORTAL_AUTH;
      assert.equal(portal.modo(), 'off');
      for (const [valor, esperado] of [['optional', 'optional'], [' REQUIRED ', 'required'], ['off', 'off'], ['si', 'off'], ['', 'off']]) {
        process.env.PORTAL_AUTH = valor;
        assert.equal(portal.modo(), esperado, valor);
      }
    } finally {
      console.error = error;
      if (antes === undefined) delete process.env.PORTAL_AUTH;
      else process.env.PORTAL_AUTH = antes;
    }
  });
});
