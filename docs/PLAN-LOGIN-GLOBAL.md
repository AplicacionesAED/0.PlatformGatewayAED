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
| `apps` | id, `slug` (`cartera`, `siger`, `solicitudes`, `hrsm`, `bases`, `comercial`, `actas`; el `id` de la landing para Comercial hoy es `comerciales` y habrá que alinearlo), nombre, `activa` |
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
- **Importador en producción:** la base de Portal Auth no es pública (a propósito), así que `--aplicar` no se puede correr desde un equipo externo: hay que correrlo dentro del contenedor de Portal Auth. Además `scripts/` está excluido de la imagen por `.dockerignore`.

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
