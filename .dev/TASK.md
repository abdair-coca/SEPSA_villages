# Current Task

**Limpieza estructural del proyecto** — plan completo y justificación en [`.dev/PLAN.md`](PLAN.md).

- Organización objetivo: **por tipo** (no por feature). Ver estructuras en `PLAN.md`.
- Restricción: **sin cambios de funcionalidad**. Bugs o mejoras detectados → sección "Hallazgos", no se corrigen dentro de la fase.
- Al cerrar cada tarea, marcar `[x]`. Al cerrar una fase, actualizar su estado en la tabla de fases de `PLAN.md`.
- Cada fase termina con su bloque **Validación** completo en verde antes de commitear.

Fase en curso: **7**

---

## Fase 0 — Cierre del refactor actual y limpieza

- [x] Revisar el diff sin commitear (`backend/src/application/`, `field-app/src/app/store-*.ts`, `capture-form.tsx`, `order-detail.tsx`, `sync-queue.tsx`, `field-app-utils.ts` en `field-app/src/ui/`) y confirmar que solo reorganiza código
- [x] Eliminar `backend/cookies2.txt` (sin abrirlo ni copiar su contenido; puede contener una sesión)
- [x] Eliminar `backend/scripts/__pycache__/` y `field-app/vite.log`
- [x] Añadir a `.gitignore`: `__pycache__/`, `cookies*.txt`, `dist/` si no está cubierto
- [x] Decidir con el usuario si `.agents/` y `.opencode/` se versionan o se ignoran → **ignoradas** en `.gitignore`
- [x] Validación backend: `npx tsc --noEmit`, `npm run test:unit` (48/48), `npm run test:integration`, `npm run e2e:browser` (PostgreSQL temporal aislado)
- [x] Validación field-app: `npx tsc --noEmit`, `npx vitest run` (308/308), `npm run build`, `npm run smoke:ui`, `npm run smoke:pwa` (con `VITE_PILOT_BACKEND_URL=""`)
- [x] Commit del refactor pendiente
- [x] `git status` limpio (excepto `.claude/skills/redesign-existing-projects/SKILL.md`, que el usuario dejó fuera a propósito)

## Fase 1 — Reorganización por tipo de field-app

Solo `git mv` y actualización de imports. Ningún símbolo exportado cambia de nombre.

**Casos de uso** (`application/` → `use-cases/`)
- [x] `process.ts`, `sync.ts`, `reconnection.ts`, `visit.ts`, `download.ts`, `admin.ts`, `auth.ts` y sus tests → `use-cases/`
- [x] `session-persistence.ts` (+test) → `adapters/browser/session-persistence.ts`
- [x] Eliminar `application/index.ts`

**Estado, arranque y servicios** (`app/` → varios)
- [x] `store.ts`, `store-actions.ts`, `store-sync.ts`, `store-results.ts`, `evidence.ts`, `store.test.tsx` → `state/`
- [x] `runtime.ts` (+test) → `bootstrap/runtime.ts`
- [x] `map-cache.ts` (+test) → `services/map-cache.ts`
- [x] `pwa.ts` → `adapters/browser/service-worker.ts`
- [x] Eliminar `app/index.ts`

**Pantallas** (`ui/` → `screens/`)
- [x] `FieldApp.tsx` (+`FieldApp.test.tsx`) → `screens/`
- [x] `OperationsApp.tsx` (+`OperationsApp.test.tsx`, `OperationsApp.requests.test.tsx`) → `screens/`
- [x] `LoginScreen.tsx` (+test) → `screens/`

**Componentes** (`ui/` → `components/`)
- [x] `AppHeader.tsx` (+test) → `components/`
- [x] `order-detail.tsx` → `components/OrderDetail.tsx`
- [x] `capture-form.tsx` → `components/CaptureForm.tsx`
- [x] `sync-queue.tsx` → `components/SyncQueue.tsx`
- [x] `FieldMap.tsx` (+`FieldMap.test.ts`) → `components/`
- [x] `Modal`, `Notification`, `SearchField`, `PaginationControls`, `UiState`, `Icons`, `BrandLockup`, `ExitConfirmationModal` (+tests) → `components/common/`

