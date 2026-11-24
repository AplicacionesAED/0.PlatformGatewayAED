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
| `usuarios` | id, `email` (único, minúsculas), nombre, `activo`, `es_admin`, `password_hash` (nulo si solo usa Microsoft), `debe_cambiar_password`, `microsoft_id`, `microsoft_email`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_login`, `ultima_actividad` (login, renovación de sesión, entrada al portal y latido de `/actividad.js` cada 2 min mientras se usa el portal o una app que lo carga; no cuenta lo hecho por un administrador que suplanta. "En línea" en el panel = actividad en los últimos 5 min) |
| `equipos` | id, nombre, descripción |
| `equipo_miembros` | equipo × usuario |
| `apps` | id, `slug` (`cartera`, `siger`, `solicitudes`, `hrsm`, `bases`, `comercial`; `actas` se quitó del catálogo el 2026-11-23 hasta que el Bot de Actas entre al portal; el `id` de la landing para Comercial hoy es `comerciales` y habrá que alinearlo), nombre, `activa` |
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
- Pantalla de administración (`/admin`, solo `es_admin`): usuarios (alta, activar o desactivar, contraseña temporal que se muestra una sola vez, es admin), equipos, aplicaciones y auditoría. Desde 2026-11-24 se organiza por fichas laterales (persona, equipo, aplicación) en lugar de la matriz de accesos: la ficha de persona reúne su estado, sus apps (directas o por qué equipo), sus equipos y su actividad; Personas tiene filtros rápidos y acciones en lote (agregar a equipo, dar app, desactivar); la auditoría filtra por persona y por fechas. Acceso efectivo = directo ∪ equipos (quitar una app a un equipo no la quita a quien la tiene directa); el panel muestra quién la pierde y quién la conserva antes de quitar una app a un equipo o eliminarlo, ofrece quitar los accesos directos que sobran (dados a mano y también por equipo) y marca los gestionados por una app (`accesos.gestionado_por`, hoy RR.HH.), que no se limpian. Desde 2026-11-24 la ficha de persona tiene "Entrar como esta persona" (suplantación: solo personas activas no administradoras, máximo 1 hora, franja ámbar para regresar; ver `auth/README.md`).
- Menú de usuario con cierre de sesión global.

## 4. Fases

Cada fase se puede desplegar sola y no rompe las anteriores. Ninguna app cambia su login hasta la fase 4.

### Fase 0 — Preparación
- Crear en Coolify el recurso `portal-auth` y la base `portal_aed`.
- Generar el par de llaves `RS256` y cargar la privada como variable de entorno.
- Registrar la URI de redirección del portal en "Acceso Apps".
- Fijar los slugs de las apps y la lista de dominios corporativos.
- **Verificar:** el recurso arranca vacío y responde `/health`.

**Avance (2026-11-20):**
- Hecho: base `BD Portal Auth` (`portal_aed`, Postgres 18, no pública) y recurso `Portal Auth` en el proyecto `0. GATEWAY` de Coolify (Base Directory `/auth`, puerto 3060, dominio `https://pwuuahx9t1houvmk2z4kvnxg.72.62.100.53.sslip.io`). El recurso **no está desplegado** porque `auth/` aún no existe en el repositorio.
- Hecho: variables de entorno cargadas en el recurso (`DATABASE_URL`, llave privada `PORTAL_JWT_PRIVATE_KEY_B64` en base64, `PORTAL_JWT_KID`, `AZURE_*` copiadas de SIGER, `AZURE_REDIRECT_URI`, `PORTAL_CORPORATE_DOMAINS=aed.com.co`, `FRONTEND_URL`, `CORS_ORIGIN`, `PORT`, `NODE_ENV`, `PGSSL`).
- Hecho: `PORTAL_ADMIN_EMAILS` cargado con los dos administradores iniciales (Gabriel y Rubén).
- Hecho: URI `https://portal.aed-it.com/portal/api/auth/azure/callback` registrada en Azure, en "Acceso Apps" > Autenticación > Web.
- Confirmado: el repositorio que usa Coolify (`Gestion-servicios-TI-AED/PlatformGatewayAED`) es el mismo que el `origin` local (`AplicacionesAED/0.PlatformGatewayAED`).
- **Fase 0 cerrada**, salvo la verificación de `/health`, que requiere código desplegado (fase 1).

