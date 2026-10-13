# 12. Seguridad, perfiles de acceso y matriz de permisos

Fuente: `docs/api/pilot-contract.md` (secciones "Semántica observada" y "Seguridad HTTP y operación"), `docs/ARCHITECTURE.md` ("Identidad y autorización" y "Límites importantes"), `backend/src/http/router.ts`, `backend/src/controllers/*.controller.ts`, `backend/src/services/auth.service.ts`, `backend/src/repositories/orders.repository.ts`, `field-app/src/adapters/browser/session-persistence.ts`, `docs/entrega-sepsa/05-diccionario-datos.md`, `docs/entrega-sepsa/10-plan-pruebas.md`, `docs/entrega-sepsa/11-resultados-pruebas.md`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Las fuentes activas mandan; si este documento y una fuente difieren, se corrige este documento (decisión D021 en `docs/DECISIONS.md`).

Este documento describe las medidas de seguridad que el piloto implementa hoy, quién puede hacer qué, y qué queda pendiente. No es una certificación: la integración oficial con SEPSA, la topología de despliegue y varias políticas siguen sin definir. Cada pendiente aparece marcado como `TODO: VALIDAR CON SEPSA` y tiene entrada en [14-pendientes-sepsa.md](14-pendientes-sepsa.md).

## 1. Medidas de seguridad implementadas

