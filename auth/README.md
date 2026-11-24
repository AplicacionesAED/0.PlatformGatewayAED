# portal-auth

Servicio de login global del portal AED: autentica a las personas (Microsoft o correo y contraseña), decide a qué apps puede entrar cada una (por persona o por equipo) y emite la sesión que las apps verifican. Los permisos finos siguen dentro de cada app. Plan, decisiones y fases: [`../docs/PLAN-LOGIN-GLOBAL.md`](../docs/PLAN-LOGIN-GLOBAL.md).

Express + Sequelize + PostgreSQL (JavaScript plano), mismas convenciones que las demás apps (módulos `model/schema/service/controller/routes`, `ApiError`, contrato `{ success, data }`). Todo vive bajo `/api`; el gateway lo publica como `/portal/api/*`.

## Estado

Fase 1 (servicio) construida y probada en local. **No está desplegada**: el recurso `Portal Auth` existe en Coolify (proyecto `0. GATEWAY`) pero sin desplegar, y ninguna app ni el gateway lo usan todavía.

## Desarrollo

```
cp .env.example .env     # completar DATABASE_URL (base propia terminada en _dev) y DATABASE_URL_TEST
npm install
npm run db:migrate
npm run dev              # http://localhost:3060
npm test                 # exige DATABASE_URL_TEST con una base terminada en _test
```

Sin `PORTAL_JWT_PRIVATE_KEY_B64` en desarrollo se genera una llave efímera (las sesiones se pierden al reiniciar). En producción es obligatoria: PEM privado RSA en base64, en una sola línea.

## Rutas

| Ruta | Quién | Qué |
|---|---|---|
| `POST /api/auth/login` | público | correo + contraseña |
| `GET /api/auth/azure/login?next=` y `.../callback` | público | login con Microsoft (valida `state`; `next` solo acepta rutas del portal) |
| `POST /api/auth/refresh` | cookie de renovación | rota el token y vuelve a comprobar que la persona siga activa |
| `POST /api/auth/logout` | cualquiera | revoca la renovación y limpia cookies |
| `POST /api/auth/cambiar-password` | autenticado | cambio (obligatorio en el primer ingreso con temporal) |
| `POST /api/auth/suplantar` `{ usuarioId }` | solo `es_admin` (sin estar ya suplantando) | entra como otra persona activa que no sea administradora; cierra la sesión del administrador |
| `POST /api/auth/suplantar/fin` | cookie de renovación de una sesión suplantada | regresa a la cuenta del administrador (si sigue activo y administrador) |
| `GET /api/me` | autenticado | persona, apps permitidas y equipos (`suplantadoPor` en una sesión suplantada) |
| `GET /api/.well-known/jwks.json` | público | llave pública para verificar sesiones |
| `/api/usuarios`, `/api/equipos`, `/api/apps`, `/api/accesos` (+ `/matriz`), `/api/auditoria` (filtros `accion`, `actorId`, `usuarioId` = todo lo que toca a una persona, `desde`/`hasta` en AAAA-MM-DD hora Colombia) | solo `es_admin` | administración |

## Sesión

- Cookie `portal_session` (JWT `RS256`, 60 min) y `portal_refresh` (opaca, 7 días, rotativa; solo se guarda su hash). `HttpOnly`, `SameSite=Lax`, `Secure` en producción.
- Claims: `sub`, `email`, `nombre`, `apps` (slugs permitidos), `equipos`, `cpw` (debe cambiar contraseña; las apps no deben dejarla entrar), `iss=portal.aed-it.com`, `aud=aed-apps`.
- Las apps verifican con la llave pública del JWKS. Un token de renovación revocado que reaparece pasados 30 s se toma como robo y cierra todas las sesiones de esa persona.
- `PORTAL_REFRESH_COOKIE_PATH` es la ruta que ve el navegador: `/api/auth` en local, `/portal/api/auth` detrás del gateway.
- **Suplantación** ("entrar como"): la sesión queda a nombre de la persona y lleva el claim `act` = `{ sub, nombre }` del administrador (RFC 8693); `cpw` va en falso. Dura máximo 60 min (`SUPLANTACION_MINUTES`): renovarla no la extiende. Dentro de ella no se administra ni se cambia la contraseña. Cae si el administrador deja de ser administrador activo. La auditoría registra `sesion.suplantar` y `sesion.suplantar-fin` a nombre del administrador. Las apps hoy no leen `act`, así que lo que se haga en ellas queda a nombre de la persona.

