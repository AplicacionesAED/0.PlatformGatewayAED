// Importa al portal las personas ACTIVAS de cada app y les da acceso a las apps donde ya estaban activas, para que nadie pierda
// acceso el dia del cambio. Solo LEE las bases de las apps (transaccion de solo lectura).
//
// Contrasenas: solo de RR.HH. (hrsm), que usa el mismo bcrypt que el portal. Se copia su hash (y si debe cambiarla) a quien no
// tenga ya contrasena en el portal y no sea de dominio corporativo: asi las ~700 personas de RR.HH. siguen entrando con la suya.
// Las demas apps no copian contrasenas.
//
// Simulacro por defecto: muestra que haria. Con --aplicar escribe en la base del portal (DATABASE_URL), de forma idempotente.
//
// Cada app se lee de una variable IMPORT_DB_<APP> con su cadena de conexion (ponerla en el shell, no en un archivo del repo):
//   IMPORT_DB_SOLICITUDES, IMPORT_DB_CARTERA, IMPORT_DB_HRSM, IMPORT_DB_BASES, IMPORT_DB_COMERCIAL, IMPORT_DB_SIGER
// Las apps cuya variable falte se omiten. IMPORT_PGSSL=true si esas bases exigen SSL. --apps=hrsm,cartera limita las apps.
//
//   node scripts/importarUsuarios.js                       # simulacro
//   node scripts/importarUsuarios.js --apps=hrsm --aplicar # escribe solo RR.HH.
require('dotenv').config();
const { Client } = require('pg');

const TODAS = ['solicitudes', 'cartera', 'hrsm', 'bases', 'comercial', 'siger'];
const filtro = process.argv.find((a) => a.startsWith('--apps='));
const APPS = filtro ? filtro.slice(7).split(',').map((s) => s.trim()).filter((s) => TODAS.includes(s)) : TODAS;
const aplicar = process.argv.includes('--aplicar');
// Apps cuya contrasena se copia (mismo formato bcrypt que el portal) y la columna donde la guardan.
const CON_HASH = { hrsm: 'hashed_password' };
const esBcrypt = (hash) => typeof hash === 'string' && /^\$2[aby]\$\d{2}\$/.test(hash);
// Los correos mal escritos en las apps ("gmail,com", espacios...) no se importan: se listan para corregirlos en su app.
const CORREO_VALIDO = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

