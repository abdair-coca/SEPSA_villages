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

`field-app/` contiene una aplicación React + TypeScript. El código se organiza por tipo: `src/domain` define entidades y políticas; `src/ports` define interfaces; `src/use-cases` contiene casos de uso; `src/adapters` conecta IndexedDB, navegador, simulación y HTTP; `src/state` compone el estado de la jornada; `src/bootstrap` construye los stores según el modo; `src/services` agrupa servicios de navegador sin UI; `src/screens` contiene las pantallas de administración, campo y login; `src/components` los componentes (genéricos en `src/components/common`); `src/utils` funciones puras de presentación y `src/styles` las hojas de estilo. La estructura objetivo y las reglas de dependencias están en `.dev/PLAN.md` mientras dure la limpieza estructural.

### UI compartida

La interfaz visual cruza los roles mediante un shell común. `src/components/AppHeader.tsx` es el seam de presentación autenticado para Admin y Técnico: recibe identidad, título, descripción, contexto, un estado tipado y acciones como contenido. Renderiza la misma tarjeta superior responsive para ambos roles: marca por área, estado o entorno, avatar y menú de cuenta. El shell tiene una variante `standard`, usada por Inicio y por Admin, y una variante `minimal`, usada por las pantallas secundarias del Técnico; esta última muestra solo el top bar y deja el encabezado propio de cada pantalla en su contenido. El menú concentra nombre, rol, entorno cuando existe y cierre de sesión; no contiene reglas de autorización.

El estado del header conserva una separación explícita: Técnico muestra el estado real de conectividad (`positive`, `warning` o `negative`) que ya produce la jornada; Admin muestra el entorno de ejecución (`environment`) y no introduce una segunda lógica de conectividad. El nombre y rol no se duplican fuera del menú. En las pantallas secundarias del Técnico, las acciones de sincronización se presentan como acciones tipadas dentro del menú de cuenta; sus callbacks siguen perteneciendo a `FieldApp` y no se implementan reglas operativas en `AppHeader`. El top bar no es fijo ni sticky y el título de página permanece debajo con el texto propio de cada superficie.

`src/components/common/BrandLockup.tsx` comparte la marca con Login, mientras la lógica de permisos, sincronización, persistencia y operaciones permanece fuera de la UI. `context` y `actions` son slots de presentación existentes: el shell los posiciona, pero no interpreta ni modifica sus comportamientos.

Los patrones visuales compartidos deben tener una interfaz pequeña y más de un consumidor real. Paneles, estados, acciones, badges, formularios, modales y paginación se reutilizan cuando representan el mismo comportamiento. Las excepciones específicas del técnico móvil se mantienen acotadas a captura, teclado, GPS, evidencia, mapa y operación offline.

`SearchField` comparte búsqueda controlada y limpieza accesible entre Técnico y Admin. `PaginationControls` comparte las acciones de página; las cantidades y los cálculos siguen perteneciendo a cada vista. `AppStateCard` y `Notification` presentan estados y mensajes recuperables. `AppModal` monta los diálogos en un portal con el tema del rol: controla foco, teclado y bloqueo del fondo; `closeDisabled` impide cancelar mientras una operación administrativa está en curso. Los resultados de captura conservan su contenido y acción «Listo» con este mismo comportamiento.

Los estilos tienen un punto de entrada en `src/styles/app.css`. Los tokens visuales y capas viven en `src/styles/tokens.css`, el frame compartido en `src/styles/shared-shell.css` y los controles compartidos en `src/styles/controls.css`; el resto de estilos se organiza por superficie hasta completar su migración. La hoja de estilos no contiene reglas de autorización ni de negocio.

`npm run smoke:ui` complementa las pruebas de componentes con Chrome/CDP sobre un build simulado, usando un perfil temporal y sin contactar servicios externos. Captura vistas responsive y verifica foco, filtros, mapa, GPS tardío, desplazamiento de captura y restauración de borradores. `npm run smoke:pwa` verifica por separado el guardado local, cola y recuperación offline.

La aplicación arranca en uno de estos modos:

- **Local/simulado:** sin `VITE_PILOT_BACKEND_URL`; autoridad y datos de demostración locales.
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

Dónde vive cada responsabilidad. Cada archivo empieza con un comentario que explica qué hace y qué no hace; los invariantes críticos (autorización de un solo uso, leases de la cola, `cutSendPhase`, idempotencia) están comentados junto al código que los aplica.

### field-app (`field-app/src/`)

| Carpeta | Responsabilidad | Empezar por |
|---|---|---|
| `main.tsx`, `App.tsx` | Arranque, modo (simulado o piloto), sesión y pantalla según rol | `App.tsx` |
| `domain/` | Tipos y reglas de negocio puras; no importa nada del proyecto | `policies.ts`, `types.ts` |
| `ports/` | Contratos entre casos de uso y adaptadores | `repository.ts`, `authorization.ts`, `sync.ts` |
| `use-cases/` | Corte, reconexión, visita, sincronización, descarga y comandos de admin | `process.ts`, `sync.ts` |
| `adapters/indexeddb/` | Almacenamiento local durable y autoridad simulada | `repository.ts` |
| `adapters/http/` | Cliente del backend piloto (todos los puertos remotos) | `client.ts` |
| `adapters/browser/`, `adapters/mock/` | Conectividad, sesión y Service Worker; adaptadores simulados | — |
| `state/` | Store de la jornada del técnico (acciones, sync, mensajes) | `store.ts` |
| `bootstrap/` | Construcción de stores con sus adaptadores | `runtime.ts` |
| `screens/` | Pantallas: técnico (`FieldApp`), administrador (`OperationsApp`), login | — |
| `components/`, `components/common/` | Componentes con lógica visible; primitivas genéricas | `OrderDetail.tsx`, `CaptureForm.tsx` |
| `services/`, `utils/`, `styles/` | Servicios del navegador sin UI; funciones puras de presentación; CSS | — |