### Fase 1 — Servicio `portal-auth`
- Modelos y migraciones; login por contraseña y por Microsoft; emisión y renovación de tokens; JWKS; APIs de usuarios, equipos, apps y accesos; cálculo de acceso efectivo; auditoría.
- Script de importación (solo lectura, simulacro por defecto, `--aplicar` para escribir): lee los usuarios activos de cada app y crea en el portal los usuarios y sus accesos directos, para que **nadie pierda acceso el día del cambio**. No copia contraseñas.
- **Verificar:** pruebas con `node:test` del cálculo de acceso (directo, por equipo, ambos, quitar de un equipo, usuario o app inactivos) y de la verificación de tokens (firma, expiración, app no permitida); casos con `curl`: login correcto e incorrecto, bloqueo por intentos, renovación, revocación al desactivar a alguien.

**Avance (2026-11-20):** servicio construido en `auth/` (ver `auth/README.md`) y probado en local: 52 pruebas (`npm test`) cubren el acceso efectivo, tokens y JWKS, login por contraseña con bloqueo, renovación con detección de robo, desactivación, administración, equipos y login con Microsoft; el script `importarUsuarios.js` se probó con bases de origen simuladas (simulacro, aplicar e idempotencia). Cambios respecto al diseño: el token de renovación guarda `revocado_en` para tolerar renovaciones simultáneas de dos pestañas (reuso en menos de 30 s no cierra las demás sesiones), y el login con Microsoft valida `state`. Pendiente de la fase: probar el login real con Microsoft una vez desplegado (necesita la URI de Azure ya registrada) y correr el importador contra las bases reales cuando se decida. **No está desplegado** y aún no hay código en el repositorio remoto (falta el push).

### Fase 2 — Landing con login y administración
- Pantallas de la sección 3.7 y cliente de la API.
- **Verificar:** en el navegador, en escritorio y móvil: login con ambos métodos, cambio obligatorio de contraseña, tarjetas filtradas según acceso, alta de usuario y de equipo, asignación de accesos, cierre de sesión.

**Avance (2026-11-20):** construido en `gateway/src/` y verificado en el navegador contra el servicio local (escritorio y móvil): `/login` (Microsoft y correo con contraseña, errores de Microsoft), `/cambiar-password` obligatorio con temporal, portal con tarjetas filtradas por acceso y menú de usuario, y `/admin` (personas, equipos, matriz de accesos y auditoría). Comprobado de punta a punta: crear persona con temporal, forzar cambio, dar acceso por equipo y directo, y que la persona solo ve sus apps y no entra a `/admin`.

- **Interruptor de despliegue `VITE_PORTAL_AUTH`:** sin `true` en el build el portal funciona exactamente como antes (sin sesión y con todas las tarjetas). Así este código se puede publicar sin que el portal dependa de un servicio que aún no existe. Se enciende en la fase 3.
- `slug` agregado a cada app en `gateway/src/apps.js` (el `id` de Comercial sigue siendo `comerciales`; su `slug` es `comercial`).
- Pendiente para la fase 3: build-arg `VITE_PORTAL_AUTH=true` en el Dockerfile del gateway, bloque `/portal/` en nginx, respaldo de SPA para `/login`, `/admin` y `/cambiar-password`, y la variable `PORTAL_AUTH_UPSTREAM`.
- Pendiente de verificar: el login real con Microsoft (requiere despliegue).

### Fase 3 — Gateway
- Ruta `/portal/api/`, respaldo de SPA, variable `PORTAL_AUTH_UPSTREAM`, README actualizado. `auth_request` preparado pero apagado.
- **Verificar:** build del contenedor en local con `docker compose`, rutas de las apps sin cambios, `/login` carga al refrescar la página.