**Utilidades, servicios y estilos**
- [x] `field-app-utils.ts` → `utils/field-app-utils.ts` (se divide en la fase 2)
- [x] `dialog-lifecycle.ts` (+test) → `utils/dialog-lifecycle.ts`
- [x] `capture-gps-request.ts` (+test) → `services/capture-gps-request.ts`
- [x] `ui/styles.css` → `styles/app.css`; `ui/styles/*.css` → `styles/`; actualizar `@import` y `main.tsx`
- [x] Eliminar `ui/index.ts` y la carpeta `ui/`

**Barrels y referencias externas**
- [x] Reemplazar imports de `adapters/index.ts`, `adapters/*/index.ts`, `domain/index.ts`, `ports/index.ts` por imports al archivo real y eliminar esos barrels
- [x] Buscar rutas viejas (`src/ui`, `src/app`, `src/application`) en `vite.config.ts`, `index.html`, `tsconfig.json`, `scripts/*.mjs`, `public/` y `docs/`, y actualizarlas

**Regla de dependencias**
- [x] Añadir `src/architecture.test.ts` que recorra los imports y falle si: `domain` importa algo del proyecto; `use-cases` importa algo fuera de `domain`/`ports`; `components/common` importa `domain`/`state`/`use-cases`; algo distinto de `App.tsx`/`bootstrap/` importa `adapters/`
- [x] Si el test detecta violaciones existentes, listarlas en "Hallazgos" y marcarlas como excepciones explícitas en el test (no corregir lógica en esta fase) → 2 excepciones en `KNOWN_ADAPTER_EXCEPTIONS`

**Validación**
- [x] `npx tsc --noEmit` · `npx vitest run` (316/316) · `npm run build` · `npm run smoke:ui` (17/17) · `npm run smoke:pwa` en verde
- [x] No existen `src/ui/`, `src/app/`, `src/application/`
- [x] Commit + estado de fase 1 actualizado en `PLAN.md`

## Fase 2 — Utilidades y reglas en su capa

- [x] Dividir `utils/field-app-utils.ts`:
  - [x] `utils/format.ts`: `formatDate`, `formatActivityTime`, `formatLastUpdate`, `formatDebt`, `displayValue`, `shortHash`, `shortTechnicalId`, `splitReviewText`, `orderActivityReviewPages` (+ `formatAdminCoordinates`, `escapeHtml`, `orderPopupHtml`)
  - [x] `utils/labels.ts`: `actionLabel`, `queueActionLabel`, `activityLabel`, `activityDetail`, `activityException`, `orderStatusLabel`, `fieldOrderStatusLabel`, `physicalStatusLabel`, `orderStatusTone`, `syncStatusLabel`, `queueReviewMessage`
  - [x] `utils/sorting.ts`: `sortActivityEntries`, `sortSyncItemsForDisplay`, `sortOrdersForNext`, `orderJourneyOrders`, `adjacentJourneyOrder`, `activityTimestampsByOperation`, `syncItemTimestamp`, `activityTimestamp`, `pendingCount`
  - [x] Revisar el resto: `hasCadastralCoordinates` e `isUsable` → `domain/policies.ts`; `pendingCount` → `utils/sorting.ts`
  - [x] Eliminar `field-app-utils.ts`
