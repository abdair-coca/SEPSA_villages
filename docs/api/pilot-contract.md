# Contrato HTTP provisional del piloto

El OpenAPI describe lo que `backend/src/http/router.ts` (tabla de rutas) expone hoy. Es `PROVISIONAL`, `NO OFICIAL` y `PILOT_PROVISIONAL`; no está aprobado por SEPSA. Los clientes deben tratarlo como línea base de integración, no como garantía de compatibilidad oficial.

## Revisión rápida

1. Revisar [`pilot-provisional.openapi.json`](../../backend/openapi/pilot-provisional.openapi.json) para rutas, payloads, respuestas, roles y errores.
2. Revisar [`fixtures/pilot-contract.json`](../../backend/test/fixtures/pilot-contract.json) para muestras sintéticas sin credenciales ni tokens.
3. Ejecutar `npm test` desde `backend/` para validar schemas y respuestas de HTTP real contra `Application`.

## Semántica observada

| Área | Estado en el piloto |
|---|---|
| Autenticación | Login devuelve identidad, grants de rol, sesión y expiración; el secreto de sesión solo viaja en cookie `HttpOnly`, nunca JSON/localStorage. `GET /v1/auth/session` recupera el rol activo y `POST /v1/auth/role` lo cambia solo entre roles otorgados, conservando identidad y cookie. Cookie usa `SameSite=Lax`, `Path=/`, `Secure` con `COOKIE_SECURE=true` o `NODE_ENV=production`. Logout revoca la sesión y borra cookie (`204`). |
| Órdenes | El propósito sigue siendo `CUT`; el estado operativo puede avanzar a `RECONEXIÓN` al sincronizar la reposición. Creación responde `201`. Asignación requiere `expected_version`; conflicto responde `409`. |
| Paquete técnico | Se liga al técnico de sesión y `device_id`. `authenticity`, `integrity`, checksum y versión son valores del piloto; no implican firma oficial. |
| Registro del técnico | `GET /v1/technician/record` es solo `TECHNICIAN`: devuelve sus operaciones sincronizadas (`CUT`, `VISIT`, `RECONNECTION`) más recientes primero, con captura, evidencias y estado de confirmación. Filtro opcional `order_id` UUID; paginación por `limit`/`offset` o `cursor`. Lista blanca de campos: nunca sale `authorization_token`. Cada consulta se audita como `TECHNICIAN_RECORD_READ` con el alcance y el número de filas, sin datos del registro. Desde otro dispositivo, el registro es el que llegó al servidor; lo pendiente solo en un dispositivo no aparece. |
| Foto del registro | `GET /v1/evidence/assets/{evidence_id}` es solo `TECHNICIAN`: devuelve su propia foto en base64 con su hash guardado. Una foto ajena o inexistente responde `404 EVIDENCE_NOT_FOUND`. El cliente recalcula el SHA-256 y no muestra una foto que no coincida (`REMOTE_EVIDENCE_HASH_MISMATCH`). Cada lectura se audita como `TECHNICIAN_EVIDENCE_READ`. |
| Autorización | `POST /v1/authorizations/cut` reserva autorización. El token queda ligado a operación, orden, técnico, dispositivo y versión. `POST /v1/authorizations/cut/consume` la consume al confirmar el corte (`consumed` o `not_authorized`; replay de la misma operación → `consumed`) y `GET /v1/authorizations/cut/{operation_id}` devuelve `reserved`, `consumed`, `expired`, `rejected`, `not_found` o `unknown`. El sync de un CUT acepta una autorización ya consumida por esa operación aunque haya vencido; una reserva sin consumir se consume en la transacción de sync solo si sigue vigente ([D020](../DECISIONS.md)). |
| Habilitación de reposición | `POST /v1/authorizations/reconnection` reserva una habilitación de un solo uso para la orden/ciclo CUT ya confirmado; `/consume` consume la misma habilitación y permite replay idéntico con el mismo `operation_id`. Una nueva solicitud puede reemplazar una reserva aún no consumida; una habilitación consumida bloquea otro ciclo para esa orden. `GET /v1/authorizations/reconnection/{operation_id}` devuelve el estado sin revelar el token. Rutas `PILOT_PROVISIONAL`, no oficiales de SEPSA. |
| Sync | Acepta `CUT`, `VISIT` y `RECONNECTION`. Una reposición requiere habilitación consumida, `effective_at`, snapshot histórico del técnico y `demora`; el token de habilitación no se reenvía en sync. ACK/lookup incluyen esos datos físicos. Lookup devuelve `confirmed` solo si payload almacenado contiene recibo íntegro; legacy incompleto devuelve `unknown`. TECHNICIAN consulta solo sus operaciones; ADMIN puede consultar. Replay idéntico del mismo `operation_id` no vuelve a incrementar la versión; payload distinto o conflicto responde `409`. |
| Revisión | `POST /v1/sync/operations/{operation_id}/review` es solo ADMIN: exige identidad, `expected_version` y motivo. Cuando el lookup remoto no confirma la operación, registra `HUMAN_REVIEW_RECORDED`, conserva `PHYSICAL_UNKNOWN` y devuelve la nueva versión (`expected_version + 1`); no confirma ni reenvía. Ver [semántica de sincronización y revisión](../features/synchronization.md). |
| Estado de la consulta | `GET /v1/authorizations/cut/{operation_id}` y `GET /v1/authorizations/reconnection/{operation_id}` devuelven `status`: `not_found` (no existe o no es del técnico), `reserved`, `consumed`, `expired`, `rejected` o `unknown`. `rejected` significa que la reserva fue rechazada y no se consumió. `unknown` no es concluyente. La respuesta no incluye el token. |
| Nueva autorización (D022) | Tras una consulta con `expired`, `rejected` o `not_found`, el cliente pide una autorización nueva después de confirmarlo con el técnico, con el mismo `operationId` cerrado y una operación nueva. No hay endpoint adicional. Un corte cuyo envío ya empezó no se cierra así. |
| Conciliación (D024) | `GET /v1/admin/reconciliation` es solo `ADMIN`. Lista en solo lectura `SYNC_CONFLICT`, `CONSUMED_NOT_SYNCED` y `CLOSED_NOT_CONSUMED`, calculadas con las tablas existentes. No modifica datos. La revisión de `/review` no tiene interfaz en el piloto. |
| Auditoría | Solo `ADMIN`; opcional `order_id` UUID; límite observado: 1000 eventos. Campos dinámicos `transition` y `metadata` reflejan el registro actual. |

