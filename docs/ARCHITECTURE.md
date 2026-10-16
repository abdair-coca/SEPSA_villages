# Arquitectura actual

## CURRENT

```text
React/PWA
  ├─ dominio y políticas
  ├─ casos de uso / store
  ├─ repositorios IndexedDB
  └─ adaptadores local, simulado y HTTP
          │
          ▼
Backend piloto REST
  └─ autenticación, órdenes, autorización, sync y auditoría
          │
          ▼
PostgreSQL
```

## Frontend

`field-app/` contiene una aplicación React + TypeScript. El código se organiza por tipo: `src/domain` define entidades y políticas; `src/ports` define interfaces; `src/use-cases` contiene casos de uso; `src/adapters` conecta IndexedDB, navegador, simulación y HTTP; `src/state` compone el estado de la jornada; `src/bootstrap` construye los stores según el modo; `src/services` agrupa servicios de navegador sin UI; `src/screens` contiene las pantallas de administración, campo y login; `src/components` los componentes (genéricos en `src/components/common`); `src/utils` funciones puras de presentación y `src/styles` las hojas de estilo. Las reglas de dependencias las comprueba `field-app/src/architecture.test.ts`.

### UI compartida

La interfaz visual cruza los roles mediante un shell común. `src/components/AppHeader.tsx` es el seam de presentación autenticado para Admin y Técnico: recibe identidad, título, descripción, contexto, un estado tipado y acciones como contenido. Renderiza la misma tarjeta superior responsive para ambos roles: marca por área, estado o entorno, avatar y menú de cuenta. El shell tiene una variante `standard`, usada por Inicio y por Admin, y una variante `minimal`, usada por las pantallas secundarias del Técnico; esta última muestra solo el top bar y deja el encabezado propio de cada pantalla en su contenido. El menú concentra nombre, rol, entorno cuando existe y cierre de sesión; no contiene reglas de autorización.

El estado del header conserva una separación explícita: Técnico muestra el estado real de conectividad (`positive`, `warning` o `negative`) que ya produce la jornada; Admin muestra el entorno de ejecución (`environment`) y no introduce una segunda lógica de conectividad. El nombre y rol no se duplican fuera del menú. En las pantallas secundarias del Técnico, las acciones de sincronización se presentan como acciones tipadas dentro del menú de cuenta; sus callbacks siguen perteneciendo a `FieldApp` y no se implementan reglas operativas en `AppHeader`. El top bar no es fijo ni sticky y el título de página permanece debajo con el texto propio de cada superficie.

`src/components/common/BrandLockup.tsx` comparte la marca con Login, mientras la lógica de permisos, sincronización, persistencia y operaciones permanece fuera de la UI. `context` y `actions` son slots de presentación existentes: el shell los posiciona, pero no interpreta ni modifica sus comportamientos.

Los patrones visuales compartidos deben tener una interfaz pequeña y más de un consumidor real. Paneles, estados, acciones, badges, formularios, modales y paginación se reutilizan cuando representan el mismo comportamiento. Las excepciones específicas del técnico móvil se mantienen acotadas a captura, teclado, GPS, evidencia, mapa y operación offline.

`SearchField` comparte búsqueda controlada y limpieza accesible entre Técnico y Admin. `PaginationControls` comparte las acciones de página; las cantidades y los cálculos siguen perteneciendo a cada vista. `AppStateCard` y `Notification` presentan estados y mensajes recuperables. `AppModal` monta los diálogos en un portal con el tema del rol: controla foco, teclado y bloqueo del fondo; `closeDisabled` impide cancelar mientras una operación administrativa está en curso. Los resultados de captura conservan su contenido y acción «Listo» con este mismo comportamiento.

Los estilos tienen un punto de entrada en `src/styles/app.css`, que solo importa hojas en orden de cascada. Los tokens visuales viven en `src/styles/tokens.css`, el frame compartido en `src/styles/shell.css` y los controles compartidos en `src/styles/controls.css`; cada sección del CSS original tiene su hoja (`base.css`, `tech-*.css`, `admin-*.css`, …). El orden de importación forma parte de la cascada: reordenar hojas exige verificar el CSS compilado. La hoja de estilos no contiene reglas de autorización ni de negocio.

`npm run smoke:ui` complementa las pruebas de componentes con Chrome/CDP sobre un build simulado (`VITE_PILOT_BACKEND_URL` vacía y `VITE_ENABLE_SIMULATION=true`), usando un perfil temporal y sin contactar servicios externos. Captura vistas responsive y verifica foco, filtros, mapa, GPS tardío, desplazamiento de captura y restauración de borradores. `npm run smoke:pwa` verifica por separado el guardado local, cola y recuperación offline.