- [x] Mover `isManualVisitAllowed` a `domain/policies.ts` (sus tests existentes en `FieldApp.test.tsx` siguen cubriéndola vía render)
- [x] Revisar `utils/` en busca de otras decisiones de negocio y moverlas a `domain/` → `cutCompletionOutcome` y `findActiveOrderForSupply` (+ `isActiveOrder`) a `domain/policies.ts`; `ActionKind` a `domain/types.ts`
- [x] Sacar helpers puros exportados desde pantallas/componentes a `utils/`, `domain/` o `state/` (con sus tests):
  - [x] `OperationsApp.tsx`: `getAdminOrderPage` y tamaños de página → `utils/pagination.ts`; `formatAdminCoordinates` → `utils/format.ts`; `getMissingOrderCreationDebtorIds`, `getAdminFilterOptions`, `filterOptions`, `matchesFilterValue` → `utils/filters.ts`; `NO_DATA_FILTER_VALUE` → `domain/types.ts` (unificado con la copia del adaptador IndexedDB)
  - [x] `FieldApp.tsx`: `syncThenRefreshAssigned`, `openOrderMap` → `state/field-commands.ts`
  - [x] `OrderDetail.tsx`: `cutCompletionOutcome` → `domain/policies.ts`; `paginateReviewFields` → `utils/pagination.ts`
  - [x] `CaptureForm.tsx`: `captureWizardSteps`, `captureDraftCanAdvance`, `captureSubmitError`, `loadCaptureDraftSafely`, `restoreEvidenceFile` → `utils/capture-wizard.ts`
  - [x] `SyncQueue.tsx`: `queuePageItem` → `utils/pagination.ts`
  - [x] `FieldMap.tsx`: `orderPopupHtml`, `escapeHtml` → `utils/format.ts`; `handleFullscreenMapKeyDown`, `restoreFullscreenMapFocus` → `utils/dialog-lifecycle.ts`
  - [x] Quitar las reexportaciones de `FieldApp.tsx`, `OrderDetail.tsx` y `SyncQueue.tsx` (eran barrels encubiertos)
  - [x] Tests de funciones puras movidos a `utils/*.test.ts`, `state/field-commands.test.ts` y `domain/policies.test.ts`; `components/FieldMap.test.ts` eliminado (todo su contenido era de helpers)
- [x] **Validación:** `tsc`, `vitest` (316/316, mismo total que antes), `build`, `smoke:ui` (17/17), `smoke:pwa` en verde; commit; estado actualizado en `PLAN.md`

## Fase 3 — Comentarios y mapa del código

Política en `PLAN.md` → "Política de comentarios". Comentarios en español, explicando el porqué.

**field-app**
- [x] `domain/`: cabeceras + porqué de cada política (elegibilidad de corte, excepciones GPS/foto, validación de captura)
- [x] `ports/`: JSDoc de cada interfaz y método (contrato, errores, garantías)
- [x] `use-cases/process.ts`: autorización online, de un solo uso e inmediata; resultado incierto no se repite
- [x] `use-cases/sync.ts`: lease, `cutSendPhase`, ACK perdido → consulta de estado, sin last-write-wins
- [x] `use-cases/reconnection.ts`: habilitación provisional y su vínculo orden/técnico/dispositivo/operación/versión
- [x] `adapters/indexeddb/`: esquema de stores, transacciones atómicas, por qué se re-verifica antes del POST
- [x] `adapters/http/client.ts`: mapeo de errores HTTP a errores de dominio
- [x] `state/`: responsabilidad de cada archivo del store y flujo de una acción
- [x] `bootstrap/runtime.ts` y `App.tsx`: modo simulado vs. backend piloto
- [x] Cabecera en cada pantalla y componente no trivial

**backend**
- [x] Cabecera en cada archivo de `backend/src/` (incluidos `application/`, `auth.ts`, `db.ts`, `http.ts`, `config.ts`)
- [x] Idempotencia de comandos (`command-idempotency.ts`): replay y conflicto de hash
- [x] Autorización de corte y reconexión: consumo único y vigencia
- [x] Sync: validación de evidencia dentro de la transacción de consumo
- [x] `http-policy.ts`: CORS, origen y cabeceras de seguridad

**Mapa del código**
- [x] Añadir a `docs/ARCHITECTURE.md` la sección "Mapa del código": carpeta → responsabilidad → archivo de entrada (field-app y backend)
- [x] Añadir el recorrido de una orden: admin crea → asigna → técnico descarga → captura → autoriza → sync → auditoría, con archivo y función de cada paso
- [x] Verificar que todas las rutas del mapa existen
- [x] Comentarios previos en inglés traducidos al español
- [x] Imports sin usar preexistentes eliminados (`tsc --noUnusedLocals` sin hallazgos en field-app)
- [x] **Validación:** field-app `tsc`, `vitest` (316/316), `build`, `smoke:ui` (17/17), `smoke:pwa`; backend `tsc`, `test:unit` (48/48), `test:integration`, `e2e:browser` en verde; commit; estado actualizado en `PLAN.md`

## Fase 4 — División de componentes grandes

Objetivo: ~300 líneas máximo por componente, sin cambiar markup, clases CSS ni textos.

