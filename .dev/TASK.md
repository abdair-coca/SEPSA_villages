# Current Task

**Limpieza estructural del proyecto** — plan completo y justificación en [`.dev/PLAN.md`](PLAN.md).

- Organización objetivo: **por tipo** (no por feature). Ver estructuras en `PLAN.md`.
- Restricción: **sin cambios de funcionalidad**. Bugs o mejoras detectados → sección "Hallazgos", no se corrigen dentro de la fase.
- Al cerrar cada tarea, marcar `[x]`. Al cerrar una fase, actualizar su estado en la tabla de fases de `PLAN.md`.
- Cada fase termina con su bloque **Validación** completo en verde antes de commitear.

Fase en curso: **2**

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

- [ ] Dividir `utils/field-app-utils.ts`:
  - [ ] `utils/format.ts`: `formatDate`, `formatActivityTime`, `formatLastUpdate`, `formatDebt`, `displayValue`, `shortHash`, `shortTechnicalId`, `splitReviewText`
  - [ ] `utils/labels.ts`: `actionLabel`, `queueActionLabel`, `activityLabel`, `activityDetail`, `activityException`, `orderStatusLabel`, `fieldOrderStatusLabel`, `physicalStatusLabel`, `orderStatusTone`, `syncStatusLabel`, `queueReviewMessage`
  - [ ] `utils/sorting.ts`: `sortActivityEntries`, `sortSyncItemsForDisplay`, `sortOrdersForNext`, `orderJourneyOrders`, `adjacentJourneyOrder`, `activityTimestampsByOperation`, `syncItemTimestamp`, `activityTimestamp`, `orderActivityReviewPages`
  - [ ] Revisar el resto (`hasCadastralCoordinates`, `pendingCount`, `isUsable`) y ubicar cada una
  - [ ] Eliminar `field-app-utils.ts`
- [ ] Mover `isManualVisitAllowed` a `domain/policies.ts` con test en `policies.test.ts`
- [ ] Revisar `utils/` en busca de otras decisiones de negocio y moverlas a `domain/`
- [ ] Sacar helpers puros exportados desde pantallas/componentes a `utils/` o `domain/` (con sus tests):
  - [ ] `OperationsApp.tsx`: `getAdminOrderPage`, `formatAdminCoordinates`, `getMissingOrderCreationDebtorIds`, constantes de paginación
  - [ ] `FieldApp.tsx`: `syncThenRefreshAssigned`, `openOrderMap`
  - [ ] `OrderDetail.tsx`: `cutCompletionOutcome`, `paginateReviewFields`
  - [ ] `CaptureForm.tsx`: `captureWizardSteps`, `captureDraftCanAdvance`, `captureSubmitError`, `loadCaptureDraftSafely`
  - [ ] `SyncQueue.tsx`: `queuePageItem`
  - [ ] `FieldMap.tsx`: `orderPopupHtml`, `handleFullscreenMapKeyDown`, `restoreFullscreenMapFocus`
- [ ] **Validación:** suite completa de field-app en verde; commit; estado actualizado en `PLAN.md`

## Fase 3 — Comentarios y mapa del código

Política en `PLAN.md` → "Política de comentarios". Comentarios en español, explicando el porqué.

**field-app**
- [ ] `domain/`: cabeceras + porqué de cada política (elegibilidad de corte, excepciones GPS/foto, validación de captura)
- [ ] `ports/`: JSDoc de cada interfaz y método (contrato, errores, garantías)
- [ ] `use-cases/process.ts`: autorización online, de un solo uso e inmediata; resultado incierto no se repite
- [ ] `use-cases/sync.ts`: lease, `cutSendPhase`, ACK perdido → consulta de estado, sin last-write-wins
- [ ] `use-cases/reconnection.ts`: habilitación provisional y su vínculo orden/técnico/dispositivo/operación/versión
- [ ] `adapters/indexeddb/`: esquema de stores, transacciones atómicas, por qué se re-verifica antes del POST
- [ ] `adapters/http/client.ts`: mapeo de errores HTTP a errores de dominio
- [ ] `state/`: responsabilidad de cada archivo del store y flujo de una acción
- [ ] `bootstrap/runtime.ts` y `App.tsx`: modo simulado vs. backend piloto
- [ ] Cabecera en cada pantalla y componente no trivial

**backend**
- [ ] Cabecera en cada módulo de `application/` (o su ubicación tras la fase 5)
- [ ] Idempotencia de comandos (`command-idempotency.ts`): replay y conflicto de hash
- [ ] Autorización de corte y reconexión: consumo único y vigencia
- [ ] Sync: validación de evidencia dentro de la transacción de consumo
- [ ] `http-policy.ts`: CORS, origen y cabeceras de seguridad

**Mapa del código**
- [ ] Añadir a `docs/ARCHITECTURE.md` la sección "Mapa del código": carpeta → responsabilidad → archivo de entrada (field-app y backend)
- [ ] Añadir el recorrido de una orden: admin crea → asigna → técnico descarga → captura → autoriza → sync → auditoría, con archivo y función de cada paso
- [ ] Verificar que todas las rutas del mapa existen
- [ ] **Validación:** suites de ambos paquetes en verde (los comentarios no deben romper nada); commit; estado actualizado en `PLAN.md`