**Avance (2026-11-20):** código listo en el repositorio: bloque `/portal/` y respaldo de SPA en `gateway/nginx.conf.template`, build-arg `VITE_PORTAL_AUTH` en `gateway/Dockerfile`, y pasos de despliegue en el README. La variable `PORTAL_AUTH_UPSTREAM` ya está cargada en el recurso Gateway de Coolify (apunta al dominio de Portal Auth). `docker-compose.yml` no se tocó: ya estaba desactualizado respecto al `proxy_pass https://` y no lleva las variables de las demás apps. nginx validado con la imagen oficial `nginx:1.27-alpine` (`nginx -t` correcto y rutas probadas: `/login`, `/cambiar-password` y `/admin/*` sirven la landing; `/loginx`, `/administrador` y archivos inexistentes dan 404; cabeceras de seguridad presentes). El proxy `/portal/` no se pudo probar contra el servicio real porque aún no está desplegado. **Desplegado (2026-11-20, commit `2236c87`):** Coolify desplegó solo al recibir el push (Gateway y Portal Auth a la vez). Verificado en producción con el login apagado: Portal Auth sano (`/health` 200, JWKS con la llave real `k1-2026-11` y sin la privada); por `portal.aed-it.com` responden `/portal/api/.well-known/jwks.json` y `/portal/health`, `/portal/api/me` sin sesión da 401, `/login`, `/admin` y `/cambiar-password` sirven la landing, `/loginx` da 404, y las cinco apps siguen respondiendo su `/health`.
Pendiente: probar el login con Microsoft real (se puede ya, entrando a `/portal/api/auth/azure/login?next=%2F` y revisando `/portal/api/me`), importar las personas actuales y encender `VITE_PORTAL_AUTH=true`.
- **Simulacro del importador en producción (2026-11-20):** 776 personas distintas, de las cuales 702 vienen de RR.HH. y casi todas con correo personal (698 sin dominio corporativo). Eso haría inviable dar contraseñas temporales una por una, así que **RR.HH. queda fuera del importador** hasta la fase 5, donde se decidirá una estrategia para esas ~700 personas (p. ej. conservar su contraseña copiando el hash o entrega masiva). Las otras 5 apps (Solicitudes, Cartera, Bases, Comercial y SIGER) sí se importan. Los dominios del grupo (`baiakristal.com`, `aedcomercial.com`, `olivcartagena.com`, `matimbaclub.com`, `estrategiascomerciales.co`) se dejan como no corporativos (contraseña) hasta confirmar si tienen cuenta Microsoft en el tenant. El importador ahora rechaza y lista los correos con formato inválido.
- **Login encendido en producción (2026-11-20):** variable de compilación `VITE_PORTAL_AUTH=true` en el recurso Gateway de Coolify y redeploy forzado. Verificado en un navegador sin sesión: `portal.aed-it.com/` redirige a `/login?next=%2F` con el botón de Microsoft; el portal, `/portal/health` y los `/health` de las cinco apps responden 200. Para apagarlo: quitar esa variable y redeployar. RR.HH. sigue con su login propio (nadie tiene acceso `hrsm` en el portal todavía).
- **Importación aplicada (2026-11-20):** `--aplicar` creó 77 personas (Solicitudes, Cartera, Bases, Comercial y SIGER; RR.HH. aún fuera) con sus accesos directos. Las variables `IMPORT_DB_*` se quitaron de Portal Auth y se reinició. Pendiente de verificar en `/admin`: total de personas (78) y accesos (el pegado del resultado se cortó antes del número de accesos). Pendientes: contraseñas temporales para 7 personas con dominio no corporativo.
- **Importador en producción:** la base de Portal Auth no es pública (a propósito), así que `--aplicar` no se puede correr desde un equipo externo: hay que correrlo dentro del contenedor de Portal Auth (Terminal de Coolify, `node scripts/importarUsuarios.js`), con las variables `IMPORT_DB_*` cargadas temporalmente en ese recurso. `scripts/` sí va en la imagen (el `.dockerignore` no lo excluye).

### Fase 4 — Módulo `portalAuth` y piloto
- Escribir el módulo, probarlo y aplicarlo primero a **SIGER** (ya usa Microsoft y vincula por correo), en `optional` y luego `required`. Después **Solicitudes**.
- **Verificar:** entrar al portal y abrir la app sin pedir login; persona sin acceso rechazada; persona desactivada pierde acceso en menos de 1 hora; con `PORTAL_AUTH=off` vuelve el login anterior.

