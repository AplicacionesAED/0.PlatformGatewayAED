const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { migrar, limpiar } = require('./helpers');

process.env.PORTAL_CORPORATE_DOMAINS = 'aed.com.co';
process.env.PORTAL_ADMIN_EMAILS = 'jefe@aed.com.co';

const sequelize = require('../src/config/db');
const app = require('../src/app');
const security = require('../src/utils/security');
const { Usuario, App, Acceso, RefreshToken, Auditoria } = require('../src/models');
const authService = require('../src/modules/auth/auth.service');

let server;
let base;

// Cliente HTTP con "jar" de cookies (como un navegador): guarda las que llegan y borra las que el servidor limpia.
function cliente() {
  const jar = new Map();
  async function pedir(metodo, ruta, cuerpo) {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    for (const c of res.headers.getSetCookie()) {
      const [par, ...atributos] = c.split(';');
      const [nombre, ...valor] = par.split('=');
      const vencida = atributos.some((a) => /expires=.*1970/i.test(a)) || valor.join('=') === '';
      if (vencida) jar.delete(nombre.trim());
      else jar.set(nombre.trim(), valor.join('='));
    }
    const texto = await res.text();
    return { status: res.status, body: texto ? JSON.parse(texto) : null };
  }
  return { jar, get: (r) => pedir('GET', r), post: (r, b) => pedir('POST', r, b ?? {}), patch: (r, b) => pedir('PATCH', r, b), put: (r, b) => pedir('PUT', r, b), del: (r) => pedir('DELETE', r) };
}

const PASS = 'Clave-Segura1!';
async function persona(email, extra = {}) {
  return Usuario.create({ email, nombre: email, password_hash: await security.hashPassword(PASS), ...extra });
}
const entrar = async (email, password = PASS) => {
  const c = cliente();
  const r = await c.post('/api/auth/login', { email, password });
  return { c, r };
};
const appId = async (slug) => (await App.findOne({ where: { slug } })).id;

