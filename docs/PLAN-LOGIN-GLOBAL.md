# Plan: login global del portal AED

Estado: **decisiones cerradas, sin implementar** (2026-11-20). Nada de este plan está construido todavía.

## 1. Objetivo

Que la persona inicie sesión **una sola vez en el portal** (`portal.aed-it.com`) y que el portal decida **a qué aplicaciones puede entrar**. Los permisos finos (qué puede hacer dentro de cada app) siguen configurándose dentro de cada app, como hoy.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Quién provee la identidad | **Servicio propio del portal** (`portal-auth`), con su propia base de datos. No se depende de la asignación de usuarios de Entra ID. |
| Métodos de login | **Microsoft** (con el registro "Acceso Apps" que ya existe) **y correo + contraseña** para quien no tiene correo corporativo de AED. |
| Llave de identidad | El **correo en minúsculas** para todos (corporativo o no). Es el mismo campo `email` único que ya usan las seis apps. |
| Contraseñas actuales | **No se migran.** Cada persona con contraseña recibe una temporal del administrador y debe cambiarla en el primer ingreso. |
| Revocación | Sesión de acceso de **1 hora**; al renovarla se vuelve a comprobar que la persona siga activa. |
| Administración de accesos | **Solo TI** (usuarios con `es_admin`). Los equipos sirven para agrupar accesos, no para delegar administración. |
| Permisos dentro de cada app | Se quedan en cada app (roles, alcance, funcionalidades). El portal solo dice "puede entrar a esta app". |
| Costo de licencias | Ninguno. Solo un recurso más en Coolify y una base Postgres en el mismo servidor. |

## 3. Arquitectura

```
Navegador ── portal.aed-it.com ──► gateway (nginx)
                                     ├─ /                    landing (login, apps, administración)
                                     ├─ /portal/api/         servicio portal-auth  (nuevo)
                                     └─ /cartera/, /siger/…  apps (verifican la sesión del portal)
```

### 3.1 Servicio `portal-auth`

- Carpeta nueva `0. PLATAFORMA AED/auth/`, Node + Express + Sequelize + Postgres, con las mismas convenciones de las otras apps (módulos de 5 archivos, `ApiError`, Zod, migraciones forward-only).
- Se despliega como **recurso propio en Coolify** (Build Pack Dockerfile, Base Directory `/auth`), igual que el gateway. Base de datos nueva `portal_aed`.
- El gateway lo alcanza por `PORTAL_AUTH_UPSTREAM` (dominio público, igual que el resto de upstreams).

### 3.2 Modelo de datos

| Tabla | Contenido |
|---|---|
| `usuarios` | id, `email` (único, minúsculas), nombre, `activo`, `es_admin`, `password_hash` (nulo si solo usa Microsoft), `debe_cambiar_password`, `microsoft_id`, `microsoft_email`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_login` |
| `equipos` | id, nombre, descripción |
| `equipo_miembros` | equipo × usuario |
| `apps` | id, `slug` (`cartera`, `siger`, `solicitudes`, `hrsm`, `bases`, `comercial`, `actas`), nombre, `activa` |
| `accesos` | app × (usuario **o** equipo); restricción: exactamente uno de los dos |
| `refresh_tokens` | id, usuario, hash del token, expira, `revocado`, user-agent, IP |
| `auditoria` | quién cambió qué y cuándo; intentos de login fallidos y exitosos |

**Acceso efectivo** de una persona = apps asignadas directamente **más** las de cualquiera de sus equipos, mientras la persona y la app estén activas.

### 3.3 Sesión

- Cookie `portal_session` (JWT `RS256`, 1 h) y cookie `portal_refresh` (opaca, rotativa, guardada como hash en la base, 7 días). Ambas `HttpOnly`, `Secure`, `SameSite=Lax`.
- La cookie de acceso vale para todo `portal.aed-it.com`, así que llega a cada app por el gateway sin configurar nada más.
- Contenido del token: `sub`, `email`, `nombre`, `apps` (slugs permitidos), `equipos`, `iss`, `aud`, `exp`.
- La llave **privada** vive solo en el servicio (variable de entorno en Coolify, nunca en el repositorio). Las apps verifican con la pública, que sirve el portal en `/portal/api/.well-known/jwks.json` (con `kid`, para poder rotar la llave).
- Cuando el token de acceso vence, el cliente de cada app llama a `/portal/api/auth/refresh` y reintenta. Ahí se comprueba que la persona siga activa.

### 3.4 Login

- **Contraseña:** `bcryptjs`, reglas de contraseña de las apps (`passwordRules` de Cartera), mensajes de error uniformes (no revelar si el correo existe), límite de intentos con bloqueo temporal.
- **Microsoft:** mismo patrón MSAL que `auth.azure.js` de SIGER. Se agrega al registro "Acceso Apps" la URI `https://portal.aed-it.com/portal/api/auth/azure/callback`. El primer ingreso vincula `microsoft_id` por correo; sin usuario creado en el portal, no entra.
- **Dominios corporativos:** lista configurable (p. ej. el dominio de AED). Para esos correos el login por contraseña queda **deshabilitado** y solo se permite Microsoft; la contraseña es para el resto.
- **Primer administrador:** variable `PORTAL_ADMIN_EMAILS`. Quien entre con Microsoft con uno de esos correos queda como `es_admin`, sin contraseña inicial que repartir.