- [x] `screens/OperationsApp.tsx` (607 → 425) → extraer a `components/`:
  - [x] `AdminOverview.tsx` (resumen), `DebtorSearchPanel.tsx` (búsqueda, filtros, selección, `AdminSelectionSummary`), `AdminSupplyPanel.tsx` (suministro seleccionado + órdenes recientes), `AdminOrderDetail.tsx` (ficha de orden), `AdminOrderModals.tsx` (creación y asignación), `AdminData.tsx` (campos e iconos compartidos)
  - [x] Etiquetas/formatos privados del admin → `utils/labels.ts` (`adminOrder*`) y `utils/format.ts` (`formatAdmin*`, `joinAdminValues`)
  - [x] El estado y los handlers se quedan en la pantalla (por eso supera 300 líneas; ver Hallazgos)
- [x] `screens/FieldApp.tsx` (705 → 323) → extraer a `components/`: `FieldHome.tsx` (inicio, resumen, orden actual, tarjetas), `OrderList.tsx` (`OrdersPanel`: lista y filtros), `FieldBottomNav.tsx` (navegación de escritorio e inferior), `CompactNetworkStatus.tsx`, `FieldMapPanel.tsx`, `LastUpdateDisplay.tsx`
- [x] `components/FieldMap.tsx` (504 → 416) → `FieldMapLayers.ts` (capa satelital con caché y marcadores/popup) y `FieldMapFullscreenHeader.tsx`; `orderCoordinates()` ahora usa `hasCadastralCoordinates`
- [x] `App.tsx` (301 → 236) → `services/mobile-back-guard.ts` (+ test movido desde `App.test.tsx`) y `bootstrap/environment.ts` (`resolvePilotBackendUrl`, `getStableDeviceId`)
- [x] Evaluar `adapters/indexeddb/repository.ts` (940) y `authority-repository.ts` (797): se mantienen enteros (ver Hallazgos)
- [x] **Validación:** `tsc` (con `--noUnusedLocals`), `vitest` (316/316), `build`, `smoke:ui` (17/17), `smoke:pwa` en verde; commits; estado actualizado en `PLAN.md`

## Fase 5 — Backend por tipo

**Movimiento sin cambios**
- [x] `src/application.ts` → `src/http/application.ts`
- [x] `src/http.ts` → `src/http/responses.ts`; `http-contracts.ts`, `application/http-policy.ts`, `application/auth/cookies.ts` → `src/http/`
- [x] `application/projections/` → `src/mappers/` (`order.mapper.ts`, `debtor.mapper.ts`, `session.mapper.ts`, `command-response.mapper.ts`)
- [x] `application/shared/` + `application/auth/rate-limiter.ts` → `src/shared/` (la idempotencia terminó en `services/command-idempotency.service.ts`)
- [x] `security-logger.ts` → `src/logging/`
- [x] Handlers de cada módulo → `src/controllers/<modulo>.controller.ts` (un controlador por módulo tras la fase 5c)
- [x] Ubicación de `src/auth.ts`: `src/shared/auth-crypto.ts` (lo usan servicios y scripts; no es regla de negocio). `application-context.ts` → `src/shared/` (lo importan todas las capas; en `http/` crearía dependencias de repositorios hacia transporte)
- [x] `package.json` (`start` sigue en `dist/src/server.js`), `Dockerfile`, `tsconfig.json`, CI y tests con las rutas nuevas (`npm run build` y el test del servidor compilado en verde)
- [x] Validación + commit

**Router**
- [x] Tabla `{ method, pattern, access, handler }` en `src/http/router.ts` (incluye `/healthz`)
- [x] `test/router.test.ts` compara la tabla con `openapi/pilot-provisional.openapi.json` (método + ruta, y rutas públicas)
- [x] Validación + commit

**Separación controller / service / repository** (un módulo por commit)
- [x] `orders`
- [x] `debtors` (sin servicio: controlador + repositorio)
- [x] `audit` (sin servicio: controlador + repositorio)
- [x] `auth`
- [x] `evidence`
- [x] `authorizations` (cut + reconexión)
- [x] `sync`
- [x] Verificar: ningún archivo de `controllers/` contiene `.query(`; ningún archivo de `repositories/` importa `node:http` ni `HttpError` (lo comprueba `test/architecture.test.ts`)
- [x] Actualizar la tabla del backend y el recorrido de la orden en `docs/ARCHITECTURE.md` → "Mapa del código"