| Medida | Qué hace | Fuente | Prueba que la verifica |
|---|---|---|---|
| Sesión solo en cookie `HttpOnly` | El secreto de sesión viaja en una cookie `HttpOnly`, nunca en el cuerpo JSON ni en el almacenamiento del navegador. La cookie usa `SameSite=Lax` y `Path=/`, y `Secure` con `COOKIE_SECURE=true` o `NODE_ENV=production`. | Contrato, "Semántica observada" (Autenticación) | `backend/test/application.test.ts`: "login returns HttpOnly cookie without exposing session token"; "production security configuration marks cookie Secure and enables HSTS" |
| Token de sesión guardado solo como huella | `sessions.token_hash` guarda la huella del token, nunca el token. | `05-diccionario-datos.md` (`sessions`) | `backend/test/auth.test.ts`: "opaque tokens are random and only their digest is persisted" |
| Contraseñas con scrypt | `users.password_hash` guarda un hash scrypt. Ninguna contraseña se guarda en texto plano. | `05-diccionario-datos.md` (`users`) | `backend/test/auth.test.ts`: "scrypt password hashes verify without storing the password" |
| Sesión revocable y vencible | Las sesiones vencidas, revocadas o de usuarios deshabilitados no autentican. El cierre de sesión revoca la sesión en el servidor. | Contrato, "Semántica observada" (Autenticación) | `backend/test/application.test.ts`: "expired, revoked, and disabled-user sessions fail cookie authentication"; "login cookie revokes current session at logout" |
| Duración de sesión de 7 días | `SESSION_TTL_SECONDS` vale 604800 en el despliegue y por defecto (D025). | `docs/DECISIONS.md` (D025); `backend/src/config.ts` | `backend/test/config.test.ts`: "sessions default to seven days" |
| Límite de intentos de login | Por defecto, 5 intentos en 60 segundos, agrupados por dirección del socket y nombre de usuario normalizado. Configurable con `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS` y `LOGIN_RATE_LIMIT_MAX_ENTRIES`. No confía en `X-Forwarded-For`. El estado vive en memoria de un proceso. | Contrato, "Seguridad HTTP y operación" | `backend/test/application.test.ts`: "login rate limit groups normalized username by socket without echoing username" |
| Origen de las escrituras | CORS refleja solo `CORS_ORIGIN` exacto. Los `POST` del flujo de cookie exigen ese `Origin`, y `Sec-Fetch-Site: cross-site` se rechaza. | Contrato, "Seguridad HTTP y operación" | `backend/test/application.test.ts`: "cookie writes require exact Origin and reject cross-site Fetch Metadata"; "HTTP responses carry request and security headers; CORS grants only configured origin" |
| Cabeceras de respuesta | `X-Request-Id` validado o generado; cabeceras de protección en todas las respuestas, incluidos errores; `Cache-Control: no-store`; HSTS solo con cookie segura. | Contrato, "Seguridad HTTP y operación" | `backend/test/application.test.ts` (cabeceras, arriba); `backend/test/http.test.ts`: "API responses explicitly prevent proxy and CDN caching" |
| Límite de tamaño del cuerpo | `HTTP_MAX_BODY_BYTES` limita el cuerpo JSON. | Contrato, "Seguridad HTTP y operación" (variables activas) | `backend/test/http.test.ts`: "JSON parser accepts object and enforces byte limit" |
| Credenciales bearer validadas | Un token bearer mal formado o corto se rechaza. Las sesiones bearer preexistentes se aceptan por compatibilidad; un login nuevo no emite bearer. | Contrato, "Seguridad HTTP y operación" | `backend/test/http.test.ts`: "bearer parser rejects malformed or short credentials" |
| Registros sin datos personales | Los registros JSON contienen evento, resultado, código o estado HTTP e ID de petición. Nunca cuerpos, credenciales, cookies, tokens, evidencia ni datos personales. | Contrato, "Seguridad HTTP y operación" | `backend/test/application.test.ts`: "security logger receives only allowlisted event fields" |
| Autorización de un solo uso | Cada autorización de corte o de reconexión es de un solo uso y queda ligada a operación, orden, técnico, dispositivo y versión. El consumo repetido con la misma operación es idempotente. | Contrato, "Semántica observada" (Autorización y Habilitación de reposición) | `backend/test/reconnection.test.ts`: "pilot reconnection habilitation and sync are bound, auditable, and idempotent". El consumo de corte requiere base de datos: `backend/test/cut-consume.integration.test.ts` no se ejecutó en F5 (ver `11-resultados-pruebas.md`) |
| Evidencia verificada en el servidor | El servidor recalcula la huella SHA-256 a partir de los bytes; el corte se acepta solo con evidencia verificada y ligada a la operación. | `05-diccionario-datos.md` (`evidence_assets.content_hash`); contrato, "Evidencia" | `backend/test/application.test.ts`: "verifies evidence bytes server-side and makes upload retry idempotent"; "acknowledges a cut only after pilot evidence verification" |
| Revisión humana sin confirmación automática | La revisión de una operación incierta exige rol ADMIN, versión esperada y motivo. Registra la revisión, no confirma el corte ni reenvía el POST. | Contrato, "Semántica observada" (Revisión) | `backend/test/application.test.ts`: "ADMIN review records uncertain operation with CAS and audit, never confirming it"; "technician, stale version, and blank reason cannot record ADMIN review" |
| Sesión y token fuera del almacenamiento del navegador | La aplicación de campo guarda en `localStorage` la identidad de la sesión, nunca el token. Recuerda el nombre de usuario, nunca la contraseña. | `field-app/src/adapters/browser/session-persistence.ts` (cabecera) | `field-app/src/adapters/browser/session-persistence.test.ts`: "keeps granted and active roles across reload without persisting bearer token"; "remembers username but never handles a password" |
| Dependencias sin vulnerabilidades conocidas en la instalación | `npm ci` reporta 0 vulnerabilidades en `backend/` y en `field-app/`. Esto no sustituye una auditoría de seguridad. | `11-resultados-pruebas.md`, sección 3 | Registros de la ejecución del 2026-10-13 |
| Archivo local confidencial | `backend/cookies2.txt` se trata como archivo local confidencial. Queda fuera de la entrega y del control de versiones; su contenido no se inspeccionó. | Contrato, "Seguridad HTTP y operación" (última viñeta) | No aplica |

## 2. Matriz de permisos

La matriz tiene una fila por cada par método y ruta de `backend/src/http/router.ts`: 24 en total. Tres son públicas (`/healthz`, login y logout) y 21 exigen sesión.

El rol que cuenta es el **rol activo de la sesión** (`sessions.active_role`). Un usuario sin sesión válida recibe `401 UNAUTHENTICATED`. Una petición con sesión y rol distinto recibe `403 FORBIDDEN` desde `requireRole` (`backend/src/shared/request-validation.ts`). Algunas rutas añaden un control de alcance: si el `technician_id` del cuerpo no coincide con el técnico de la sesión, responden `403 TECHNICIAN_SCOPE`.