La regla de dependencias entre carpetas la verifica `field-app/src/architecture.test.ts`.

### backend (`backend/src/`)

| Archivo o carpeta | Responsabilidad |
|---|---|
| `server.ts`, `application.ts` | Arranque, pipeline HTTP (seguridad, CORS, CSRF, sesión) y tabla de rutas |
| `application/auth/` | Login, logout, sesión, cambio de rol y límite de intentos |
| `application/debtors/`, `application/orders/` | Búsqueda de morosos; crear, asignar y listar órdenes; paquete del técnico |
| `application/authorizations/` | Autorización de corte y habilitación de reconexión |
| `application/evidence/` | Subida y verificación de fotos |
| `application/sync/` | Recepción, consulta y revisión humana de operaciones sincronizadas |
| `application/audit/` | Registro y consulta de auditoría |
| `application/shared/`, `application/projections/` | Idempotencia, paginación y validación; conversión de filas SQL a JSON |
| `auth.ts`, `db.ts`, `http.ts`, `config.ts` | Criptografía, transacciones, utilidades HTTP y configuración |

### Recorrido de una orden de punta a punta

1. **Admin busca morosos.** `screens/OperationsApp.tsx` → `refresh()` → `HttpPilotClient.findDebtors` → `GET /v1/debtors` → `application/debtors/search.ts` `listDebtors`.
2. **Admin crea y asigna.** `OperationsApp` `confirmOrderCreation()` → `createOrder` / `createOrdersBatch` + `assignOrder` → `POST /v1/orders` y `POST /v1/orders/{id}/assignment` → `application/orders/order-command-handlers.ts` (idempotencia en `application/shared/command-idempotency.ts`).
3. **Técnico descarga su jornada.** `App.tsx` `TechnicianRuntime` → `loadPackage()` → `use-cases/download.ts` `downloadAssigned` → `GET /v1/technician/orders` → `application/orders/work-package-handlers.ts`; se guarda con `IndexedDbLocalRepository.savePackage`.
4. **Técnico captura el corte.** `components/OrderDetail.tsx` → `components/CaptureForm.tsx` → `state/store-actions.ts` `executeCut` → `state/evidence.ts` `prepareEvidence`.
5. **Autorización online y guardado local.** `use-cases/process.ts` `executeCut` → `HttpPilotClient.requestCut` → `POST /v1/authorizations/cut` → `application/authorizations/cut.ts` `authorizeCut`; luego `IndexedDbLocalRepository.claimCut` guarda operación, orden y cola en una transacción.
6. **Sincronización.** `state/store-sync.ts` `requestSync` → `use-cases/sync.ts` `SyncEngine.syncOnce` → subida de fotos (`POST /v1/evidence/assets` → `application/evidence/upload.ts`) → `markCutSendStarted` → `POST /v1/sync/operations` → `application/sync/apply-sync.ts` `applySync` → `application/sync/physical-operations.ts` (consume la autorización y confirma la orden).
7. **Auditoría.** Cada cambio del backend inserta su evento en la misma transacción (`application/audit/record.ts` `insertAudit`); el admin lo consulta con `GET /v1/audit` → `application/audit/handlers.ts` `listAudit`.

En modo simulado, los pasos remotos los resuelve `adapters/indexeddb/authority-repository.ts` en lugar del backend.

## Identidad y autorización

El frontend usa permisos para orientar la experiencia; el backend vuelve a validar la sesión y el rol. Un técnico solo recibe y opera órdenes asignadas a su identidad. Las sesiones remotas no deben convertirse en secretos persistidos en almacenamiento de la aplicación.

En el piloto conectado, `users.role` es el rol inicial; `user_role_grants` define los roles concedidos y `sessions.active_role` el rol activo de cada sesión. La migración `007_role_grants.sql` conserva únicamente el rol actual de las cuentas existentes y concede ese mismo rol al insertar una cuenta; el segundo rol debe concederse explícitamente en la base de datos. Solo una cuenta con ambos grants puede usar «Cambiar a Técnico» / «Cambiar a Administrador» en el menú de perfil. `POST /v1/auth/role` valida los grants actuales y audita el cambio; cada petición verifica que el rol activo sigue concedido. `GET /v1/auth/session` recupera la sesión autoritativa al recargar o ante un cambio incierto. Cambiar rol requiere conexión, conserva identidad y dispositivo, y reutiliza el mismo almacenamiento IndexedDB de borradores, evidencias y cola. La lista y validación de técnicos usan el grant `TECHNICIAN`, incluso cuando su rol inicial es `ADMIN`.

## Límites importantes

- El backend provisional no es la API oficial.
- Excel se importa mediante scripts/migraciones; no es una dependencia de la UI ni la base definitiva.
- Los blobs se conservan en IndexedDB. En el piloto, `EvidenceUploadPort` carga bytes por `/v1/evidence/assets`; servidor recomputa SHA-256 y guarda binding inmutable. CUT valida assets verificados antes de consumir autorización. API oficial, límites y retención siguen `TODO: VALIDAR CON SEPSA`.
- La autorización externa de corte es obligatoria online inmediatamente antes de la acción física.

## PLANNED

La API oficial de SEPSA, políticas definitivas de identidad, contrato de evidencia y validación de campo son trabajo futuro. No deben modelarse como componentes actuales ni como endpoints confirmados.