La aplicación arranca en uno de estos modos:

- **Local/simulado:** sin URL de backend, solo en desarrollo o con `VITE_ENABLE_SIMULATION=true`; autoridad y datos de demostración locales. `SimulatedApp.tsx` y `bootstrap/simulated-runtime.ts` se cargan con `import()` y no viajan en el build de producción; sin URL ni simulación, la app avisa que no tiene servidor ([D023](DECISIONS.md)).
- **Piloto conectado:** con URL configurada o en el despliegue; `HttpPilotClient` usa el backend provisional.

El técnico mantiene su paquete, borradores, evidencias, operaciones y cola en IndexedDB. El estado React solo representa la vista actual.

## Backend y base de datos

`backend/` es un servidor HTTP Node.js/TypeScript con `pg`. Usa sesiones, roles `ADMIN` y `TECHNICIAN`, cookies/sesiones provisionales, transacciones PostgreSQL y auditoría. El origen se identifica como `PILOT_PROVISIONAL`.

El backend actual expone operaciones para:

- autenticación y cierre de sesión;
- consulta de técnicos, morosos y órdenes;
- creación individual y por lote;
- asignación con versión esperada;
- descarga de órdenes asignadas;
- autorización de corte;
- habilitación provisional de reconexión;
- recepción y consulta de CUT, VISIT y RECONNECTION sincronizados;
- consulta de auditoría.

La sesión del navegador usa cookie HttpOnly `SameSite=Lax`, `Path=/`; no expone token en JSON ni almacenamiento frontend. `COOKIE_SECURE=true` o `NODE_ENV=production` activan `Secure` y HSTS. CORS compara origen exacto; POST de cookie exige Origin permitido y rechaza `Sec-Fetch-Site: cross-site`. `X-Request-Id` y cabeceras de seguridad salen en respuestas, incluidos errores y preflight. Rate limit de login usa dirección del socket y username normalizado, en memoria de proceso. No se confía en `X-Forwarded-For`.

Logs JSON/counters de eventos de login, autorización, sync/conflicto, evidencia y rechazos excluyen payloads, secretos, evidencia y datos personales. Límites de sesión por dispositivo no existen en el esquema: `TODO: VALIDAR CON SEPSA`. Rate limit distribuido, proveedor de métricas/alertas, umbrales, topología, TLS, rotación de secretos y backup/restore deben definirse para despliegue; provider y credenciales no están asumidos. Ver [Contrato del piloto](api/pilot-contract.md).

Estos endpoints describen el piloto actual, no un contrato oficial de SEPSA.

Contrato HTTP provisional, evidencia observada y pendientes: [Contrato del piloto](api/pilot-contract.md).

## Flujo de datos

1. La UI invoca un caso de uso o servicio.
2. El dominio valida identidad, asignación, estado y datos de campo.
3. La operación se persiste de forma atómica en IndexedDB junto con su `operationId` y cola.
4. La UI confirma solo después de comprobar persistencia local.
5. El motor de sincronización envía la operación al adaptador remoto cuando la conectividad es utilizable.
6. El backend aplica idempotencia, autorización, conflictos y auditoría.
7. La cola conserva operaciones fallidas o inciertas para reintento seguro o revisión humana.

## Mapa del código

Dónde vive cada responsabilidad. Los archivos del servidor empiezan con un comentario que explica qué hace y qué no hace. En la aplicación lo hacen todos, salvo cinco sin comentario de cabecera: `field-app/src/adapters/indexeddb/package-validation.ts`, `field-app/src/adapters/mock/connectivity.ts`, `field-app/src/adapters/mock/transport.ts`, `field-app/src/ports/connectivity.ts` y `field-app/src/ports/identity.ts`; los invariantes críticos (autorización de un solo uso, leases de la cola, `cutSendPhase`, idempotencia) están comentados junto al código que los aplica.

### field-app (`field-app/src/`)