## Fase 4 — División de componentes grandes

Objetivo: ~300 líneas máximo por componente, sin cambiar markup, clases CSS ni textos.

- [ ] `screens/OperationsApp.tsx` → extraer a `components/`:
  - [ ] `DebtorSearchPanel.tsx` (búsqueda, filtros, selección)
  - [ ] `OrderCreationDialog.tsx` (creación individual/lote + asignación)
  - [ ] `AdminOrderPanel.tsx` (ficha de orden)
  - [ ] `AuditLogPanel.tsx`
- [ ] `screens/FieldApp.tsx` → extraer a `components/`:
  - [ ] `FieldHome.tsx` (inicio/resumen)
  - [ ] `OrderList.tsx` (lista y filtros)
  - [ ] `FieldBottomNav.tsx` (pestañas)
  - [ ] `CompactNetworkStatus.tsx`
- [ ] `components/FieldMap.tsx` → separar popup y controles de pantalla completa
- [ ] `App.tsx` → extraer guardia del botón atrás a `services/mobile-back-guard.ts` y resolución de modo/URL a `bootstrap/`
- [ ] Evaluar `adapters/indexeddb/repository.ts` (884) y `authority-repository.ts` (751); dividir solo si hay corte obvio por agregado, si no, anotar en "Hallazgos"
- [ ] **Validación:** suite completa de field-app + `smoke:ui` en verde; commit; estado actualizado en `PLAN.md`

## Fase 5 — Backend por tipo

**Movimiento sin cambios**
- [ ] `src/application.ts` → `src/http/application.ts`
- [ ] `src/http.ts` → `src/http/responses.ts`; `http-contracts.ts`, `application/http-policy.ts`, `application/auth/cookies.ts` → `src/http/`
- [ ] `application/projections/` → `src/mappers/` (`order.mapper.ts`, `debtor.mapper.ts`, `session.mapper.ts`, `command-response.mapper.ts`)
- [ ] `application/shared/` + `application/auth/rate-limiter.ts` → `src/shared/`
- [ ] `security-logger.ts` → `src/logging/`
- [ ] Handlers de cada módulo → `src/controllers/<modulo>.controller.ts`
- [ ] Decidir ubicación de `src/auth.ts` (hash/sesión → `services/` o `shared/`)
- [ ] Actualizar `package.json` (`start`, scripts), `Dockerfile`, `tsconfig.json` y tests con las rutas nuevas
- [ ] Validación + commit

**Router**
- [ ] Reemplazar la cadena de `if` por una tabla `{ method, pattern, handler }` en `src/http/router.ts`
- [ ] Test que compare la tabla con los endpoints de `openapi/pilot-provisional.openapi.json`
- [ ] Validación + commit

**Separación controller / service / repository** (un módulo por commit)
- [ ] `orders`
- [ ] `debtors`
- [ ] `audit`
- [ ] `auth`
- [ ] `evidence`
- [ ] `authorizations` (cut + reconexión)
- [ ] `sync`
- [ ] Verificar: ningún archivo de `controllers/` contiene `.query(`; ningún archivo de `repositories/` importa `node:http`

**Validación**
- [ ] `npx tsc --noEmit` · `npm run test:unit` · `npm run test:integration` · `npm run e2e:browser` en verde
- [ ] No existe `src/application/`
- [ ] Commit; estado actualizado en `PLAN.md`

## Fase 6 — CSS por tipo y deduplicación

- [ ] Capturas de referencia antes de tocar CSS: login, técnico (inicio, lista, detalle, captura, mapa, cola), admin (búsqueda, creación, ficha, auditoría); móvil y escritorio
- [ ] Inventario de `styles/app.css` por bloque: a qué pantalla/componente pertenece cada sección
- [ ] Crear un archivo por pantalla/componente en `styles/` y mover los bloques sin modificarlos
- [ ] `styles/app.css` queda solo con `@import` en el orden de cascada original
- [ ] Comparar capturas (sin diferencias) y commit
- [ ] Eliminar selectores duplicados archivo por archivo, comparando capturas en cada commit
- [ ] Eliminar reglas sin uso (clase no presente en ningún `.tsx`)
- [ ] Reemplazar colores directos por tokens solo cuando el valor coincide exactamente
- [ ] **Validación:** suite de field-app + `smoke:ui` + comparación visual sin diferencias; commit; estado actualizado en `PLAN.md`

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
- Fase 1: `utils/field-app-utils.ts` importa tipos de `state/` (`ActionKind`, `ActivityEntry`). Revisar en la fase 2 al repartir el archivo.
- Fase 1: `main.tsx` importa `adapters/browser/service-worker`; se considera punto de composición junto con `App.tsx` y `bootstrap/`.
- Fase 0: `npm run build` avisa de un chunk de ~507 kB (>500 kB). No bloquea; evaluar code-splitting fuera de este plan.
