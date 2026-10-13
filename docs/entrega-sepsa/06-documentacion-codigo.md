# Documentación del código fuente

Fuente: `docs/ARCHITECTURE.md` (Mapa del código), `backend/src/http/router.ts`, `backend/openapi/pilot-provisional.openapi.json`, `backend/src/controllers/`, `field-app/src/`, `backend/test/architecture.test.ts`, `backend/test/router.test.ts`, `field-app/src/architecture.test.ts`, `docs/DECISIONS.md` (D010, D016, D022, D023, D024).
Fecha: 2026-10-12
Estado: entrega, copia fechada. Describe el código de `main` al 2026-10-12. Si el código cambia, esta entrega se actualiza en la misma tarea.

Los términos técnicos están en el [glosario](05-diccionario-datos.md#glosario-de-términos-y-estados). Los nombres de archivos, funciones y rutas se muestran tal como aparecen en el código.

## 1. Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| `field-app/` | Aplicación de campo y administración (React, TypeScript, Vite) |
| `backend/` | Servidor de la API (Node.js, TypeScript, PostgreSQL) |
| `backend/sql/` | Migraciones SQL del esquema (`001` a `008`) y datos de prueba |
| `backend/migrations/` | Scripts de carga y de roles que se ejecutan al arrancar el servidor |
| `backend/openapi/` | Contrato HTTP provisional en formato OpenAPI |
| `docs/` | Documentación activa del proyecto |
| `docs/entrega-sepsa/` | Esta entrega |
| `.github/workflows/` | Integración continua (CI) |

## 2. Aplicación de campo y administración (`field-app/src/`)

| Carpeta | Responsabilidad | Archivo de entrada |
|---|---|---|
| `main.tsx`, `App.tsx`, `TechnicianRuntime.tsx`, `SimulatedApp.tsx` | Arranque, modo (conectado o simulado), sesión, jornada del técnico y pantalla según el rol | `App.tsx` |
| `domain/` | Tipos y reglas de negocio puras | `policies.ts`, `types.ts` |
| `ports/` | Contratos entre las acciones y los adaptadores | `repository.ts`, `authorization.ts`, `sync.ts` |
| `use-cases/` | Corte, reconexión, visita, sincronización, descarga y administración | `process.ts`, `sync.ts` |
| `adapters/indexeddb/` | Almacenamiento local durable y autoridad simulada | `repository.ts` |
| `adapters/http/` | Cliente del servidor del piloto | `client.ts` |
| `adapters/browser/`, `adapters/mock/` | Conectividad, sesión, Service Worker y adaptadores simulados | — |
| `state/` | Estado de la jornada del técnico (acciones, sincronización, mensajes) | `store.ts` |
| `bootstrap/` | Construcción de los componentes según el modo: conectado (`runtime.ts`) o simulado (`simulated-runtime.ts`) | `runtime.ts` |
| `screens/` | Pantallas de técnico (`FieldApp`), administrador (`OperationsApp`) y acceso (`LoginScreen`) | — |
| `components/`, `components/common/` | Componentes con lógica visible y componentes genéricos | `OrderDetail.tsx`, `CaptureForm.tsx` |
| `services/`, `utils/`, `styles/` | Servicios de navegador sin interfaz, funciones de presentación y hojas de estilo | `styles/app.css` |

Las reglas de dependencia entre carpetas se verifican en `field-app/src/architecture.test.ts`.

## 3. Servidor (`backend/src/`)

| Archivo o carpeta | Responsabilidad |
|---|---|
| `server.ts`, `config.ts`, `db.ts`, `types.ts` | Arranque, configuración, conexión a PostgreSQL y transacciones (`withTransaction`), y tipos de sesión |
| `http/` | Transporte: `application.ts` (identificador de petición, cabeceras, CORS, validación de origen, sesión y errores), `router.ts` (tabla de rutas), `responses.ts`, `http-policy.ts`, `cookies.ts`, `http-contracts.ts` |
| `controllers/` | Un archivo por módulo: `auth`, `orders`, `debtors`, `authorizations`, `evidence`, `sync`, `audit`. Solo HTTP: no ejecutan SQL |
| `services/` | Reglas de negocio y transacciones. Incluye `command-idempotency.service.ts`, `authorizations.service.ts`, `sync-apply.service.ts`, `sync-physical-operations.service.ts` y `evidence.service.ts` |
| `repositories/` | Solo SQL: `orders`, `debtors`, `users`, `authorizations`, `evidence`, `sync`, `audit`, `commands` y `reconciliation` |
| `mappers/` | Filas de la base convertidas en JSON de la API |
| `shared/` | Configuración de la aplicación, `auth-crypto.ts` (scrypt y tokens), `rate-limiter.ts`, paginación, validación de peticiones y huella JSON |
| `logging/` | `security-logger.ts`: eventos de seguridad sin cuerpos ni datos personales |

La regla de dependencia es `controllers → services → repositories → db`. Hay una excepción documentada: `debtors` y `audit` son consultas sin reglas de negocio, así que su controlador llama directamente al repositorio.

`backend/test/architecture.test.ts` verifica que ningún controlador contenga SQL, que los repositorios no importen HTTP ni `HttpError`, y que `src/application/` no exista.

## 4. Referencia de rutas de la API

La tabla de rutas `backend/src/http/router.ts` es la única fuente de rutas del servidor. Se compara con el contrato OpenAPI en `backend/test/router.test.ts`. Hay 24 rutas: 3 públicas y 21 con sesión.

| Método | Ruta | Acceso | Función del controlador | Qué hace |
|---|---|---|---|---|
| GET | `/healthz` | Pública | `health` | Indica que el servidor responde (`status: ok`). Lo usa el despliegue. |
| POST | `/v1/auth/login` | Pública | `auth.login` | Inicia sesión. La sesión viaja en cookie `HttpOnly`. Tiene límite de intentos por dirección y usuario. |
| POST | `/v1/auth/logout` | Pública | `auth.logout` | Revoca la sesión y borra la cookie. |
| GET | `/v1/auth/session` | Sesión | `auth.currentSession` | Devuelve la sesión y el rol activo. |
| POST | `/v1/auth/role` | Sesión | `auth.switchRole` | Cambia el rol activo entre los roles concedidos y lo registra en auditoría. |
| GET | `/v1/technicians` | Sesión | `orders.listTechnicians` | Lista los técnicos que tienen el rol `TECHNICIAN` concedido. |
| GET | `/v1/debtors` | Sesión | `debtors.listDebtors` | Busca morosos con filtros y paginación. |
| GET | `/v1/orders` | Sesión | `orders.listOrders` | Lista las órdenes. |
| POST | `/v1/orders` | Sesión | `orders.createOrder` | Crea una orden individual. |
| POST | `/v1/orders/batch` | Sesión | `orders.createOrdersBatch` | Crea órdenes en lote, de forma idempotente. |
| POST | `/v1/orders/{order_id}/assignment` | Sesión | `orders.assignOrder` | Asigna un técnico con la versión esperada. Si la versión no coincide, responde `409`. |
| GET | `/v1/technician/orders` | Sesión | `orders.technicianOrders` | Devuelve el paquete de órdenes asignadas al técnico de la sesión. |
| POST | `/v1/authorizations/cut` | Sesión | `authorizations.authorizeCut` | Reserva la autorización de corte. |
| POST | `/v1/authorizations/cut/consume` | Sesión | `authorizations.consumeCutAuthorization` | Consume la autorización al confirmar el corte (D020). |
| GET | `/v1/authorizations/cut/{operation_id}` | Sesión | `authorizations.lookupCutAuthorization` | Devuelve el estado de una autorización de corte para resolver un consumo incierto. |
| POST | `/v1/authorizations/reconnection` | Sesión | `authorizations.authorizeReconnection` | Reserva la habilitación de reconexión. |
| POST | `/v1/authorizations/reconnection/consume` | Sesión | `authorizations.consumeReconnectionEnablement` | Consume la habilitación de reconexión. Un replay del mismo `operationId` devuelve el mismo resultado. |
| GET | `/v1/authorizations/reconnection/{operation_id}` | Sesión | `authorizations.lookupReconnectionEnablement` | Devuelve el estado de la habilitación sin revelar el token. |
| POST | `/v1/evidence/assets` | Sesión | `evidence.uploadEvidence` | Recibe los bytes de una foto, recalcula su huella SHA-256 y la guarda verificada. |
| POST | `/v1/sync/operations` | Sesión | `sync.syncOperation` | Recibe una operación (`CUT`, `VISIT` o `RECONNECTION`) desde el dispositivo. |
| GET | `/v1/sync/operations/{operation_id}` | Sesión | `sync.lookupOperation` | Consulta el estado de una operación. El técnico ve solo las suyas; el administrador puede ver todas. |
| POST | `/v1/sync/operations/{operation_id}/review` | Sesión (solo ADMIN) | `sync.recordHumanReview` | Registra la revisión humana de una operación incierta (RF-32). No confirma ni reenvía. |
| GET | `/v1/audit` | Sesión (solo ADMIN) | `audit.listAudit` | Lista eventos de auditoría, con filtro opcional por orden. |
| GET | `/v1/admin/reconciliation` | Sesión (solo ADMIN) | `audit.listReconciliation` | Lista las operaciones por conciliar, en solo lectura (D024, RF-37). |

Verificación de esta tabla: las 24 rutas coinciden con `router.ts` y con el OpenAPI, sin diferencias en ninguno de los dos sentidos.

Los permisos de cada ruta por rol se resumen en `12-seguridad-perfiles-acceso.md` (pendiente, F6).

## 5. Recorrido de una orden de punta a punta

1. **El administrador busca morosos.** `screens/OperationsApp.tsx` → `refresh()` → `HttpPilotClient.findDebtors` → `GET /v1/debtors` → `controllers/debtors.controller.ts` `listDebtors` → `repositories/debtors.repository.ts`.
2. **El administrador crea y asigna.** `screens/OperationsApp.tsx` `confirmOrderCreation()` (diálogos en `components/AdminOrderModals.tsx`) → `POST /v1/orders` y `POST /v1/orders/{id}/assignment` → `controllers/orders.controller.ts` → `services/orders.service.ts` (idempotencia en `services/command-idempotency.service.ts`, SQL en `repositories/orders.repository.ts`).
3. **El técnico descarga su jornada.** `TechnicianRuntime.tsx` → `loadPackage()` → `use-cases/download.ts` `downloadAssigned` → `GET /v1/technician/orders` → `services/orders.service.ts` `buildWorkPackage`. Se guarda con `IndexedDbLocalRepository.savePackage`.
4. **El técnico captura el corte.** `components/OrderDetail.tsx` → `components/CaptureForm.tsx` → `state/store-actions.ts` `executeCut` → `state/evidence.ts` `prepareEvidence`.
5. **Autorización en línea y guardado local.** `use-cases/process.ts` `executeCut` → `POST /v1/authorizations/cut` → `services/authorizations.service.ts` `authorizeCut`. Después, `IndexedDbLocalRepository.claimCut` guarda la operación, la orden y la cola en una misma transacción.
6. **Sincronización.** `state/store-sync.ts` `requestSync` → `use-cases/sync.ts` `SyncEngine.syncOnce` → subida de fotos (`POST /v1/evidence/assets` → `services/evidence.service.ts`) → `POST /v1/sync/operations` → `services/sync.service.ts` → `services/sync-apply.service.ts` → `services/sync-physical-operations.service.ts`, que consume la autorización y confirma la orden.
7. **Auditoría.** Cada cambio del servidor inserta su evento en la misma transacción (`repositories/audit.repository.ts` `insertAudit`). El administrador lo consulta con `GET /v1/audit`.

En el modo simulado, los pasos remotos los resuelve `adapters/indexeddb/authority-repository.ts`.

## 6. Convenciones del código

| Convención | Dónde se verifica | Estado |
|---|---|---|
| Cada archivo empieza con un comentario que dice qué hace y qué no hace | Revisión de cabeceras, sin archivos de prueba: el servidor tiene 48 de 48 archivos con cabecera; la aplicación tiene 83 de 88 | Ver discrepancias (sección 7) |
| Los invariantes críticos se comentan junto al código que los aplica: autorización de un solo uso, arrendamientos (leases) de la cola, fase de envío del corte (`cutSendPhase`), idempotencia | Búsqueda en `field-app/src` y `backend/src` | Vigente |
| Las reglas de dependencia entre carpetas se prueban | `field-app/src/architecture.test.ts`, `backend/test/architecture.test.ts` | Vigente |
| La tabla de rutas coincide con el contrato OpenAPI | `backend/test/router.test.ts` | Vigente |
| Códigos de error en inglés; mensajes que ve el usuario, en español | D016 (`docs/DECISIONS.md`) | Vigente |
| Importes en centavos enteros | `docs/RULES.md` (Datos e integración) | Vigente |
| Un repositorio IndexedDB por puerto, sin dividirlo por tamaño | D014 (`docs/DECISIONS.md`) | Vigente |

## 7. Discrepancias entre la documentación y el código

- **Cabeceras de archivo.** `docs/ARCHITECTURE.md` decía que cada archivo empieza con un comentario. Desde el commit `bce5317` describe la excepción. En la aplicación, 5 de 88 archivos no tienen cabecera: `field-app/src/adapters/indexeddb/package-validation.ts`, `field-app/src/adapters/mock/connectivity.ts`, `field-app/src/adapters/mock/transport.ts`, `field-app/src/ports/connectivity.ts` y `field-app/src/ports/identity.ts`. El servidor cumple en sus 48 archivos. No se corrigió el código; queda para decidir.
- **Modo simulado.** `docs/ARCHITECTURE.md` describe el modo simulado como disponible sin condiciones. D023 lo limita a desarrollo o a `VITE_ENABLE_SIMULATION=true`. Esta entrega sigue D023 y el código.

## 8. Pendientes

Este documento no tiene pendientes de SEPSA propios. Las reglas de negocio que implementa el código y que no están confirmadas aparecen en [01-requisitos-funcionales-tecnicos.md](01-requisitos-funcionales-tecnicos.md) y en [14-pendientes-sepsa.md](14-pendientes-sepsa.md).