| Carpeta | Responsabilidad | Empezar por |
|---|---|---|
| `main.tsx`, `App.tsx`, `TechnicianRuntime.tsx`, `SimulatedApp.tsx` | Arranque, modo (conectado o simulado), sesión, jornada del técnico y pantalla según rol (`bootstrap/environment.ts` resuelve URL del backend y dispositivo) | `App.tsx` |
| `domain/` | Tipos y reglas de negocio puras; no importa nada del proyecto | `policies.ts`, `types.ts` |
| `ports/` | Contratos entre casos de uso y adaptadores | `repository.ts`, `authorization.ts`, `sync.ts` |
| `use-cases/` | Corte, reconexión, visita, sincronización, descarga y comandos de admin | `process.ts`, `sync.ts` |
| `adapters/indexeddb/` | Almacenamiento local durable y autoridad simulada | `repository.ts` |
| `adapters/http/` | Cliente del backend piloto (todos los puertos remotos) | `client.ts` |
| `adapters/browser/`, `adapters/mock/` | Conectividad, sesión y Service Worker; adaptadores simulados | — |
| `state/` | Store de la jornada del técnico (acciones, sync, mensajes) | `store.ts` |
| `bootstrap/` | Construcción de stores con sus adaptadores: conectado (`runtime.ts`) y simulado (`simulated-runtime.ts`) | `runtime.ts` |
| `screens/` | Pantallas: técnico (`FieldApp`), administrador (`OperationsApp`), login; guardan estado y handlers, y componen `components/` | — |
| `components/`, `components/common/` | Componentes con lógica visible (técnico: `FieldHome`, `OrderList`, `FieldMap`, `OrderDetail`, `CaptureForm`; admin: `Admin*`, `DebtorSearchPanel`); primitivas genéricas | `OrderDetail.tsx`, `CaptureForm.tsx` |
| `services/`, `utils/`, `styles/` | Servicios del navegador sin UI (`mobile-back-guard.ts`, `map-cache.ts`); funciones puras de presentación; CSS por sección | `styles/app.css` |

La regla de dependencias entre carpetas la verifica `field-app/src/architecture.test.ts`.

### backend (`backend/src/`)

| Archivo o carpeta | Responsabilidad |
|---|---|
| `server.ts`, `config.ts`, `db.ts`, `types.ts` | Arranque del servidor, configuración, pool/transacciones de PostgreSQL (`withTransaction`) y tipos de sesión |
| `http/` | Transporte: `application.ts` (request id, cabeceras, CORS, CSRF, sesión, errores), `router.ts` (tabla única método + ruta → controlador, comparada con el OpenAPI en `test/router.test.ts`), `responses.ts` (`HttpError`, JSON, cuerpo), `http-policy.ts`, `cookies.ts`, `http-contracts.ts` |
| `controllers/` | Solo HTTP, uno por módulo (`auth`, `orders`, `debtors`, `authorizations`, `evidence`, `sync`, `audit`): leen y validan la forma de la petición, comprueban el rol, llaman al servicio y responden. Nunca ejecutan SQL |
| `services/` | Reglas de negocio: roles, duplicados, versiones, idempotencia (`command-idempotency.service.ts`), autorización de un solo uso, aceptación de CUT/RECONNECTION, auditoría. Abren las transacciones y pasan el `client` a los repositorios |
| `repositories/` | Solo SQL (`orders`, `debtors`, `users`, `authorizations`, `evidence`, `sync`, `audit`, `commands`); no conocen HTTP ni `HttpError` |
| `mappers/` | Filas SQL → JSON de la API (`order`, `debtor`, `session`, `command-response`) |
| `shared/` | `application-context.ts` (pool, config, log y `PROVISIONAL_SOURCE`), `auth-crypto.ts` (scrypt y tokens), `rate-limiter.ts`, paginación, validación de petición, digest JSON |
| `logging/` | `security-logger.ts`: eventos de seguridad sin cuerpos ni datos personales |

Regla de dependencias: `controllers → services → repositories → db`. Excepción documentada: `debtors` y `audit` son consultas sin reglas de negocio y no tienen servicio; su controlador llama directo al repositorio. `test/architecture.test.ts` verifica que ningún controlador contenga SQL, que los repositorios no importen HTTP ni `HttpError` y que `src/application/` no exista.

### Recorrido de una orden de punta a punta