**Avance (2026-11-20):** módulo de verificación `auth/cliente/portalAuth.js` (fuente única; se copia idéntico a cada app) con 11 pruebas, e integrado en **SIGER** (repositorio `5. SIGER`, antes `9. SIGER`, commit `db6ad85`): `requireAuth` acepta la sesión del portal según `PORTAL_AUTH=off|optional|required`, `GET /api/auth/modo` informa el modo al frontend, el login propio responde 410 en `required`, y el frontend renueva y cierra sesión en el portal, ofrece "Entrar con el portal AED" en `optional`, y explica el caso "acceso en el portal pero sin usuario en SIGER".
- **Probado en local** contra el servicio real del portal y una base de SIGER propia: en `required` solo vale el portal (sin cookie 401, sin usuario SIGER 403, sin acceso en el portal 403, cookie manipulada 401, login propio 410); `optional` acepta ambos y una persona sin acceso en el portal sigue con su sesión propia; `off` ignora el portal. En el navegador: entrada a SIGER con la sesión del portal sin pasar por su login, y pantalla explicativa para quien no tiene usuario en SIGER.
- **No probado en local:** el cierre de sesión del portal desde SIGER y la redirección a `/login` del portal (solo existen detrás del gateway), ni el flujo real en producción. Se verifican tras desplegar en `optional`.
- **Decisiones:** la persona se busca por correo (`email` o `microsoft_email`) y los roles siguen siendo los de SIGER; un valor inválido de `PORTAL_AUTH` cae a `off`; en `required` abierto por el dominio directo de SIGER se muestra un aviso en vez de redirigir (evita un bucle).
- **SIGER desplegado en producción (2026-11-20):** primero en `optional` (modo, `/health`, 401 sin sesión y login propio activo verificados), luego en **`required`** (commit `0b10ed6`, con registro del motivo de cada sesión rechazada y freno contra bucles). Verificado: `/api/auth/modo` = `required`, login propio y refresh de SIGER responden 410, sin sesión 401, y abrir `portal.aed-it.com/siger/` sin sesión redirige a `portal.aed-it.com/login?next=%2Fsiger%2F`. Durante el reinicio, por unos 40 s respondieron a la vez el contenedor viejo y el nuevo (modos mezclados y un 504); luego se estabilizó. Reversa: `PORTAL_AUTH=optional` en Coolify y reiniciar.
- **Ajuste tras la primera prueba real (2026-11-20):** el freno contra bucles de SIGER (basado en el tiempo) mostraba "No pudimos validar tu sesión" aunque no hubiera bucle, solo por volver a `/siger` a los pocos segundos de la redirección. Se reemplazó (commit `ca73411`): ahora SIGER pregunta al portal (`/portal/api/me`) si hay sesión; sin sesión redirige siempre al login del portal sin mensajes, y solo si el portal la reconoce pero SIGER no, explica el motivo (redirigir ahí sí daría vueltas). Probado en local con una réplica del gateway (portal + servicio + SIGER bajo un dominio): sin sesión, `/siger/`, `/siger/` repetido y `/siger/login` van al login del portal; el login devuelve a SIGER; cerrar sesión en SIGER cierra también el portal; y con la llave del portal inalcanzable se muestra el mensaje y el log registra el motivo.
- **Pendiente de la prueba positiva con persona real:** entrar con Microsoft desde ese login y volver a SIGER sin su login propio, y el cierre de sesión desde SIGER.
- **Pendiente:** desplegar SIGER en `optional` (variable `PORTAL_AUTH=optional` en Coolify), verificar entrando por el portal, y pasar a `required`; después Solicitudes (copiando el mismo módulo).


**Solicitudes (2026-11-21):** migrada con el mismo módulo (repositorio `1. SOLICITUDES DE CONTRATACIÓN`, commit `f0c7265`): `PORTAL_AUTH`, `/api/auth/modo`, 410 en `required` para login, refresh y vincular/desvincular Microsoft, frontend con redirección al login del portal, pantalla de bloqueo, acceso "Portal AED" y perfil sin la sección de Microsoft en `required`. Probado en local contra el servicio real del portal con una base de Solicitudes propia: backend en los tres modos y, en el navegador con la réplica del gateway, sin sesión → login del portal con "Para abrir Solicitudes de Contratación", login → vuelve a Solicitudes, cerrar sesión → login del portal sin `next` y sesión del portal cerrada. Mejoras comunes: el login del portal indica a qué app se entra, las apps tienen acceso "Portal AED", y cerrar sesión termina en el login del portal sin volver a la app (SIGER `a6bedd0`). `PORTAL_AUTH=optional` ya cargado en Coolify; pendiente el push, verificar en producción y pasar a `required`.