**Validación**
- [x] `npx tsc --noEmit` · `npm run test:unit` (55/55) · `npm run test:integration` (1/1) · `npm run e2e:browser` (9 checks, `"result":"passed"`) en verde
- [x] No existe `src/application/`
- [x] Commit; estado actualizado en `PLAN.md`

## Fase 6 — CSS por tipo y deduplicación

- [x] Capturas de referencia antes de tocar CSS: login, técnico (inicio, lista, detalle, captura, mapa, cola), admin (búsqueda, creación, ficha, auditoría); móvil y escritorio. Referencia `base`/`base2` regenerada con animaciones desactivadas y espera de layout; la lista de órdenes sigue variando entre ejecuciones (ver Hallazgos). La auditoría no es una pantalla propia: aparece como contador «Trazas» en el resumen del administrador.
- [x] Inventario de `styles/app.css` por bloque: a qué pantalla/componente pertenece cada sección (1.497 unidades; ver Hallazgos sobre por qué no se agrupan por componente)
- [x] Crear un archivo por pantalla/componente en `styles/` y mover los bloques sin modificarlos — **parcial**: un archivo por sección de la hoja original (26 y `base.css`), no por componente (ver Hallazgos)
- [x] `styles/app.css` queda solo con `@import` en el orden de cascada original
- [x] Comparar capturas (sin diferencias) y commit — el CSS compilado tras la división es byte a byte igual al anterior; limpieza y tokens verificados con capturas y reglas de ruido documentadas
- [x] Eliminar selectores duplicados archivo por archivo, comparando capturas en cada commit — una pasada sobre el CSS completo (290 declaraciones y 71 reglas vacías), no archivo por archivo (ver Hallazgos)
- [x] Eliminar reglas sin uso (clase no presente en ningún `.tsx`) — 646 selectores y 515 reglas; comprobado contra el código fuente y el DOM de referencia
- [x] Reemplazar colores directos por tokens solo cuando el valor coincide exactamente — 135 sustituciones (22 literales), solo si el token vale lo mismo en `:root` y en `.field-app`
- [x] **Validación:** `tsc`, `vitest` (316/316), `build`, `smoke:ui` (17/17) y `smoke:pwa` en verde; comparación visual sin diferencias salvo las carreras documentadas; commits; estado actualizado en `PLAN.md`

## Fase 7 — Higiene del repositorio y migraciones

- [ ] Revisar cómo se aplican y registran las migraciones: `scripts/apply-startup-schema-migrations.mjs`, `migrate-test-db.mjs`, `bootstrap-pilot.mjs`, `Dockerfile`, `docker-compose.yml`, CI, `render.yaml`
- [ ] Si los nombres de archivo identifican migraciones ya aplicadas en el piloto: no renombrar; crear `backend/sql/README.md` con el orden real y el motivo de los números duplicados (`002`, `003`, `007`)
- [ ] Si no: renumerar sin duplicados y actualizar todas las referencias
- [ ] Separar seeds (`002_seed`, `004_e2e_seed`, `005_definitive_seed`, `006_replace-…`) en `backend/sql/seeds/` y actualizar referencias
- [ ] Unificar o documentar la relación entre `backend/sql/` y `backend/migrations/*.mjs`
- [ ] `docs/`: archivar o enlazar `constitution.md`, el `.docx` (`ROLE_Actúa como…`) y `guia-tecnico-campo-piloto.pdf`
- [ ] `boceto-mvp/`: mover a `docs/archive/` o eliminar, previa confirmación del usuario
- [ ] **Validación:** suite completa de backend (incluida integración y E2E) en verde; commit; estado actualizado en `PLAN.md`

## Cierre del plan

- [ ] Todas las fases en estado "Hecha" en `PLAN.md`
- [ ] `docs/ARCHITECTURE.md` refleja la estructura final
- [ ] Quitar la sección "Plan activo" de `AGENTS.md`
- [ ] Eliminar `.dev/PLAN.md` y dejar este archivo como "No active task."