## Reglas de identidad

- El correo en minúsculas es la llave de todos. Los dominios de `PORTAL_CORPORATE_DOMAINS` entran **solo con Microsoft** (su contraseña, si existiera, no sirve).
- Los correos de `PORTAL_ADMIN_EMAILS` quedan como administradores al entrar con Microsoft (se crean si no existen).
- Contraseñas temporales: las genera el servicio, se devuelven una sola vez y obligan a cambiarlas. Cinco intentos fallidos bloquean la cuenta 15 minutos.

## Importar las personas actuales de las apps

```
node scripts/importarUsuarios.js                        # simulacro
node scripts/importarUsuarios.js --aplicar              # escribe en la base del portal
node scripts/importarUsuarios.js --apps=hrsm --aplicar  # solo RR.HH.
```

Lee (solo lectura) cada base indicada en `IMPORT_DB_SOLICITUDES`, `IMPORT_DB_CARTERA`, `IMPORT_DB_HRSM`, `IMPORT_DB_BASES`, `IMPORT_DB_COMERCIAL`, `IMPORT_DB_SIGER` (ponerlas en el shell, nunca en un archivo del repositorio). Crea a las personas activas y les da acceso directo a las apps donde ya estaban activas. Contraseñas: solo de RR.HH. (mismo bcrypt que el portal) se copia el hash y si debe cambiarla, a quien no sea de dominio corporativo y no tenga ya contraseña en el portal; así sus ~700 personas siguen entrando con la suya. Las demás apps no copian contraseñas: las personas fuera del dominio corporativo reciben una temporal con "Restablecer contraseña".

## API de servicio (`/api/servicio/:app`)

Para que una app dé de alta a su propia gente sin pasar por TI (hoy RR.HH., donde cada empleado tiene cuenta). Se habilita por app con `PORTAL_SERVICE_KEY_<APP>` (p. ej. `PORTAL_SERVICE_KEY_HRSM`), que la app manda en la cabecera `X-Portal-Service-Key`; `X-Portal-Solicitado-Por` (opcional) guarda en la auditoría quién lo pidió dentro de la app.

| Ruta (`POST`) | Qué hace |
|---|---|
| `/personas` `{ email, nombre }` | Crea a la persona (sin contraseña) si no existe y le da acceso a la app |
| `/personas/quitar-acceso` `{ email }` | Quita el acceso directo a la app |
| `/personas/cambiar-correo` `{ anterior, nuevo, nombre }` | Renombra la cuenta (conserva la contraseña) si es solo de esta app; si no, da de alta el correo nuevo y quita la app al viejo |
| `/personas/password-temporal` `{ email }` | Contraseña temporal (una sola vez, obliga a cambiarla) |

Límites: solo toca el acceso a su propia app, nunca crea administradores, y nombre, correo o contraseña solo de personas que no son administradoras y no tienen acceso a otra app (ni directo ni por equipo). No reactiva a alguien que TI desactivó. Pruebas: `test/servicio.test.js`.

## Despliegue (Coolify)

Recurso Dockerfile, Base Directory `/auth`, puerto 3060, base Postgres propia. `npm start` migra y arranca. Variables: ver `.env.example`.

## Cliente para las apps (`cliente/portalAuth.js`)

Módulo que cada app copia **idéntico** en `backend/src/utils/portalAuth.js` para verificar la sesión del portal con la llave pública (JWKS, con caché y relectura al rotar la llave). Resuelve `ok`, `sin-acceso`, `cambiar-password` o `sin-sesion` y lee el modo de `PORTAL_AUTH` (`off|optional|required`). Pruebas: `test/cliente.test.js`. Si se cambia, volver a copiarlo a todas las apps.