**Solicitudes en producción (2026-11-21):** desplegada (`f0c7265`) en `optional` (modo, `/health`, 401 sin sesión y login propio activo verificados) y luego en **`required`**: `/api/auth/modo` = `required`, login propio 410 (12 consultas consecutivas consistentes tras el reinicio), sin sesión 401, y `portal.aed-it.com/solicitudes/` sin sesión redirige a `/login?next=%2Fsolicitudes%2F` con el texto "Para abrir Solicitudes de Contratación". SIGER y Cartera siguen respondiendo. Pendiente: prueba positiva con Microsoft de una persona con usuario en Solicitudes. Reversa: `PORTAL_AUTH=optional` y reiniciar.

### Fase 5 — Cartera, Recursos Humanos y Bases
- Mismo módulo; se elimina su login por contraseña (detrás del interruptor). Estas tres apps ganan login con Microsoft sin código propio.
- **Verificar:** igual que la fase 4, más que las contraseñas viejas dejen de funcionar solo al pasar a `required`.

**Cartera (2026-11-23):** migrada con el mismo módulo (repositorio `2. CARTERA`): `PORTAL_AUTH`, `/api/auth/modo`, 410 en `required` para login, refresh y cambio de contraseña, frontend con redirección al login del portal, pantalla de bloqueo, acceso "Portal AED" y "Entrar con el portal AED" en `optional`. Propio de Cartera: la persona se busca solo por `email` (no hay `microsoft_email`); quien entra por el portal no queda frenado por el cambio de contraseña pendiente de Cartera (`viaPortal`); la carga de la fiduciaria con `X-API-Key` no cambia.
- **Probado en local (backend):** la app real de Cartera (sin `server.js`, para no arrancar el programador ni el precalentado) contra su base en solo lectura y un JWKS de prueba, 29 comprobaciones: en `required` sin cookie 401, portal con acceso 200 (correo en mayúsculas incluido), sin acceso en el portal 403, sin usuario en Cartera 403, `cpw` 403, firma de otra llave 401, sesión propia válida 401, login/refresh/cambiar-password 410; `optional` acepta ambas y quien tiene sesión propia sigue aunque el portal no le dé la app; `off` y sin variable ignoran el portal; `fiducia/upload` sin credenciales 401.
- **Probado en el navegador** con el build bajo `/cartera/` y un gateway simulado (API y portal simulados, no el servicio real): sin sesión → `/login?next=%2Fcartera%2F`; con sesión → entra sin login propio; menú con "Portal AED"; cerrar sesión llama al logout del portal y termina en `/login` sin `next`; 403 → "No puedes entrar a Cartera"; portal con sesión pero Cartera 401 → "Cartera no pudo validar tu sesión" (sin bucle); `optional` muestra ambos ingresos; `off` solo el propio.
- **No probado:** contra el servicio real del portal ni en producción; el caso de una persona con cambio de contraseña pendiente (no hay ninguna en la base).
- **Pendiente:** push, `PORTAL_AUTH=optional` en Coolify, verificar en producción y pasar a `required`. Las pantallas de Accesos que crean o regeneran contraseñas quedan sin uso en `required` (se retiran en la fase 6).

**Bases Presupuestales (2026-11-23):** migrada con el mismo módulo (repositorio `4. BASES PRESUPUESTALES`), igual que Cartera: `PORTAL_AUTH`, `/api/v1/auth/modo`, 410 en `required` para login, refresh y cambio de contraseña, y el mismo frontend (aquí con axios). La persona se busca por `email`; el rol (uno por cuenta) y los permisos siguen siendo de Bases. Bases no frena en el backend por cambio de contraseña pendiente, así que no necesita `viaPortal`.
- **Probado en local (backend):** la app real contra su base en solo lectura y un JWKS de prueba, 29 comprobaciones en `required`, `optional` y `off`, todas bien (mismos casos que Cartera).
- **Probado en el navegador** con el build bajo `/bases/` y un gateway simulado (API y portal simulados): sin sesión → `/login?next=%2Fbases%2F`; con sesión → entra (probado en Metodología; el Inicio no cargó porque la API simulada no devuelve la forma real del tablero); menú con "Portal AED"; cerrar sesión llama al logout del portal y termina en `/login`; 403 → "No puedes entrar a Bases Presupuestales"; portal con sesión pero Bases 401 → "Bases no pudo validar tu sesión"; `optional` muestra ambos ingresos; `off` solo el propio.
- **No probado:** contra el servicio real del portal ni en producción.
- **Pendiente:** push, `PORTAL_AUTH=optional` en Coolify, verificar en producción y pasar a `required`.

