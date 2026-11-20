// Importa al portal las personas ACTIVAS de cada app y les da acceso a las apps donde ya estaban activas, para que nadie pierda
// acceso el dia del cambio. Solo LEE las bases de las apps (transaccion de solo lectura). No copia contrasenas.
//
// Simulacro por defecto: muestra que haria. Con --aplicar escribe en la base del portal (DATABASE_URL), de forma idempotente.
//
// Cada app se lee de una variable IMPORT_DB_<APP> con su cadena de conexion (ponerla en el shell, no en un archivo del repo):
//   IMPORT_DB_SOLICITUDES, IMPORT_DB_CARTERA, IMPORT_DB_HRSM, IMPORT_DB_BASES, IMPORT_DB_COMERCIAL, IMPORT_DB_SIGER, IMPORT_DB_ACTAS
// Las apps cuya variable falte se omiten. IMPORT_PGSSL=true si esas bases exigen SSL.
//
//   node scripts/importarUsuarios.js            # simulacro
//   node scripts/importarUsuarios.js --aplicar  # escribe
require('dotenv').config();
const { Client } = require('pg');

const APPS = ['solicitudes', 'cartera', 'hrsm', 'bases', 'comercial', 'siger', 'actas'];
const aplicar = process.argv.includes('--aplicar');
// Los correos mal escritos en las apps ("gmail,com", espacios...) no se importan: se listan para corregirlos en su app.
const CORREO_VALIDO = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

async function leerPersonasActivas(slug, url) {
  const cliente = new Client({ connectionString: url, ssl: process.env.IMPORT_PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await cliente.connect();
  try {
    await cliente.query('BEGIN READ ONLY');
    // Algunas apps (SISGER) borran con deleted_at ademas de desactivar con activo.
    const { rows: cols } = await cliente.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'deleted_at' AND table_schema = current_schema()");
    const sinBorrados = cols.length ? ' AND deleted_at IS NULL' : '';
    const { rows } = await cliente.query(`SELECT email, nombre FROM usuarios WHERE activo = TRUE${sinBorrados}`);
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

  const personas = new Map(); // email -> { nombre, apps: Set<slug> }
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
    for (const { email, nombre } of filas) {
      const correo = normalizarEmail(email);
      if (!correo) continue;
      if (!CORREO_VALIDO.test(correo)) {
        invalidos.push([slug, correo]);
        continue;
      }
      if (!personas.has(correo)) personas.set(correo, { nombre: nombre || correo, apps: new Set() });
      personas.get(correo).apps.add(slug);
    }
  }
  if (omitidas.length === APPS.length) {
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
  const existentes = new Set((await Usuario.findAll({ attributes: ['email'] })).map((u) => u.email));
  const nuevas = [...personas.keys()].filter((e) => !existentes.has(e));
  const sinContrasena = nuevas.filter((e) => !esDominioCorporativo(e));
  const totalAccesos = [...personas.values()].reduce((n, p) => n + p.apps.size, 0);

  console.log(`\nPersonas distintas: ${personas.size} (${nuevas.length} nuevas en el portal, ${personas.size - nuevas.length} ya existian)`);
  console.log(`Accesos por revisar: ${totalAccesos}`);
  console.log(`Nuevas que NO son de dominio corporativo (necesitan contraseña: usa "Resetear contraseña" en el portal): ${sinContrasena.length}`);
  for (const e of sinContrasena) console.log(`  - ${e}`);

  if (!aplicar) {
    console.log('\nSimulacro: no se escribio nada. Repite con --aplicar para importar.');
    return;
  }

  let accesosNuevos = 0;
  await sequelize.transaction(async (transaction) => {
    for (const [email, { nombre, apps }] of personas) {
      // Sin contrasena: las cuentas corporativas entran con Microsoft; las demas reciben una temporal desde la pantalla de administracion.
      const [usuario] = await Usuario.findOrCreate({ where: { email }, defaults: { nombre, debe_cambiar_password: !esDominioCorporativo(email) }, transaction });
      for (const slug of apps) {
        const app = catalogo.get(slug);
        if (!app) continue;
        const [, creado] = await Acceso.findOrCreate({ where: { app_id: app.id, usuario_id: usuario.id, equipo_id: null }, transaction });
        if (creado) accesosNuevos += 1;
      }
    }
  });
  console.log(`\nListo: ${nuevas.length} personas creadas, ${accesosNuevos} accesos nuevos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => require('../src/config/db').close());
