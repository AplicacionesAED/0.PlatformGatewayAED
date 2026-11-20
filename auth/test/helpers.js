// Ayudas de las pruebas con base de datos. Se NIEGAN a correr contra una base que no termine en _test: un TRUNCATE
// contra la base de desarrollo o la de produccion seria un desastre.
require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const url = process.env.DATABASE_URL_TEST;
if (!url || !/_test(\?.*)?$/.test(url)) {
  throw new Error('Define DATABASE_URL_TEST apuntando a una base cuyo nombre termine en _test (nunca la de desarrollo ni produccion).');
}
// Las pruebas usan SIEMPRE la base de pruebas, aunque .env traiga otra en DATABASE_URL.
process.env.DATABASE_URL = url;

let migrada = false;
function migrar() {
  if (migrada) return;
  execSync('npx sequelize-cli db:migrate', { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe' });
  migrada = true;
}

// Deja las tablas de datos vacias (el catalogo de apps sembrado por migracion se conserva).
async function limpiar() {
  const sequelize = require('../src/config/db');
  await sequelize.query('TRUNCATE usuarios, equipos, equipo_miembros, accesos, refresh_tokens, auditoria RESTART IDENTITY CASCADE');
  await sequelize.query('UPDATE apps SET activa = TRUE');
}

module.exports = { migrar, limpiar };