### 3.5 Lado de cada app

Un módulo pequeño `portalAuth` (copia idéntica en cada app, como ya se hace con `errorHandler` y `security.js`):

1. Lee la cookie `portal_session` y verifica firma, `iss`, `aud` y expiración con la llave pública.
2. Comprueba que el slug de la app esté en `apps`.
3. Busca al usuario local **por correo** y que esté activo; construye `req.usuario` igual que hoy, con sus roles locales.
4. Si el usuario no existe en la app: 403 con el mensaje "pide a un administrador que te cree en esta aplicación" (se mantiene el comportamiento actual; no se crean usuarios solos).

Interruptor por app `PORTAL_AUTH=off|optional|required`: en `optional` se aceptan ambas sesiones (la vieja y la del portal); en `required` solo la del portal. Volver a `off` es el plan de reversa.

El frontend de cada app cambia su pantalla de login por una redirección a `/login?next=<ruta>` del portal, y su cierre de sesión llama al del portal.

### 3.6 Gateway (nginx)

- Ruta nueva `location /portal/api/` hacia el servicio.
- Respaldo de SPA para `/login` y `/admin` de la landing (hoy `location /` devuelve 404 a rutas que no son archivos).
- Opcional, por app y solo cuando esa app ya esté en `required`: `auth_request` al servicio como segunda barrera en el borde.
- **Cuidado de despliegue:** definir `PORTAL_AUTH_UPSTREAM` **antes** de redeployar el gateway. Sin esa variable nginx no arranca y se cae todo el portal (mismo riesgo documentado para los demás upstreams).

### 3.7 Landing

- Pantalla de login (Microsoft + correo y contraseña) y cambio de contraseña obligatorio.
- Tras entrar, solo se muestran las tarjetas de las apps con acceso. Se conservan hero, recientes y estado en línea.
- Pantalla de administración (`/admin`, solo `es_admin`): usuarios (alta, activar o desactivar, contraseña temporal que se muestra una sola vez, es admin), equipos, matriz de apps por usuario y por equipo, auditoría.
- Menú de usuario con cierre de sesión global.

## 4. Fases

Cada fase se puede desplegar sola y no rompe las anteriores. Ninguna app cambia su login hasta la fase 4.

### Fase 0 — Preparación
- Crear en Coolify el recurso `portal-auth` y la base `portal_aed`.
- Generar el par de llaves `RS256` y cargar la privada como variable de entorno.
- Registrar la URI de redirección del portal en "Acceso Apps".
- Fijar los slugs de las apps y la lista de dominios corporativos.
- **Verificar:** el recurso arranca vacío y responde `/health`.

### Fase 1 — Servicio `portal-auth`
- Modelos y migraciones; login por contraseña y por Microsoft; emisión y renovación de tokens; JWKS; APIs de usuarios, equipos, apps y accesos; cálculo de acceso efectivo; auditoría.
- Script de importación (solo lectura, simulacro por defecto, `--aplicar` para escribir): lee los usuarios activos de cada app y crea en el portal los usuarios y sus accesos directos, para que **nadie pierda acceso el día del cambio**. No copia contraseñas.
- **Verificar:** pruebas con `node:test` del cálculo de acceso (directo, por equipo, ambos, quitar de un equipo, usuario o app inactivos) y de la verificación de tokens (firma, expiración, app no permitida); casos con `curl`: login correcto e incorrecto, bloqueo por intentos, renovación, revocación al desactivar a alguien.