**Cartera y Bases en producción en `optional` (2026-11-23):** desplegadas (Cartera `505913c`, Bases `7b52571`) y verificadas primero en `off` (modo, 401 sin sesión, login propio activo, pantallas de login sin cambios). Luego `PORTAL_AUTH=optional` por la API de Coolify (variable nueva en las apps `kmmnworr17hvzi537n45px7l` y `rwmrx9fo6ohlrh904ll4vuay`) y reinicio. Verificado en ambas: `/auth/modo` = `optional` estable, sin sesión 401, cookie `portal_session` inválida 401, login propio y refresh siguen activos (401 por credenciales, no 410), el login muestra "Entrar con el portal AED" y ese botón lleva a `portal.aed-it.com/login?next=%2Fcartera%2F` ("Para abrir Cartera") y `?next=%2Fbases%2F` ("Para abrir Bases Presupuestales"). SIGER y Solicitudes siguen en `required`. En el reinicio de Cartera respondieron a la vez el contenedor viejo y el nuevo durante unos 2 minutos (modos `off` y `optional` alternados); luego se estabilizó.
- **Prueba positiva con persona real (2026-11-23, administrador, sesión del portal iniciada por él):** `portal.aed-it.com/cartera/` y `/bases/` abren directo en el Inicio de cada app sin pasar por su login; `usuarios/me` responde 200 con el rol propio de cada app (Cartera `Administrador`, Bases `ADMIN`); el menú de usuario muestra "Portal AED" en ambas.
- **Cierre de sesión conjunto (2026-11-23):** "Cerrar sesión" desde Bases termina en `portal.aed-it.com/login` sin `next`; después `/portal/api/me`, `usuarios/me` de Bases y de Cartera responden 401, y abrir `/cartera/` muestra su login. No se probó el cierre iniciado desde Cartera (mismo código).
- **Cartera y Bases en `required` (2026-11-23):** variable cambiada por la API de Coolify y reinicio. Verificado en ambas: `/auth/modo` = `required` (12 consultas seguidas), login propio 410 (8 seguidas), refresh y cambiar-password 410, sin sesión 401, cookie `portal_session` inválida 401, logout 200, y abrir `/cartera/`, `/cartera/login` y `/bases/` sin sesión redirige a `portal.aed-it.com/login?next=…` con "Para abrir Cartera" / "Para abrir Bases Presupuestales". `fiducia/upload` de Cartera sigue evaluando la `X-API-Key` (llave inválida → "API key inválida"). SIGER y Solicitudes siguen en `required`. En el reinicio hubo ~35 s de modos mezclados y ~30 s de errores intermitentes en ambas; luego estable. En Coolify quedó además una copia de la variable para previews (`is_preview`) en `optional`: no afecta a producción.
- **Pendiente:** prueba positiva en `required` con persona real (se probó en `optional`, mismo camino de código) y confirmar la carga diaria de n8n con su llave real. Reversa: `PORTAL_AUTH=optional` y reiniciar. Antes de `required`, confirmar que las personas con dominio no corporativo que usan Cartera o Bases ya tienen su contraseña temporal del portal. Reversa: `PORTAL_AUTH=off` y reiniciar.