## Seguridad HTTP y operación

- CORS refleja solo `CORS_ORIGIN` exacto. Preflight de otro origen falla sin cabeceras CORS. Solicitudes POST del flujo de cookie requieren ese `Origin`; `Sec-Fetch-Site: cross-site` se rechaza. Los GET no cambian datos de negocio; la excepción es la auditoría de la consulta del registro del técnico (`TECHNICIAN_RECORD_READ`).
- El servidor conserva compatibilidad con sesiones bearer preexistentes; login nuevo no emite bearer y el cliente web no los envía.
- El backend agrega `X-Request-Id` validado/generado y cabeceras de protección en respuestas HTTP, incluso errores y OPTIONS. HSTS aparece solo con cookie segura configurada/producción. Respuestas mantienen `no-store`.
- Login limita por dirección del socket y nombre de usuario normalizado; default 5 intentos por 60 segundos, configurable con `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS` y `LOGIN_RATE_LIMIT_MAX_ENTRIES`. No confía en `X-Forwarded-For`. Estado vive en memoria de un proceso; antes de réplicas se requiere store compartido.
- `SameSite=Lax` requiere que navegador y API queden en contexto same-site para enviar la cookie en `fetch`; origen, host y topología de despliegue aún deben definirse.
- Logs JSON registran solo evento, resultado, código/estado HTTP y request ID; nunca cuerpos, credenciales, cookies, tokens, evidencia ni datos personales. Eventos contables cubren login, autorización, sync/conflicto, evidencia y rechazos HTTP. Provider externo, umbrales y alertas quedan pendientes hasta definir topología.
- No hay revocación de sesión por dispositivo: esquema no liga sesión a `device_id`. Identidad de dispositivo y contrato de revocación: `TODO: VALIDAR CON SEPSA`.
- Variables activas incluyen `CORS_ORIGIN`, `COOKIE_SECURE`, `NODE_ENV`, `SESSION_TTL_SECONDS`, `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `LOGIN_RATE_LIMIT_MAX_ENTRIES`, `DATABASE_URL` y `HTTP_MAX_BODY_BYTES`. Despliegue debe terminar TLS antes de exponer el piloto; backend no confía en headers de proxy. Proteger y rotar secretos de sesión/DB fuera del frontend, y definir backups cifrados y prueba de restauración. Provider, dominio, topología, almacenamiento de secretos y política operativa siguen sin definir.
- `backend/cookies2.txt` se trata como archivo local confidencial y queda fuera de entrega/control de versiones; contenido no inspeccionado ni modificado en esta fase.

## Evidencia

`POST /v1/evidence/assets` acepta metadata de binding, MIME, SHA-256 declarado y bytes base64. Backend recomputa el hash, guarda bytes como asset `verified` y hace replay idempotente para mismo ID, contenido y binding; ID reutilizado con otros datos devuelve `EVIDENCE_BINDING_CONFLICT`. `POST /v1/sync/operations` acepta CUT con foto solo si todas las referencias ya están verificadas para esa orden, operación, técnico y dispositivo, comprobado dentro de la transacción de consumo de autorización. Excepción controlada sin foto continúa auditable. Límite de bytes del piloto se configura con `HTTP_MAX_BODY_BYTES` (default 12 MB; el despliegue usa 2 MB y la app envía fotos de ≤ 1 MB, ver [D018](../DECISIONS.md)). Todo este contrato es `PILOT_PROVISIONAL`; almacenamiento oficial, MIME/tamaño, retención y excepciones: `TODO: VALIDAR CON SEPSA`.

Una RECONNECTION también puede transmitir referencias de evidencia verificadas o la excepción de foto controlada ya usada en el flujo de campo. Habilitación, snapshot de nombre, transición a `RECONEXIÓN` y recibos son semántica del piloto únicamente.

## Límites de interpretación

- Schemas JSON describen la forma válida del cliente y casos observados. El parser actual valida campos requeridos y varios enums, pero tolera propiedades adicionales en algunos cuerpos; `additionalProperties: false` expresa payload canónico, no garantía de rechazo runtime de todo campo extra.
- Valores de catálogo, datos del Excel, significados de contexto y políticas oficiales siguen pendientes de validación.
- No hay contrato de API oficial ni semántica oficial de evidencia.
