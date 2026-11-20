const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const security = require('../src/utils/security');
const { esDominioCorporativo, esAdminInicial, rutaSegura, normalizarEmail } = require('../src/utils/identidad');

const usuario = { id: 7, email: 'ana@x.test', nombre: 'Ana', debe_cambiar_password: false };
const datos = { apps: ['cartera', 'siger'], equipos: ['Obra'] };

describe('token de acceso', () => {
  it('se firma y se verifica con las claims esperadas', () => {
    const p = security.verifyAccessToken(security.createAccessToken(usuario, datos));
    assert.equal(p.sub, '7');
    assert.equal(p.email, 'ana@x.test');
    assert.deepEqual(p.apps, ['cartera', 'siger']);
    assert.deepEqual(p.equipos, ['Obra']);
    assert.equal(p.cpw, false);
    assert.equal(p.iss, 'portal.aed-it.com');
    assert.equal(p.aud, 'aed-apps');
  });

  it('marca cpw cuando debe cambiar la contrasena', () => {
    const p = security.verifyAccessToken(security.createAccessToken({ ...usuario, debe_cambiar_password: true }, datos));
    assert.equal(p.cpw, true);
  });

  it('una app puede verificarlo solo con la llave publica del JWKS', () => {
    const token = security.createAccessToken(usuario, datos);
    const jwk = security.getJwks().keys[0];
    assert.equal(jwk.alg, 'RS256');
    assert.equal(jwk.d, undefined, 'el JWKS nunca debe exponer la llave privada');
    const publica = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const p = jwt.verify(token, publica, { algorithms: ['RS256'], issuer: 'portal.aed-it.com', audience: 'aed-apps' });
    assert.equal(p.email, 'ana@x.test');
    assert.equal(jwt.decode(token, { complete: true }).header.kid, jwk.kid);
  });

  it('rechaza un token firmado con otra llave', () => {
    const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const falso = jwt.sign({ type: 'access', email: 'ana@x.test' }, otra, { algorithm: 'RS256', issuer: 'portal.aed-it.com', audience: 'aed-apps' });
    assert.throws(() => security.verifyAccessToken(falso));
  });

  it('rechaza un token alterado', () => {
    const [h, , s] = security.createAccessToken(usuario, datos).split('.');
    const cuerpo = Buffer.from(JSON.stringify({ sub: '1', email: 'admin@x.test', type: 'access' })).toString('base64url');
    assert.throws(() => security.verifyAccessToken(`${h}.${cuerpo}.${s}`));
  });

  it('rechaza un token sin firma (alg none)', () => {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sinFirma = `${b({ alg: 'none', typ: 'JWT' })}.${b({ type: 'access', email: 'a@x.test', iss: 'portal.aed-it.com', aud: 'aed-apps' })}.`;
    assert.throws(() => security.verifyAccessToken(sinFirma));
  });

  it('rechaza un emisor o audiencia distintos', () => {
    const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    assert.throws(() => security.verifyAccessToken(jwt.sign({ type: 'access' }, otra, { algorithm: 'RS256', issuer: 'otro', audience: 'aed-apps' })));
  });

  it('vence a los 60 minutos', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const token = security.createAccessToken(usuario, datos);
    t.mock.timers.tick(59 * 60 * 1000);
    assert.doesNotThrow(() => security.verifyAccessToken(token));
    t.mock.timers.tick(2 * 60 * 1000);
    assert.throws(() => security.verifyAccessToken(token), /expired/);
  });
});

describe('contrasenas y tokens de renovacion', () => {
  it('la contrasena verifica y no se guarda en claro', async () => {
    const hash = await security.hashPassword('Clave-123!');
    assert.notEqual(hash, 'Clave-123!');
    assert.equal(await security.verifyPassword('Clave-123!', hash), true);
    assert.equal(await security.verifyPassword('otra', hash), false);
  });

  it('el token de renovacion es aleatorio y solo se guarda su hash', () => {
    const a = security.generateRefreshToken();
    const b = security.generateRefreshToken();
    assert.notEqual(a, b);
    assert.equal(security.hashRefreshToken(a).length, 64);
    assert.notEqual(security.hashRefreshToken(a), a);
  });
});

describe('identidad', () => {
  it('normaliza el correo', () => {
    assert.equal(normalizarEmail('  Ana@AED.com.co '), 'ana@aed.com.co');
  });

  it('reconoce dominios corporativos y administradores iniciales', () => {
    process.env.PORTAL_CORPORATE_DOMAINS = 'aed.com.co';
    process.env.PORTAL_ADMIN_EMAILS = 'Uno@aed.com.co, dos@aed.com.co';
    assert.equal(esDominioCorporativo('X@AED.com.co'), true);
    assert.equal(esDominioCorporativo('x@gmail.com'), false);
    assert.equal(esDominioCorporativo('x@evil-aed.com.co'), false);
    assert.equal(esAdminInicial('UNO@aed.com.co'), true);
    assert.equal(esAdminInicial('tres@aed.com.co'), false);
  });

  it('solo acepta rutas del propio portal como destino', () => {
    assert.equal(rutaSegura('/cartera/'), '/cartera/');
    assert.equal(rutaSegura('/admin?x=1'), '/admin?x=1');
    for (const malo of ['https://evil.test', '//evil.test', '/\\evil.test', 'cartera', '', undefined, '/a\r\nSet-Cookie: x=1']) {
      assert.equal(rutaSegura(malo), '/', String(malo));
    }
  });
});