| # | Método y ruta | Acceso | Rol requerido | Comprobación en el código | Control adicional |
|---|---|---|---|---|---|
| 1 | `GET /healthz` | Pública | Ninguno | `backend/src/http/router.ts` | Responde 200 con base disponible y 503 sin ella (`backend/src/http/application.ts:102`) |
| 2 | `POST /v1/auth/login` | Pública | Ninguno; exige credenciales | `backend/src/controllers/auth.controller.ts:28` | Límite de intentos por socket y usuario |
| 3 | `POST /v1/auth/logout` | Pública | Ninguno; revoca la sesión de la cookie | `backend/src/controllers/auth.controller.ts:47` | Responde 204 y borra la cookie |
| 4 | `GET /v1/auth/session` | Sesión | Cualquier rol activo | `backend/src/controllers/auth.controller.ts:61` | Devuelve la sesión del servidor |
| 5 | `POST /v1/auth/role` | Sesión | Cualquiera; el cambio exige el grant del rol pedido | `backend/src/controllers/auth.controller.ts:65`; `backend/src/services/auth.service.ts:69` (la actualización exige el grant en SQL) | Sin grant: `403 ROLE_NOT_GRANTED`. Audita `SWITCH_ROLE` |
| 6 | `GET /v1/technicians` | Sesión | ADMIN | `backend/src/controllers/orders.controller.ts:29` | Lista de técnicos con grant `TECHNICIAN` |
| 7 | `GET /v1/debtors` | Sesión | ADMIN | `backend/src/controllers/debtors.controller.ts:21` | Filtros y paginación validados |
| 8 | `GET /v1/orders` | Sesión | ADMIN | `backend/src/controllers/orders.controller.ts:35` | Solo lectura |
| 9 | `POST /v1/orders/batch` | Sesión | ADMIN | `backend/src/controllers/orders.controller.ts:51` | Lote idempotente |
| 10 | `POST /v1/orders` | Sesión | ADMIN | `backend/src/controllers/orders.controller.ts:41` | Sin órdenes activas duplicadas (`RULES.md`) |
| 11 | `POST /v1/orders/:order_id/assignment` | Sesión | ADMIN | `backend/src/controllers/orders.controller.ts:64` | Exige `expected_version`; el técnico debe tener el grant `TECHNICIAN` (`backend/src/repositories/orders.repository.ts:73`) |
| 12 | `GET /v1/technician/orders` | Sesión | TECHNICIAN | `backend/src/controllers/orders.controller.ts:75` | Paquete ligado al técnico de la sesión y a `device_id` (contrato, "Paquete técnico") |
| 13 | `POST /v1/authorizations/cut` | Sesión | TECHNICIAN | `backend/src/controllers/authorizations.controller.ts:26` | Autorización ligada a operación, orden, técnico, dispositivo y versión |
| 14 | `POST /v1/authorizations/cut/consume` | Sesión | TECHNICIAN | `backend/src/controllers/authorizations.controller.ts:60` | `403 TECHNICIAN_SCOPE` si el técnico no coincide (línea 62) |
| 15 | `GET /v1/authorizations/cut/:operation_id` | Sesión | TECHNICIAN | `backend/src/controllers/authorizations.controller.ts:70` | Responde `not_found` si la operación no es del técnico; no incluye el token |
| 16 | `POST /v1/authorizations/reconnection` | Sesión | TECHNICIAN | `backend/src/controllers/authorizations.controller.ts:34` | Solo tras un corte confirmado de la orden |
| 17 | `POST /v1/authorizations/reconnection/consume` | Sesión | TECHNICIAN | `backend/src/controllers/authorizations.controller.ts:43` | `403 TECHNICIAN_SCOPE` (línea 45) |
| 18 | `GET /v1/authorizations/reconnection/:operation_id` | Sesión | TECHNICIAN | `backend/src/controllers/authorizations.controller.ts:53` | `not_found` si la operación no es del técnico; no incluye el token |
| 19 | `POST /v1/evidence/assets` | Sesión | TECHNICIAN | `backend/src/controllers/evidence.controller.ts:22` | `403 TECHNICIAN_SCOPE` (línea 28) |
| 20 | `POST /v1/sync/operations` | Sesión | TECHNICIAN | `backend/src/controllers/sync.controller.ts:29` | `403 TECHNICIAN_SCOPE` (línea 33); el técnico se fuerza al de la sesión |
| 21 | `POST /v1/sync/operations/:operation_id/review` | Sesión | ADMIN | `backend/src/controllers/sync.controller.ts:53` | Exige `expected_version` y motivo; no confirma ni reenvía |
| 22 | `GET /v1/sync/operations/:operation_id` | Sesión | TECHNICIAN o ADMIN | `backend/src/controllers/sync.controller.ts:46` | El técnico consulta solo sus operaciones (contrato, "Sync") |
| 23 | `GET /v1/audit` | Sesión | ADMIN | `backend/src/controllers/audit.controller.ts:22` | Solo lectura; paginada |
| 24 | `GET /v1/admin/reconciliation` | Sesión | ADMIN | `backend/src/controllers/audit.controller.ts:32` | Solo lectura (D024); no modifica datos |