**Recursos Humanos (2026-11-24):** migrada con el mismo módulo (repositorio `3. SISTEMA DE GESTIÓN DE RECURSOS HUMANOS`, app `hrsm`): `PORTAL_AUTH`, `/api/auth/modo`, 410 en `required` para login, refresh y cambio de contraseña, `viaPortal` (no se exige el cambio de contraseña de RR.HH.), frontend igual que Cartera (redirección al login del portal, pantalla de bloqueo, "Portal AED", "Entrar con el portal AED" en `optional`).
- **Decisiones del usuario:** (1) las ~700 personas **conservan su contraseña**: el importador copia el hash bcrypt de RR.HH. (mismo formato que el portal) a quien no sea corporativo ni tenga ya contraseña en el portal (`--apps=hrsm`); (2) **RR.HH. da de alta a su gente sola**: API de servicio nueva en el portal (`/api/servicio/:app`, llave `PORTAL_SERVICE_KEY_HRSM`; ver `auth/README.md`) que RR.HH. llama al crear empleado o cuenta (tras el commit, sin bloquear; Bitakora incluida), al cambiar correo o nombre, al activar/desactivar y en "Generar contraseña" (individual y masiva). El portal solo le deja tocar el acceso `hrsm` y los datos de personas que no son administradoras y no usan otras apps. Acción masiva "Sincronizar con el portal" para reintentar.
- **Probado en local:** portal 75 pruebas (6 nuevas de la API de servicio); importador con una base de RR.HH. simulada (conservan contraseña, temporales, corporativos sin contraseña, quien ya tenía contraseña en el portal la conserva, inactivos y correos inválidos omitidos, idempotente); RR.HH. real en proceso contra el portal local y su base de desarrollo (cuentas `ZTEST_` borradas al final): 15 comprobaciones en `required` y 14 en `optional` (alta al crear, temporal del portal que entra, 403 con cambio pendiente del portal, entrada con la sesión del portal, desactivar quita y activar devuelve el acceso, 403 sin acceso, masivo, negativa con quien usa otra app, 409 al editar contraseña local en `required`) y el alta tras el commit (no ocurre si la transacción se deshace).
- **No probado:** el frontend de RR.HH. en el navegador (mismo código que Cartera, compila), `PORTAL_AUTH=off` de punta a punta, ni nada en producción.
- **Pendiente para producción, en orden:** (1) push de la plataforma y de RR.HH.; (2) generar una llave larga y cargarla como `PORTAL_SERVICE_KEY_HRSM` en Portal Auth y como `PORTAL_SERVICE_KEY` en RR.HH. (Coolify); (3) correr `importarUsuarios.js --apps=hrsm` primero en simulacro y luego `--aplicar` dentro del contenedor de Portal Auth con `IMPORT_DB_HRSM` cargada temporalmente (la base del portal no es pública), y quitarla al terminar; (4) `PORTAL_AUTH=optional` en RR.HH., verificar; (5) `required`. Reversa: `PORTAL_AUTH=off` y reiniciar.
- **En producción (2026-11-24):** desplegados Portal Auth y RR.HH.; llave de servicio cargada por la API de Coolify en ambos (misma, 64 caracteres) y verificada (la API de servicio la acepta). Importación con `IMPORT_DB_HRSM` temporal (luego borrada, también su copia de previews): simulacro y `--aplicar` desde la Terminal de Portal Auth → **697 personas creadas, 699 accesos nuevos, 689 contraseñas copiadas** (solo 1 había fijado su propia contraseña; 688 nunca recibieron la suya y siguen pendientes de "Generar contraseña"). No se importó `zenentorrespolo9@gmail,com` (coma en vez de punto): corregir en RR.HH. y "Sincronizar con el portal". RR.HH. en **`optional`**: modo estable, sin sesión 401, cookie inválida 401, login propio activo (401 por credenciales, no 410), app 200. Prueba positiva con persona real (administrador) en `optional`: entra a RR.HH. desde el portal sin su login propio. **RR.HH. en `required` (2026-11-24):** `/auth/modo` = `required` (12 consultas seguidas), login propio 410 (8/8), refresh y cambiar-password 410, sin sesión 401, cookie inválida 401, app 200. Las cinco apps del portal quedan en `required`. Reversa: `PORTAL_AUTH=optional` en RR.HH. y reiniciar.

### Fase 6 — Comercial, Actas y cierre
- Comercial: decidir qué pasa con su login con HubSpot (hoy queda dentro de la app hasta resolverlo). Actas: mismo módulo; antes hay que volver a agregar `actas` al catálogo con una migración nueva (se quitó el 2026-11-23, migración `20261123000000-quitar-app-actas.js`) y al importador.
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
