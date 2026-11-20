const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('./models'); // registra todas las asociaciones antes de montar rutas
const routes = require('./routes/index');
const errorHandler = require('./middlewares/errorHandler');
const notFoundHandler = require('./middlewares/notFoundHandler');

const app = express();

// Detras de Traefik y del gateway: sin esto `req.ip` seria siempre el de un proxy. Solo se usa para auditoria, no para decidir accesos.
app.set('trust proxy', true);

// Con credentials (cookies de sesion) el navegador rechaza un origen "*": hay que devolver el origen exacto.
// Sin CORS_ORIGIN solo se aceptan origenes localhost (desarrollo); en produccion se define.
const origenCors = process.env.CORS_ORIGIN || ((origin, cb) => cb(null, !origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)));
app.use(cors({ origin: origenCors, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
// Todo bajo /api, igual que el resto de la familia.
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