### Fase 2 — Landing con login y administración
- Pantallas de la sección 3.7 y cliente de la API.
- **Verificar:** en el navegador, en escritorio y móvil: login con ambos métodos, cambio obligatorio de contraseña, tarjetas filtradas según acceso, alta de usuario y de equipo, asignación de accesos, cierre de sesión.

### Fase 3 — Gateway
- Ruta `/portal/api/`, respaldo de SPA, variable `PORTAL_AUTH_UPSTREAM`, README actualizado. `auth_request` preparado pero apagado.
- **Verificar:** build del contenedor en local con `docker compose`, rutas de las apps sin cambios, `/login` carga al refrescar la página.

### Fase 4 — Módulo `portalAuth` y piloto
- Escribir el módulo, probarlo y aplicarlo primero a **SIGER** (ya usa Microsoft y vincula por correo), en `optional` y luego `required`. Después **Solicitudes**.
- **Verificar:** entrar al portal y abrir la app sin pedir login; persona sin acceso rechazada; persona desactivada pierde acceso en menos de 1 hora; con `PORTAL_AUTH=off` vuelve el login anterior.

### Fase 5 — Cartera, Recursos Humanos y Bases
- Mismo módulo; se elimina su login por contraseña (detrás del interruptor). Estas tres apps ganan login con Microsoft sin código propio.
- **Verificar:** igual que la fase 4, más que las contraseñas viejas dejen de funcionar solo al pasar a `required`.

### Fase 6 — Comercial, Actas y cierre
- Comercial: decidir qué pasa con su login con HubSpot (hoy queda dentro de la app hasta resolverlo). Actas: mismo módulo.
- Redirigir los dominios directos de cada app al portal (la cookie solo existe en `portal.aed-it.com`) y retirar el código de login viejo.
- **Verificar:** ninguna app responde con sesión propia; los dominios directos redirigen.

### Fase 7 — Endurecimiento
- Segundo factor (TOTP) para las cuentas con contraseña.
- Invitaciones por correo (enlace para fijar contraseña) en lugar de contraseña temporal; SIGER ya tiene `graphMail.js` como referencia.
- Alertas de inicios de sesión sospechosos y revisión periódica de accesos.

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El servicio del portal pasa a ser pieza crítica: si cae, nadie entra | Healthcheck, reinicio automático, respaldo de la base, acceso de administrador por Microsoft sin depender de contraseñas |
| Contraseñas temporales repartidas por canales poco seguros | Se muestran una sola vez, caducan en el primer cambio y obligan a cambiarlas; en la fase 7 se reemplazan por invitación por correo |
| Cuentas con contraseña sin segundo factor | Dominios corporativos solo por Microsoft; TOTP en la fase 7 |
| Persona desactivada sigue dentro hasta 1 h | Vida corta del token y comprobación de `activo` al renovar; aceptado en las decisiones |
| Apps accesibles por su dominio directo evitan el portal | Las apps verifican la firma del token (no solo confían en nginx); en `required` el dominio directo no tiene cookie; cierre en la fase 6 |
| Romper el login de una app en producción | Interruptor por app `off\|optional\|required`; se pasa a `required` solo tras probar en `optional` |
| Una app con usuarios que nunca existieron en la tabla del portal | El script de importación los crea desde las tablas de cada app antes de cambiar nada |

## 6. Decisiones adicionales (2026-11-20)

Resueltas las dudas que había abiertas:

1. **Dominios corporativos:** solo el de AED. Esos correos entran únicamente con Microsoft; el resto usa contraseña.
2. **Persona con acceso pero sin usuario en esa app:** se mantiene el mensaje "pide a un administrador que te cree en esta aplicación". No se crean usuarios solos.
3. **Login con HubSpot de Comercial:** se mantiene dentro de esa app hasta la fase 6, cuando se revisa si se conserva o se quita.
4. **Contraseñas temporales:** TI se las entrega a cada persona (el administrador la ve una sola vez en pantalla). Las invitaciones por correo quedan para la fase 7.
5. **Ubicación del código:** `0. PLATAFORMA AED/auth/`, dentro del repositorio del gateway.

No quedan pendientes abiertos antes de la fase 0.