describe('portal-auth (HTTP)', () => {
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

  describe('login por contraseña', () => {
    it('entra con credenciales correctas y /me muestra sus apps', async () => {
      const u = await persona('ana@gmail.test');
      const { c, r } = await entrar('ANA@gmail.test'); // el correo no distingue mayusculas
      assert.equal(r.status, 200);
      assert.ok(c.jar.has('portal_session') && c.jar.has('portal_refresh'));

      const admin = await persona('adm@gmail.test', { es_admin: true });
      const a = cliente();
      await a.post('/api/auth/login', { email: admin.email, password: PASS });
      await a.post('/api/accesos', { appId: await appId('cartera'), usuarioId: u.id });

      const re = await c.post('/api/auth/refresh'); // la sesion nueva ya trae la app
      assert.deepEqual(re.body.data.apps.map((x) => x.slug), ['cartera']);
      const me = await c.get('/api/me');
      assert.equal(me.body.data.email, 'ana@gmail.test');
    });

    it('da el mismo error para correo inexistente, contraseña mala, cuenta inactiva y sin contraseña', async () => {
      await persona('ana@gmail.test');
      await persona('baja@gmail.test', { activo: false });
      await persona('ms@gmail.test', { password_hash: null });
      const respuestas = [
        await entrar('nadie@gmail.test'),
        await entrar('ana@gmail.test', 'Equivocada1!'),
        await entrar('baja@gmail.test'),
        await entrar('ms@gmail.test'),
      ];
      for (const { r } of respuestas) {
        assert.equal(r.status, 401);
        assert.equal(r.body.error.message, 'Correo o contraseña incorrectos');
      }
    });

    it('las cuentas de dominio corporativo no entran con contraseña', async () => {
      await persona('juan@aed.com.co');
      assert.equal((await entrar('juan@aed.com.co')).r.status, 401);
    });

    it('bloquea la cuenta tras 5 intentos fallidos, aunque luego mande la contraseña correcta', async () => {
      await persona('ana@gmail.test');
      for (let i = 0; i < 5; i += 1) assert.equal((await entrar('ana@gmail.test', 'Mala-clave1!')).r.status, 401);
      assert.equal((await entrar('ana@gmail.test')).r.status, 429);
      await Usuario.update({ bloqueado_hasta: new Date(Date.now() - 1000) }, { where: { email: 'ana@gmail.test' } });
      assert.equal((await entrar('ana@gmail.test')).r.status, 200);
    });

    it('un login correcto reinicia el contador de intentos', async () => {
      await persona('ana@gmail.test');
      for (let i = 0; i < 4; i += 1) await entrar('ana@gmail.test', 'Mala-clave1!');
      assert.equal((await entrar('ana@gmail.test')).r.status, 200);
      for (let i = 0; i < 4; i += 1) await entrar('ana@gmail.test', 'Mala-clave1!');
      assert.equal((await entrar('ana@gmail.test')).r.status, 200);
    });

    it('deja constancia de los accesos y de los fallos', async () => {
      await persona('ana@gmail.test');
      await entrar('ana@gmail.test');
      await entrar('ana@gmail.test', 'Mala-clave1!');
      const acciones = (await Auditoria.findAll()).map((a) => a.accion);
      assert.ok(acciones.includes('login.ok') && acciones.includes('login.fallido'));
    });
  });

  describe('renovación de la sesión', () => {
    it('rota el token: el nuevo sirve y el viejo ya no', async () => {
      await persona('ana@gmail.test');
      const { c } = await entrar('ana@gmail.test');
      const viejo = c.jar.get('portal_refresh');
      assert.equal((await c.post('/api/auth/refresh')).status, 200);
      assert.notEqual(c.jar.get('portal_refresh'), viejo);
      assert.equal((await c.post('/api/auth/refresh')).status, 200);
    });

    it('reusar enseguida un token revocado (carrera entre pestañas) falla sin cerrar las demás sesiones', async () => {
      await persona('ana@gmail.test');
      const { c } = await entrar('ana@gmail.test');
      const viejo = c.jar.get('portal_refresh');
      await c.post('/api/auth/refresh');
      const vigente = c.jar.get('portal_refresh');

      const otra = cliente();
      otra.jar.set('portal_refresh', viejo);
      assert.equal((await otra.post('/api/auth/refresh')).status, 401);

      c.jar.set('portal_refresh', vigente);
      assert.equal((await c.post('/api/auth/refresh')).status, 200);
    });

    it('reusar un token revocado hace rato se toma como robo y cierra todas las sesiones', async () => {
      await persona('ana@gmail.test');
      const { c } = await entrar('ana@gmail.test');
      const viejo = c.jar.get('portal_refresh');
      await c.post('/api/auth/refresh');
      const vigente = c.jar.get('portal_refresh');
      await RefreshToken.update({ revocado_en: new Date(Date.now() - 5 * 60 * 1000) }, { where: { token_hash: security.hashRefreshToken(viejo) } });

      const ladron = cliente();
      ladron.jar.set('portal_refresh', viejo);
      assert.equal((await ladron.post('/api/auth/refresh')).status, 401);

      c.jar.set('portal_refresh', vigente);
      assert.equal((await c.post('/api/auth/refresh')).status, 401);
      assert.ok((await Auditoria.findAll()).some((a) => a.accion === 'sesion.reuso'));
    });

    it('rechaza un token vencido o inventado y limpia las cookies', async () => {
      await persona('ana@gmail.test');
      const { c } = await entrar('ana@gmail.test');
      await RefreshToken.update({ expira_en: new Date(Date.now() - 1000) }, { where: {} });
      assert.equal((await c.post('/api/auth/refresh')).status, 401);
      assert.equal(c.jar.has('portal_refresh'), false);

      const x = cliente();
      x.jar.set('portal_refresh', 'inventado');
      assert.equal((await x.post('/api/auth/refresh')).status, 401);
      assert.equal((await cliente().post('/api/auth/refresh')).status, 401);
    });

    it('cerrar sesión revoca el token', async () => {
      await persona('ana@gmail.test');
      const { c } = await entrar('ana@gmail.test');
      const token = c.jar.get('portal_refresh');
      assert.equal((await c.post('/api/auth/logout')).status, 204);
      assert.equal(c.jar.has('portal_session'), false);
      const otra = cliente();
      otra.jar.set('portal_refresh', token);
      assert.equal((await otra.post('/api/auth/refresh')).status, 401);
    });
  });

  describe('contraseña', () => {
    it('con cambio pendiente: ve /me, no administra, y al cambiarla queda libre', async () => {
      await persona('adm@gmail.test', { es_admin: true, debe_cambiar_password: true });
      const { c, r } = await entrar('adm@gmail.test');
      assert.equal(r.body.data.debeCambiarPassword, true);
      assert.equal((await c.get('/api/me')).status, 200);
      assert.equal((await c.get('/api/usuarios')).status, 403);

      assert.equal((await c.post('/api/auth/cambiar-password', { passwordActual: PASS, passwordNueva: 'debil' })).status, 422);
      assert.equal((await c.post('/api/auth/cambiar-password', { passwordActual: 'Otra-clave1!', passwordNueva: 'Nueva-Clave2@' })).status, 403);
      assert.equal((await c.post('/api/auth/cambiar-password', { passwordActual: PASS, passwordNueva: PASS })).status, 422);
      const ok = await c.post('/api/auth/cambiar-password', { passwordActual: PASS, passwordNueva: 'Nueva-Clave2@' });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.data.debeCambiarPassword, false);
      assert.equal((await c.get('/api/usuarios')).status, 200);

      assert.equal((await entrar('adm@gmail.test')).r.status, 401);
      assert.equal((await entrar('adm@gmail.test', 'Nueva-Clave2@')).r.status, 200);
    });

    it('cambiarla cierra las demás sesiones abiertas', async () => {
      await persona('ana@gmail.test');
      const { c } = await entrar('ana@gmail.test');
      const { c: otro } = await entrar('ana@gmail.test');
      await c.post('/api/auth/cambiar-password', { passwordActual: PASS, passwordNueva: 'Nueva-Clave2@' });
      assert.equal((await otro.post('/api/auth/refresh')).status, 401);
    });
  });

  describe('suplantación', () => {
    const claims = (c) => security.verifyAccessToken(c.jar.get(security.ACCESS_COOKIE_NAME));

    it('un administrador entra como otra persona, no administra, renueva sin pasar la hora y regresa a su cuenta', async () => {
      const adm = await persona('adm@gmail.test', { es_admin: true, nombre: 'Admin' });
      const ana = await persona('ana@gmail.test', { nombre: 'Ana', debe_cambiar_password: true });
      await Acceso.create({ app_id: await appId('cartera'), usuario_id: ana.id });
      const { c } = await entrar('adm@gmail.test');

      const r = await c.post('/api/auth/suplantar', { usuarioId: ana.id });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.email, 'ana@gmail.test');
      assert.deepEqual(r.body.data.suplantadoPor, { id: adm.id, nombre: 'Admin' });
      // La contraseña pendiente de Ana no se le exige ni se le ofrece a quien suplanta.
      assert.equal(r.body.data.debeCambiarPassword, false);
      assert.equal(r.body.data.tienePassword, false);
      assert.deepEqual(r.body.data.apps.map((a) => a.slug), ['cartera']);

      const t = claims(c);
      assert.equal(t.sub, String(ana.id));
      assert.deepEqual(t.act, { sub: String(adm.id), nombre: 'Admin' });
      assert.equal(t.cpw, false);
      assert.ok(t.exp - t.iat <= 60 * 60);

      assert.equal((await c.get('/api/me')).body.data.suplantadoPor.id, adm.id);
      assert.equal((await c.get('/api/usuarios')).status, 403);
      assert.equal((await c.post('/api/auth/suplantar', { usuarioId: ana.id })).status, 403);
      assert.equal((await c.post('/api/auth/cambiar-password', { passwordActual: PASS, passwordNueva: 'Nueva-Clave2@' })).status, 403);
      // La sesion propia del administrador quedo cerrada; la suplantada vence en una hora como maximo.
      assert.equal(await RefreshToken.count({ where: { usuario_id: adm.id, revocado: false } }), 0);
      const fila = await RefreshToken.findOne({ where: { usuario_id: ana.id, revocado: false } });
      assert.equal(fila.suplantado_por, adm.id);
      assert.ok(fila.expira_en.getTime() <= Date.now() + 60 * 60 * 1000 + 1000);

      const re = await c.post('/api/auth/refresh');
      assert.equal(re.status, 200);
      assert.equal(re.body.data.suplantadoPor.id, adm.id);
      const renovada = await RefreshToken.findOne({ where: { usuario_id: ana.id, revocado: false } });
      assert.equal(renovada.expira_en.getTime(), fila.expira_en.getTime());

      const fin = await c.post('/api/auth/suplantar/fin');
      assert.equal(fin.status, 200);
      assert.equal(fin.body.data.email, 'adm@gmail.test');
      assert.equal(fin.body.data.suplantadoPor, null);
      assert.equal(claims(c).act, undefined);
      assert.equal((await c.get('/api/usuarios')).status, 200);
      assert.equal(await RefreshToken.count({ where: { usuario_id: ana.id, revocado: false } }), 0);
      assert.equal((await c.post('/api/auth/suplantar/fin')).status, 409);

      // Ana no figura como si hubiera entrado; la auditoria lo anota a nombre del administrador.
      assert.equal((await Usuario.findByPk(ana.id)).ultimo_login, null);
      const acciones = await Auditoria.findAll({ where: { actor_id: adm.id, entidad_id: String(ana.id) }, order: [['id', 'ASC']] });
      assert.deepEqual(acciones.map((a) => a.accion), ['sesion.suplantar', 'sesion.suplantar-fin']);
    });

    it('solo un administrador, y nunca como otro administrador, como sí mismo o como alguien inactivo', async () => {
      const adm = await persona('adm@gmail.test', { es_admin: true });
      const otroAdm = await persona('otro@gmail.test', { es_admin: true });
      const inactiva = await persona('ina@gmail.test', { activo: false });
      const ana = await persona('ana@gmail.test');
      const { c } = await entrar('adm@gmail.test');
      assert.equal((await c.post('/api/auth/suplantar', { usuarioId: otroAdm.id })).status, 409);
      assert.equal((await c.post('/api/auth/suplantar', { usuarioId: adm.id })).status, 409);
      assert.equal((await c.post('/api/auth/suplantar', { usuarioId: inactiva.id })).status, 409);
      assert.equal((await c.post('/api/auth/suplantar', { usuarioId: 9999 })).status, 404);
      assert.equal((await c.post('/api/auth/suplantar', { usuarioId: 'x' })).status, 422);

      const { c: comun } = await entrar('ana@gmail.test');
      assert.equal((await comun.post('/api/auth/suplantar', { usuarioId: otroAdm.id })).status, 403);
      assert.equal((await comun.post('/api/auth/suplantar/fin')).status, 409);
      assert.equal((await cliente().post('/api/auth/suplantar', { usuarioId: ana.id })).status, 401);
    });

    it('si quien suplanta deja de ser administrador, la sesión suplantada ya no se renueva ni permite regresar', async () => {
      const adm = await persona('adm@gmail.test', { es_admin: true });
      const ana = await persona('ana@gmail.test');
      const { c } = await entrar('adm@gmail.test');
      await c.post('/api/auth/suplantar', { usuarioId: ana.id });
      await Usuario.update({ es_admin: false }, { where: { id: adm.id } });
      assert.equal((await c.post('/api/auth/refresh')).status, 401);

      await Usuario.update({ es_admin: true }, { where: { id: adm.id } });
      const { c: c2 } = await entrar('adm@gmail.test');
      await c2.post('/api/auth/suplantar', { usuarioId: ana.id });
      await Usuario.update({ activo: false }, { where: { id: adm.id } });
      assert.equal((await c2.post('/api/auth/suplantar/fin')).status, 401);
    });
  });

  describe('administración', () => {
    it('exige sesión y rol de administrador', async () => {
      await persona('ana@gmail.test');
      assert.equal((await cliente().get('/api/usuarios')).status, 401);
      const { c } = await entrar('ana@gmail.test');
      for (const ruta of ['/api/usuarios', '/api/equipos', '/api/apps', '/api/accesos/matriz', '/api/auditoria']) {
        assert.equal((await c.get(ruta)).status, 403, ruta);
      }
    });

    it('crea personas: con contraseña temporal si no es corporativa, sin ella si lo es', async () => {
      await persona('adm@gmail.test', { es_admin: true });
      const { c: admin } = await entrar('adm@gmail.test');

      const ext = await admin.post('/api/usuarios', { email: 'Externo@Gmail.test', nombre: 'Externo' });
      assert.equal(ext.status, 201);
      assert.ok(ext.body.data.passwordTemporal.length >= 12);
      assert.equal(ext.body.data.usuario.email, 'externo@gmail.test');
      assert.equal(JSON.stringify(ext.body).includes('password_hash'), false);

      const { r } = await entrar('externo@gmail.test', ext.body.data.passwordTemporal);
      assert.equal(r.status, 200);
      assert.equal(r.body.data.debeCambiarPassword, true);

      const corp = await admin.post('/api/usuarios', { email: 'nuevo@aed.com.co', nombre: 'Nuevo' });
      assert.equal(corp.body.data.passwordTemporal, null);
      assert.equal(corp.body.data.usuario.corporativo, true);

      assert.equal((await admin.post('/api/usuarios', { email: 'externo@gmail.test', nombre: 'Otra vez' })).status, 409);
      assert.equal((await admin.post('/api/usuarios', { email: 'no-es-correo', nombre: 'X' })).status, 422);
    });

    it('resetear la contraseña da una temporal nueva, invalida la vieja y cierra sesiones; no aplica a corporativos', async () => {
      await persona('adm@gmail.test', { es_admin: true });
      const ana = await persona('ana@gmail.test');
      const corp = await persona('juan@aed.com.co');
      const { c: admin } = await entrar('adm@gmail.test');
      const { c: sesionAna } = await entrar('ana@gmail.test');

      const r = await admin.post(`/api/usuarios/${ana.id}/reset-password`);
      assert.equal(r.status, 200);
      assert.equal((await entrar('ana@gmail.test')).r.status, 401);
      assert.equal((await entrar('ana@gmail.test', r.body.data.passwordTemporal)).r.status, 200);
      assert.equal((await sesionAna.post('/api/auth/refresh')).status, 401);
      assert.equal((await admin.post(`/api/usuarios/${corp.id}/reset-password`)).status, 409);
    });

    it('desactivar a alguien le corta la sesión de inmediato y la renovación', async () => {
      await persona('adm@gmail.test', { es_admin: true });
      const ana = await persona('ana@gmail.test');
      const { c: admin } = await entrar('adm@gmail.test');
      const { c } = await entrar('ana@gmail.test');
      assert.equal((await c.get('/api/me')).status, 200);

      assert.equal((await admin.patch(`/api/usuarios/${ana.id}`, { activo: false })).status, 200);
      assert.equal((await c.get('/api/me')).status, 401);
      assert.equal((await c.post('/api/auth/refresh')).status, 401);
      assert.equal((await entrar('ana@gmail.test')).r.status, 401);
    });

    it('un administrador no puede desactivarse ni quitarse el rol a sí mismo', async () => {
      const adm = await persona('adm@gmail.test', { es_admin: true });
      const { c } = await entrar('adm@gmail.test');
      assert.equal((await c.patch(`/api/usuarios/${adm.id}`, { activo: false })).status, 409);
      assert.equal((await c.patch(`/api/usuarios/${adm.id}`, { esAdmin: false })).status, 409);
      assert.equal((await c.patch(`/api/usuarios/${adm.id}`, { nombre: 'Nuevo nombre' })).status, 200);
      assert.equal((await c.patch(`/api/usuarios/${adm.id}`, {})).status, 422);
    });

    it('da acceso por equipo y lo quita al sacar a la persona del equipo', async () => {
      await persona('adm@gmail.test', { es_admin: true });
      const ana = await persona('ana@gmail.test');
      const { c: admin } = await entrar('adm@gmail.test');
      const { c } = await entrar('ana@gmail.test');

      const eq = (await admin.post('/api/equipos', { nombre: 'Contabilidad' })).body.data;
      assert.equal((await admin.post('/api/equipos', { nombre: 'Contabilidad' })).status, 409);
      await admin.put(`/api/equipos/${eq.id}/miembros`, { usuarioIds: [ana.id] });
      const acc = await admin.post('/api/accesos', { appId: await appId('bases'), equipoId: eq.id });
      assert.equal(acc.status, 201);

      let re = await c.post('/api/auth/refresh');
      assert.deepEqual(re.body.data.apps.map((x) => x.slug), ['bases']);
      assert.deepEqual(re.body.data.equipos, ['Contabilidad']);

      await admin.put(`/api/equipos/${eq.id}/miembros`, { usuarioIds: [] });
      re = await c.post('/api/auth/refresh');
      assert.deepEqual(re.body.data.apps, []);

      const m = await admin.get('/api/accesos/matriz');
      assert.equal(m.body.data.accesos.length, 1);
      assert.equal((await admin.del(`/api/accesos/${acc.body.data.id}`)).status, 204);
      assert.equal((await admin.del(`/api/accesos/${acc.body.data.id}`)).status, 404);
    });

    it('valida los datos de los accesos', async () => {
      const adm = await persona('adm@gmail.test', { es_admin: true });
      const { c } = await entrar('adm@gmail.test');
      const cartera = await appId('cartera');
      assert.equal((await c.post('/api/accesos', { appId: cartera })).status, 422);
      assert.equal((await c.post('/api/accesos', { appId: cartera, usuarioId: adm.id, equipoId: 1 })).status, 422);
      assert.equal((await c.post('/api/accesos', { appId: 9999, usuarioId: adm.id })).status, 404);
      assert.equal((await c.post('/api/accesos', { appId: cartera, usuarioId: 9999 })).status, 404);
    });

    it('desactivar una app la quita del acceso de todos', async () => {
      const adm = await persona('adm@gmail.test', { es_admin: true });
      const { c } = await entrar('adm@gmail.test');
      const cartera = await appId('cartera');
      await c.post('/api/accesos', { appId: cartera, usuarioId: adm.id });
      assert.deepEqual((await c.get('/api/me')).body.data.apps.map((x) => x.slug), ['cartera']);
      await c.patch(`/api/apps/${cartera}`, { activa: false });
      assert.deepEqual((await c.get('/api/me')).body.data.apps, []);
    });

    it('lista la auditoría con paginación', async () => {
      await persona('adm@gmail.test', { es_admin: true });
      const { c } = await entrar('adm@gmail.test');
      const r = await c.get('/api/auditoria?limit=1');
      assert.equal(r.status, 200);
      assert.equal(r.body.data.length, 1);
      assert.equal(r.body.data[0].actor.email, 'adm@gmail.test');
      assert.ok(r.body.meta.total >= 1);
      assert.equal((await c.get('/api/auditoria?limit=999')).status, 422);
    });

    it('filtra la auditoría por persona (lo que hizo y lo que se hizo sobre ella) y por fechas', async () => {
      const adm = await persona('adm@gmail.test', { es_admin: true });
      const ana = await persona('ana@gmail.test');
      const beto = await persona('beto@gmail.test');
      const { c } = await entrar('adm@gmail.test');
      const eq = (await c.post('/api/equipos', { nombre: 'Obra' })).body.data;
      await c.put(`/api/equipos/${eq.id}/miembros`, { usuarioIds: [ana.id] });
      await c.post('/api/accesos', { appId: await appId('cartera'), usuarioId: ana.id });
      await c.patch(`/api/usuarios/${beto.id}`, { nombre: 'Beto' });
      await entrar('ana@gmail.test');

      const deAna = (await c.get(`/api/auditoria?usuarioId=${ana.id}`)).body.data.map((f) => f.accion).sort();
      assert.deepEqual(deAna, ['acceso.conceder', 'equipo.miembros', 'login.ok']);
      const deBeto = (await c.get(`/api/auditoria?usuarioId=${beto.id}`)).body.data.map((f) => f.accion);
      assert.deepEqual(deBeto, ['usuario.actualizar']);
      // Lo que hizo el administrador (actor) tambien cuenta como suyo.
      assert.ok((await c.get(`/api/auditoria?usuarioId=${adm.id}`)).body.meta.total >= 5);

      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      assert.ok((await c.get(`/api/auditoria?desde=${hoy}&hasta=${hoy}`)).body.meta.total >= 6);
      assert.equal((await c.get('/api/auditoria?hasta=2000-01-01')).body.meta.total, 0);
      assert.equal((await c.get('/api/auditoria?desde=ayer')).status, 422);
    });
  });

  describe('login con Microsoft (servicio)', () => {
    const ctx = { ip: '127.0.0.1' };

    it('vincula la cuenta de Microsoft por el correo en el primer ingreso y luego entra por el id', async () => {
      const u = await persona('ana@gmail.test');
      const { perfil } = await authService.loginMicrosoft({ microsoftId: 'oid-1', email: 'Ana@Gmail.test', nombre: 'Ana' }, ctx);
      assert.equal(perfil.email, 'ana@gmail.test');
      assert.equal((await u.reload()).microsoft_id, 'oid-1');
      const otra = await authService.loginMicrosoft({ microsoftId: 'oid-1', email: 'otro-correo@gmail.test' }, ctx);
      assert.equal(otra.perfil.id, u.id);
    });

    it('otra cuenta de Microsoft con el mismo correo no se queda con una cuenta ya vinculada', async () => {
      await persona('ana@gmail.test', { microsoft_id: 'oid-original' });
      await assert.rejects(authService.loginMicrosoft({ microsoftId: 'oid-impostor', email: 'ana@gmail.test' }, ctx), { message: 'OAuthAccountNotFound' });
    });

    it('quien no existe en el portal no entra', async () => {
      await assert.rejects(authService.loginMicrosoft({ microsoftId: 'oid-9', email: 'desconocido@aed.com.co' }, ctx), { message: 'OAuthAccountNotFound' });
    });

    it('una cuenta inactiva no entra', async () => {
      await persona('ana@aed.com.co', { activo: false });
      await assert.rejects(authService.loginMicrosoft({ microsoftId: 'oid-2', email: 'ana@aed.com.co' }, ctx), { message: 'OAuthAccountInactive' });
    });

    it('un administrador inicial se crea solo, queda como admin y puede administrar', async () => {
      const { perfil, tokens } = await authService.loginMicrosoft({ microsoftId: 'oid-3', email: 'jefe@aed.com.co', nombre: 'Jefe' }, ctx);
      assert.equal(perfil.esAdmin, true);
      const c = cliente();
      c.jar.set('portal_session', tokens.accessToken);
      assert.equal((await c.get('/api/usuarios')).status, 200);
    });

    it('un administrador inicial que ya existía sin rol de admin lo recibe al entrar', async () => {
      await persona('jefe@aed.com.co', { password_hash: null });
      const { perfil } = await authService.loginMicrosoft({ microsoftId: 'oid-4', email: 'jefe@aed.com.co' }, ctx);
      assert.equal(perfil.esAdmin, true);
    });
  });

  describe('retorno de Microsoft (HTTP)', () => {
    const volver = async (ruta) => {
      const res = await fetch(base + ruta, { redirect: 'manual' });
      return { status: res.status, location: res.headers.get('location') };
    };

    it('un retorno sin code, con error de Microsoft o sin la cookie de state termina en el login con OAuthError', async () => {
      for (const ruta of [
        '/api/auth/azure/callback',
        '/api/auth/azure/callback?error=access_denied&error_description=cancelado',
        '/api/auth/azure/callback?code=abc&state=xyz',
      ]) {
        const r = await volver(ruta);
        assert.equal(r.status, 302, ruta);
        assert.match(r.location, /\/login\?error=OAuthError$/, ruta);
      }
    });

    it('nunca deja una sesion abierta tras un retorno rechazado', async () => {
      const res = await fetch(`${base}/api/auth/azure/callback?code=abc&state=xyz`, { redirect: 'manual' });
      assert.equal(res.headers.getSetCookie().some((c) => c.startsWith('portal_session=') && !/Max-Age=0|1970/.test(c)), false);
    });
  });

  describe('JWKS', () => {
    it('publica la llave pública y no la privada', async () => {
      const r = await cliente().get('/api/.well-known/jwks.json');
      assert.equal(r.status, 200);
      assert.equal(r.body.keys[0].kty, 'RSA');
      assert.equal(r.body.keys[0].d, undefined);
    });
  });
});
