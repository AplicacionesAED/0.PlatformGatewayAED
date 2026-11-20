require('dotenv').config();

// Sin conexion a la BD configurada todo falla con errores confusos: mejor cortar aqui diciendo que falta.
if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.error('Falta configurar la base de datos: copia .env.example a .env y completa DATABASE_URL (o las variables PG*).');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3060;

const server = app.listen(PORT, () => {
  console.log(`Portal auth escuchando en http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Espera unos segundos o cierra el proceso que lo tiene y vuelve a intentar.`);
    process.exit(1);
  }
  throw err;
});