---

## Hallazgos

Bugs, deudas o decisiones detectadas durante el plan. No se corrigen dentro de una fase de limpieza.

- Fase 0: los smokes `smoke:ui`/`smoke:pwa` exigen `VITE_PILOT_BACKEND_URL=""` en el entorno (como en CI); sin esa variable fallan antes de empezar. Añadirlo a la validación estándar de `PLAN.md`.
- Fase 1: `screens/FieldApp.tsx` importa `adapters/browser/connectivity` y `screens/LoginScreen.tsx` importa `adapters/browser/session-persistence`. Las pantallas deberían recibir esos puertos desde `App.tsx`/`bootstrap/`. Registradas como excepciones en `src/architecture.test.ts`; corregir en una tarea aparte (cambia props de pantallas).
- Fase 1→2: `utils/` importaba tipos de `state/`. Resuelto para `ActionKind` (ahora en `domain/types.ts`). `ActivityEntry` sigue en `state/store.ts` porque es un modelo de vista del store; `utils/format.ts` y `utils/sorting.ts` lo importan solo como tipo.
- Fase 2: `screens/OperationsApp.tsx` tiene etiquetas privadas propias del admin (`orderDomainStatusLabel`, `orderStatusLabel`, `statusTone`, `formatRelativeDate`) con textos distintos a los de `utils/labels.ts` (p. ej. "Generada" vs "Por ejecutar"). Moverlas a `utils/labels.ts` con nombres `admin*` en la fase 4; unificar textos es decisión de producto.
- Fase 2: `FieldMap.tsx` tiene `orderCoordinates()` que repite la validación de `hasCadastralCoordinates` (`domain/policies.ts`). Unificar en la fase 4.
- Fase 2→3: imports sin usar preexistentes. Resuelto en la fase 3 (incluida la reexportación sin uso de `formatSyncMessage` en `state/store.ts`).
- Fase 3: los mensajes de error del backend y de `DomainError` están en inglés y algunos llegan a la UI (p. ej. "Order is not assigned to this technician."). Traducirlos cambia textos visibles: decisión de producto, fuera de esta limpieza.
- Fase 3: `HttpPilotClient.requestCut` relanza un `HttpError` del backend (p. ej. 409 `VERSION_CONFLICT`) y `use-cases/process.ts` solo convierte en visita los errores inciertos; un rechazo explícito del backend llega a la UI como error en vez de registrarse como visita bloqueada. Revisar si es el comportamiento deseado.
- Fase 1: `main.tsx` importa `adapters/browser/service-worker`; se considera punto de composición junto con `App.tsx` y `bootstrap/`.
- Fase 0: `npm run build` avisa de un chunk de ~507 kB (>500 kB). No bloquea; evaluar code-splitting fuera de este plan.
- Fase 4: `screens/OperationsApp.tsx` (425) y `components/FieldMap.tsx` (416) siguen sobre ~300 líneas: lo restante es estado, handlers y efectos de una sola pieza (peticiones con propiedad de sesión en la pantalla; GPS/Leaflet en el mapa) que no se separan sin cambiar el flujo de datos. Revisar con un hook propio en una tarea aparte.
- Fase 4: `adapters/indexeddb/repository.ts` (940) y `authority-repository.ts` (797) se mantienen: son una sola clase por puerto (`LocalRepository`, `IdentityPort`/`OperationsAuthorityPort`) cuyos métodos comparten la base, las transacciones atómicas y helpers privados; no hay corte limpio por agregado sin cambiar transacciones. Corte opcional barato: los datos de demostración de `authority-repository.ts` (`simulatedDebtors`, `createExtraSimulatedDebtor`, ~90 líneas) a un archivo `simulated-data.ts`.
- Fase 4: `OperationsApp.requests.test.tsx` recorre el árbol de elementos sin expandir componentes; al extraer `DebtorSearchPanel` (antes JSX en línea) el helper `elements()` lo expande explícitamente. Cualquier otro panel en línea que se extraiga requerirá lo mismo.
- Fase 4: `npm run smoke:pwa` falló una vez (exit 1) justo después de `smoke:ui` en la misma shell y pasó en el reintento sin cambios (posible condición de carrera de puerto/servidor); revisar su robustez.
- Fase 5: `services/command-idempotency.service.ts` mezcla regla (replay/conflicto/"en curso" con `HttpError`) y lectura de `command_operations`; el SQL está en `repositories/commands.repository.ts` pero el servicio lo ejecuta dentro de la transacción del comando. No se separó más para no alterar el orden `INSERT ... ON CONFLICT` → `SELECT ... FOR UPDATE`.
- Fase 5: `debtors` y `audit` no tienen servicio (controlador + repositorio): son una consulta paginada sin reglas más allá del rol. Si aparecen reglas de negocio, crear `*.service.ts`.
- Fase 5: `lookupOperation` (sync) decide la forma de la respuesta (`confirmed`/`unknown`/`not_found`) en el servicio y devuelve un objeto JSON ya armado; es presentación de contrato mezclada con la regla "recibo completo". Separarlo cambiaría el contrato del servicio sin ganancia hoy.
- Fase 5: `parseSyncPayload`/`validateSyncPayload` (forma + reglas de captura de CUT) viven juntos en `services/sync-payload-validation.service.ts` y el controlador los invoca; mezclan validación de forma (400) con reglas de dominio (lectura final real, GPS o excepción). Separar la forma del dominio sería un cambio de diseño aparte.
- Fase 5: `/healthz` pasó a ser una ruta pública de la tabla; antes se respondía antes de `validateOrigin`. Es equivalente porque `validateOrigin` ignora los GET, pero queda anotado. `POST /v1/auth/logout` figura como pública en la tabla (valida la sesión dentro del controlador) aunque el OpenAPI declare seguridad; el test lo documenta.
- Fase 5: la tabla de rutas hace que una ruta desconocida sin sesión responda 401 (no 404), igual que antes: la sesión se exige antes de buscar rutas protegidas. Conservado a propósito.
- Fase 5: `tsc --noUnusedLocals` en backend baja de 10 a 9 errores (se quitó un import sin usar en `mappers/debtor.mapper.ts`); los 9 restantes son de `test/application.test.ts` y `test/reconnection.test.ts` (preexistentes, fuera del alcance).
- Fase 6: `app.css` no se puede repartir por pantalla o componente sin cambiar la cascada. Tenía 1.497 bloques intercalados entre dueños (525 tramos contiguos); reordenarlos por dueño produjo 59.372 diferencias de elementos y 138 PNG. Los dueños forman un ciclo porque las secciones sobrescriben clases compartidas (`.panel`, `.panel-heading`, `.primary-action`, `.app-header`…). Agrupar por componente exige consolidar esos overrides en una tarea aparte, con su propia verificación.
- Fase 6: la lista de órdenes del técnico (`tech-orders*`, 1024 y 1280 px) no es reproducible entre ejecuciones: la altura de la página cambia en saltos de 56 px (593/649, 909/965, 1137/1193). Esperar a que el layout se estabilice no lo resolvió. Esos estados se verifican sin propiedades de color.
- Fase 6: durante el zoom de Leaflet, la capa de teselas queda en fase transitoria según la carga (`transform`, `z-index`, `transition-*`). Afecta a `tech-map-fullscreen` (320 y 760 px) y a `tech-home-after` (1024 px).
- Fase 6: `tokens.css` redefine nueve tokens dentro de `.field-app` y `[data-ui-theme="field"]`; un literal solo se sustituye por `var(--token)` si el token vale lo mismo en ambos ámbitos.
- Fase 6: al borrar reglas sin uso, las clases dentro de `:is()`, `:where()`, `:has()` y `:not()` no cuentan como muertas: una alternativa viva mantiene el selector.
- Fase 6: el orden de las subtareas cambió. Las reglas sin uso y la deduplicación se hicieron antes del reparto, porque el reparto solo era verificable sobre el CSS ya limpio. La deduplicación fue una pasada global y solo elimina declaraciones que una regla posterior idéntica (mismo selector, propiedad e importancia) siempre sobrescribe.
- Fase 6: `shared-shell.css` pasa a `shell.css`, como indica el plan. `docs/ARCHITECTURE.md` y `docs/design.md` se actualizaron.