async function leerPersonasActivas(slug, url) {
  const cliente = new Client({ connectionString: url, ssl: process.env.IMPORT_PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await cliente.connect();
  try {
    await cliente.query('BEGIN READ ONLY');
    // Algunas apps (SIGER) borran con deleted_at ademas de desactivar con activo.
    const { rows: cols } = await cliente.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'deleted_at' AND table_schema = current_schema()");
    const sinBorrados = cols.length ? ' AND deleted_at IS NULL' : '';
    const hash = CON_HASH[slug] ? `, ${CON_HASH[slug]} AS hash, debe_cambiar_password AS debe` : '';
    const { rows } = await cliente.query(`SELECT email, nombre${hash} FROM usuarios WHERE activo = TRUE${sinBorrados}`);
    await cliente.query('ROLLBACK');
    return rows;
  } finally {
    await cliente.end();
  }
}

async function main() {
  const { normalizarEmail, esDominioCorporativo } = require('../src/utils/identidad');
  const sequelize = require('../src/config/db');
  const { Usuario, App, Acceso } = require('../src/models');

  if (!APPS.length) {
    console.error(`--apps no trae ninguna app valida (${TODAS.join(', ')}).`);
    process.exit(1);
  }
  const personas = new Map(); // email -> { nombre, apps: Set<slug>, hash?, debe? }
  const omitidas = [];
  const invalidos = []; // [slug, correo]
  for (const slug of APPS) {
    const url = process.env[`IMPORT_DB_${slug.toUpperCase()}`];
    if (!url) {
      omitidas.push(slug);
      continue;
    }
    const filas = await leerPersonasActivas(slug, url);
    console.log(`${slug}: ${filas.length} personas activas`);
    for (const { email, nombre, hash, debe } of filas) {
      const correo = normalizarEmail(email);
      if (!correo) continue;
      if (!CORREO_VALIDO.test(correo)) {
        invalidos.push([slug, correo]);
        continue;
      }
      if (!personas.has(correo)) personas.set(correo, { nombre: nombre || correo, apps: new Set() });
      const p = personas.get(correo);
      p.apps.add(slug);
      if (esBcrypt(hash) && !p.hash) Object.assign(p, { hash, debe: Boolean(debe) });
    }
  }
  if (omitidas.length === APPS.length && APPS.length) {
    console.error('No hay ninguna fuente: define al menos una variable IMPORT_DB_<APP>.');
    process.exit(1);
  }
  if (omitidas.length) console.log(`Omitidas (sin variable): ${omitidas.join(', ')}`);
  if (invalidos.length) {
    console.log(`
NO se importan ${invalidos.length} correos con formato invalido (corregirlos en su app):`);
    for (const [slug, correo] of invalidos) console.log(`  - ${correo}  (${slug})`);
  }

  const catalogo = new Map((await App.findAll()).map((a) => [a.slug, a]));
  const existentes = new Map((await Usuario.findAll({ attributes: ['email', 'password_hash'] })).map((u) => [u.email, u]));
  const nuevas = [...personas.keys()].filter((e) => !existentes.has(e));
  const totalAccesos = [...personas.values()].reduce((n, p) => n + p.apps.size, 0);
  // Recibe la contrasena copiada: no corporativa, con hash de origen y sin contrasena propia en el portal.
  const recibeHash = (email, p) => Boolean(p.hash) && !esDominioCorporativo(email) && !existentes.get(email)?.password_hash;
  const conHash = [...personas].filter(([e, p]) => recibeHash(e, p));
  const sinContrasena = nuevas.filter((e) => !esDominioCorporativo(e) && !recibeHash(e, personas.get(e)));

  console.log(`\nPersonas distintas: ${personas.size} (${nuevas.length} nuevas en el portal, ${personas.size - nuevas.length} ya existian)`);
  console.log(`Accesos por revisar: ${totalAccesos}`);
  console.log(`Conservan su contraseña de RR.HH.: ${conHash.length} (de ellas ${conHash.filter(([, p]) => !p.debe).length} ya la habían cambiado; ${conHash.filter(([, p]) => p.debe).length} tienen una temporal o nunca la recibieron y deberán cambiarla)`);
  console.log(`Nuevas que NO son de dominio corporativo y quedan sin contraseña (usa "Restablecer contraseña" en el portal): ${sinContrasena.length}`);
  for (const e of sinContrasena) console.log(`  - ${e}`);

  if (!aplicar) {
    console.log('\nSimulacro: no se escribio nada. Repite con --aplicar para importar.');
    return;
  }

  let accesosNuevos = 0;
  let hashesCopiados = 0;
  await sequelize.transaction(async (transaction) => {
    for (const [email, p] of personas) {
      const { nombre, apps } = p;
      // Sin contrasena: las cuentas corporativas entran con Microsoft; las demas reciben una temporal desde la pantalla de administracion.
      const [usuario] = await Usuario.findOrCreate({ where: { email }, defaults: { nombre, debe_cambiar_password: !esDominioCorporativo(email) }, transaction });
      if (recibeHash(email, p) && !usuario.password_hash) {
        await usuario.update({ password_hash: p.hash, debe_cambiar_password: p.debe }, { transaction });
        hashesCopiados += 1;
      }
      for (const slug of apps) {
        const app = catalogo.get(slug);
        if (!app) continue;
        const [, creado] = await Acceso.findOrCreate({ where: { app_id: app.id, usuario_id: usuario.id, equipo_id: null }, transaction });
        if (creado) accesosNuevos += 1;
      }
    }
  });
  console.log(`\nListo: ${nuevas.length} personas creadas, ${accesosNuevos} accesos nuevos, ${hashesCopiados} contraseñas de RR.HH. copiadas.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => require('../src/config/db').close());