Verificación: el número de filas (24) coincide con el de `router.ts`. Cada fila con rol requerido corresponde a un `requireRole` o a una comprobación explícita del controlador indicado.

## 3. Perfiles de acceso

### Perfil ADMIN

- Gestiona el piloto: busca morosos, crea y asigna órdenes (filas 6 a 11), consulta la lista de técnicos con grant TECHNICIAN (fila 6), consulta la auditoría (fila 23) y la conciliación en solo lectura (fila 24).
- Revisa operaciones inciertas con motivo y versión esperada (fila 21). No puede consumir autorizaciones ni habilitaciones de técnicos: todas las rutas de consumo (filas 14 y 17) exigen TECHNICIAN.
- Puede consultar el estado de una operación (fila 22), pero no ejecutar acciones de campo.

### Perfil TECHNICIAN

- Descarga su paquete de órdenes asignadas (fila 12), pide y consume autorizaciones de corte y reconexión (filas 13 a 18), sube evidencia (fila 19), envía operaciones (fila 20) y consulta sus propias operaciones (fila 22).
- Las consultas de técnico no devuelven datos de otros técnicos: según el contrato, una operación o autorización ajena responde `not_found` (filas 15, 18 y 22).

### Concesión de roles

- `users.role` guarda el rol inicial de la cuenta.
- `user_role_grants` guarda los roles concedidos. Una cuenta solo puede cambiar de rol si tiene concedidos ambos (ADMIN y TECHNICIAN).
- `sessions.active_role` guarda el rol activo de cada sesión. Cada petición verifica que el rol activo sigue concedido.
- `POST /v1/auth/role` cambia el rol activo, conserva la identidad y el dispositivo, y audita el cambio (`SWITCH_ROLE`). Si la auditoría falla, el cambio se revierte.
- Las fuentes son `docs/ARCHITECTURE.md` ("Identidad y autorización") y el contrato (fila "Autenticación").

Pruebas: `backend/test/role-switch.test.ts` ("dual-grant switch preserves session identity, audits roles and enforces active role"; "single-role accounts cannot switch even when client supplies forged grants"; "failed audit rolls back role change and leaves retry possible").

## 4. Pendientes de seguridad

Cada pendiente tiene entrada en [14-pendientes-sepsa.md](14-pendientes-sepsa.md). Ninguna de estas medidas está confirmada por SEPSA.

| Pendiente | Estado actual | Entrada en 14 |
|---|---|---|
| TLS | El despliegue debe terminar TLS antes de exponer el piloto. El backend no confía en cabeceras de proxy. | P-11, P-17 |
| Rotación de secretos de sesión y de base de datos | Debe hacerse fuera del frontend. No hay política documentada. | P-11, P-17 |
| Rate limit distribuido | El límite de login está en memoria de un proceso. Antes de tener réplicas se requiere un almacén compartido. | P-11 |
| Revocación de sesión por dispositivo | El esquema no liga la sesión a `device_id`. | P-12, P-13 |
| Límites de sesión por dispositivo e identidad de dispositivo | No definidos. | P-12 |
| Backups cifrados y prueba de restauración | El contrato pide definirlos; no están implementados ni documentados. | P-23 |
| Topología y `SameSite=Lax` | Con cookies `SameSite=Lax`, la API y el navegador deben estar en contexto same-site. El origen y la topología no están definidos. | P-11 |
| Proveedor de métricas y alertas | No definido. | P-11 |

## 5. Limitaciones

- El piloto no es la API oficial de SEPSA. Los permisos y los contratos pueden cambiar cuando SEPSA defina su integración.
- El límite de intentos de login se reinicia cuando el proceso se reinicia.
- Las pruebas de seguridad que dependen de la base de datos (consumo de corte, auditoría en PostgreSQL) no se ejecutaron en la fase de resultados. Su estado está en [11-resultados-pruebas.md](11-resultados-pruebas.md).