1. **Admin busca morosos.** `screens/OperationsApp.tsx` → `loadSupplyPage` → `HttpPilotClient.findDebtorPage` → `GET /v1/debtors?limit&offset` (solo la página visible y su total) → `controllers/debtors.controller.ts` `listDebtors` → `repositories/debtors.repository.ts` `searchDebtors` y `countDebtors`. Las opciones de filtros salen de `GET /v1/debtors/filter-options` (`listDebtorFilterRecords`, una sola consulta, al entrar).
2. **Admin crea y asigna.** `screens/OperationsApp.tsx` `confirmOrderCreation()` (diálogos en `components/AdminOrderModals.tsx`) → `createOrder` / `createOrdersBatch` + `assignOrder` → `POST /v1/orders` y `POST /v1/orders/{id}/assignment` → `controllers/orders.controller.ts` → `services/orders.service.ts` `createOrder` / `createOrdersBatch` / `assignOrder` (idempotencia en `services/command-idempotency.service.ts`, SQL en `repositories/orders.repository.ts`).
3. **Técnico descarga su jornada.** `TechnicianRuntime.tsx` → `loadPackage()` → `use-cases/download.ts` `downloadAssigned` → `GET /v1/technician/orders` → `controllers/orders.controller.ts` `technicianOrders` → `services/orders.service.ts` `buildWorkPackage`; se guarda con `IndexedDbLocalRepository.savePackage`.
4. **Técnico captura el corte.** `components/OrderDetail.tsx` → `components/CaptureForm.tsx` → `state/store-actions.ts` `executeCut` → `state/evidence.ts` `prepareEvidence`.
5. **Autorización online y guardado local.** `use-cases/process.ts` `executeCut` → `HttpPilotClient.requestCut` → `POST /v1/authorizations/cut` → `controllers/authorizations.controller.ts` → `services/authorizations.service.ts` `authorizeCut`; luego `IndexedDbLocalRepository.claimCut` guarda operación, orden y cola en una transacción.
6. **Sincronización.** `state/store-sync.ts` `requestSync` → `use-cases/sync.ts` `SyncEngine.syncOnce` → subida de fotos (`POST /v1/evidence/assets` → `controllers/evidence.controller.ts` → `services/evidence.service.ts` `uploadEvidence`) → `markCutSendStarted` → `POST /v1/sync/operations` → `controllers/sync.controller.ts` → `services/sync.service.ts` → `services/sync-apply.service.ts` `applySync` → `services/sync-physical-operations.service.ts` (acepta la autorización ya consumida al confirmar el corte, o consume una reserva vigente de una app anterior, y confirma la orden).
7. **Auditoría.** Cada cambio del backend inserta su evento en la misma transacción (`repositories/audit.repository.ts` `insertAudit`); el admin lo consulta con `GET /v1/audit` → `controllers/audit.controller.ts` `listAudit`.

En modo simulado, los pasos remotos los resuelve `adapters/indexeddb/authority-repository.ts` en lugar del backend.

## Identidad y autorización

El frontend usa permisos para orientar la experiencia; el backend vuelve a validar la sesión y el rol. Un técnico solo recibe y opera órdenes asignadas a su identidad. Las sesiones remotas no deben convertirse en secretos persistidos en almacenamiento de la aplicación.

En el piloto conectado, `users.role` es el rol inicial; `user_role_grants` define los roles concedidos y `sessions.active_role` el rol activo de cada sesión. La migración `007_role_grants.sql` conserva únicamente el rol actual de las cuentas existentes y concede ese mismo rol al insertar una cuenta; el segundo rol debe concederse explícitamente en la base de datos. Solo una cuenta con ambos grants puede usar «Cambiar a Técnico» / «Cambiar a Administrador» en el menú de perfil. `POST /v1/auth/role` valida los grants actuales y audita el cambio; cada petición verifica que el rol activo sigue concedido. `GET /v1/auth/session` recupera la sesión autoritativa al recargar o ante un cambio incierto. Cambiar rol requiere conexión, conserva identidad y dispositivo, y reutiliza el mismo almacenamiento IndexedDB de borradores, evidencias y cola. La lista y validación de técnicos usan el grant `TECHNICIAN`, incluso cuando su rol inicial es `ADMIN`.

## Límites importantes

- El backend provisional no es la API oficial.
- Excel se importa mediante scripts/migraciones; no es una dependencia de la UI ni la base definitiva.
- Los blobs se conservan en IndexedDB. En el piloto, `EvidenceUploadPort` carga bytes por `/v1/evidence/assets`; servidor recomputa SHA-256 y guarda binding inmutable. CUT valida assets verificados antes de aceptar la operación. Las fotos se conservan en PostgreSQL de forma permanente, sin excepciones de retención (D029). La API oficial y los límites de MIME y tamaño siguen `TODO: VALIDAR CON SEPSA`.
- La autorización externa de corte es obligatoria online inmediatamente antes de la acción física.
- Los datos sincronizados del técnico deben poder consultarse desde otro dispositivo. El registro (operaciones y fotos) se consulta desde el servidor y se probó en navegador con un dispositivo nuevo; verificado a mano en dos dispositivos físicos y en vista móvil el 2026-10-14 (D029).

## PLANNED

La API oficial de SEPSA, políticas definitivas de identidad, contrato de evidencia y validación de campo son trabajo futuro. No deben modelarse como componentes actuales ni como endpoints confirmados.
