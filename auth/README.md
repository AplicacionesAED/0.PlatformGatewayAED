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
| `GET /api/me` | autenticado | persona, apps permitidas y equipos |
| `GET /api/.well-known/jwks.json` | público | llave pública para verificar sesiones |
| `/api/usuarios`, `/api/equipos`, `/api/apps`, `/api/accesos` (+ `/matriz`), `/api/auditoria` | solo `es_admin` | administración |

## Sesión

- Cookie `portal_session` (JWT `RS256`, 60 min) y `portal_refresh` (opaca, 7 días, rotativa; solo se guarda su hash). `HttpOnly`, `SameSite=Lax`, `Secure` en producción.
- Claims: `sub`, `email`, `nombre`, `apps` (slugs permitidos), `equipos`, `cpw` (debe cambiar contraseña; las apps no deben dejarla entrar), `iss=portal.aed-it.com`, `aud=aed-apps`.
- Las apps verifican con la llave pública del JWKS. Un token de renovación revocado que reaparece pasados 30 s se toma como robo y cierra todas las sesiones de esa persona.
- `PORTAL_REFRESH_COOKIE_PATH` es la ruta que ve el navegador: `/api/auth` en local, `/portal/api/auth` detrás del gateway.

## Reglas de identidad

- El correo en minúsculas es la llave de todos. Los dominios de `PORTAL_CORPORATE_DOMAINS` entran **solo con Microsoft** (su contraseña, si existiera, no sirve).
- Los correos de `PORTAL_ADMIN_EMAILS` quedan como administradores al entrar con Microsoft (se crean si no existen).
- Contraseñas temporales: las genera el servicio, se devuelven una sola vez y obligan a cambiarlas. Cinco intentos fallidos bloquean la cuenta 15 minutos.

## Importar las personas actuales de las apps

```
node scripts/importarUsuarios.js            # simulacro
node scripts/importarUsuarios.js --aplicar  # escribe en la base del portal
```

Lee (solo lectura) cada base indicada en `IMPORT_DB_SOLICITUDES`, `IMPORT_DB_CARTERA`, `IMPORT_DB_HRSM`, `IMPORT_DB_BASES`, `IMPORT_DB_COMERCIAL`, `IMPORT_DB_SIGER`, `IMPORT_DB_ACTAS` (ponerlas en el shell, nunca en un archivo del repositorio). Crea a las personas activas y les da acceso directo a las apps donde ya estaban activas. No copia contraseñas: las personas fuera del dominio corporativo reciben una temporal con "Resetear contraseña".

## Despliegue (Coolify)

Recurso Dockerfile, Base Directory `/auth`, puerto 3060, base Postgres propia. `npm start` migra y arranca. Variables: ver `.env.example`.
