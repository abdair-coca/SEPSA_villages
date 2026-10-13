# 10. Plan de pruebas

Fuente: `backend/package.json`, `field-app/package.json`, `field-app/vite.config.ts`, `.github/workflows/ci.yml`, `backend/test/`, `field-app/src/`, `field-app/scripts/`, `backend/scripts/`, `docs/RULES.md` (sección "Antes de entregar").
Fecha: 2026-10-13
Estado: entrega, copia fechada. Las fuentes activas mandan; si este documento y una fuente difieren, se corrige este documento (decisión D021 en `docs/DECISIONS.md`).

Este documento describe cómo se prueba el piloto provisional: qué suites existen, qué ejecuta cada una, qué necesita y en qué parte del CI corre. Los resultados obtenidos en una ejecución concreta están en [11-resultados-pruebas.md](11-resultados-pruebas.md). Lo que depende de SEPSA aparece en [14-pendientes-sepsa.md](14-pendientes-sepsa.md).

## 1. Estrategia

Las pruebas se organizan en seis niveles, de más interno a más externo:

1. **Dominio y casos de uso del backend.** Reglas de autorización, contrato del piloto, consulta de morosos, reconexión y arquitectura (dependencias entre capas).
2. **Persistencia en PostgreSQL.** Pruebas de integración contra una base local migrada con los scripts del repo.
3. **Dominio, casos de uso y estado de la aplicación de campo.** Reglas de política, cola de operaciones, reintentos, reconexión y arquitectura de dependencias, con IndexedDB simulada.
4. **Componentes y pantallas de la aplicación de campo.** Pruebas de React con Vitest.
5. **Humo en navegador real.** Flujo administrador y técnico en pantalla, y cola offline con recuperación de la PWA.
6. **Journey conectado.** Backend real con PostgreSQL, aplicación de campo y navegador headless en un solo flujo.

Principios que siguen las suites (de [RULES.md](../RULES.md), "Antes de entregar"):

- Cada cambio de comportamiento, estado, permiso, persistencia o sincronización añade o ajusta pruebas.
- Los casos críticos prueban el camino feliz y, al menos, un fallo relevante: offline, reinicio, reintento, duplicado, conflicto o autorización incierta. Qué casos existen y cuáles faltan se detalla en las secciones siguientes de este documento.
- Los humos de navegador usan perfiles temporales (`mkdtempSync` o `tmpdir()` en `field-app/scripts/ui-smoke.mjs` y `pwa-smoke.mjs`), no el perfil del usuario.

## 2. Suites y comandos

Todos los comandos se ejecutan dentro de la carpeta indicada. Los nombres de script son los de `backend/package.json` y `field-app/package.json`.

| # | Suite | Qué prueba | Comando | Requisitos | Dónde corre en el CI |
|---|---|---|---|---|---|
| S1 | Backend, unitarias | Casos de uso, HTTP, router, contrato del piloto, reconexión, consulta de morosos, arquitectura | `npm run test:unit` (en `backend/`) | Node 22 | No se ejecuta aparte; está incluida en S3 |
| S2 | Backend, integración | Persistencia contra PostgreSQL y paginación de auditoría (`backend/test/db.integration.test.ts`) | `npm run test:integration` (en `backend/`) | `DATABASE_URL` local con migraciones aplicadas | No se ejecuta aparte; está incluida en S3 |
| S3 | Backend, completa | Todos los archivos de `backend/test/*.test.ts`: los de S1 y S2, más `cut-consume.integration.test.ts` y `local-database-guard.test.ts`, que solo corren aquí | `npm test` (en `backend/`) | `DATABASE_URL` local con migraciones aplicadas | Job `backend-postgres`, paso "npm test" |
| S4 | Migración de prueba | Aplica a la base de prueba los scripts SQL del piloto | `npm run db:migrate:test` (en `backend/`) | `DATABASE_URL` local; el script rechaza hosts no locales (`backend/scripts/local-database-guard.mjs`) | Job `backend-postgres`, antes de S3 |
| S5 | Compilación del backend | Compilación TypeScript sin errores | `npm run build` (en `backend/`) | Node 22 | Job `backend-postgres`, después de S3 |
| S6 | OpenAPI | El archivo `openapi/pilot-provisional.openapi.json` es JSON válido | `node -e "JSON.parse(require('node:fs').readFileSync('openapi/pilot-provisional.openapi.json','utf8'))"` (en `backend/`; es un paso del CI, no un script npm) | Node 22 | Job `backend-postgres`, paso "Validate OpenAPI JSON" |
| S7 | Journey conectado | Backend real, aplicación de campo y navegador headless en un flujo completo | `npm run e2e:browser` (en `backend/`) | `DATABASE_URL` local migrada; Chrome o Chromium (`CHROME_PATH`) | Job `backend-postgres`, último paso |
| S8 | Aplicación de campo, unitarias y de integración | Reglas de política, cola y sincronización, reconexión, IndexedDB (con `fake-indexeddb`), componentes React, arquitectura | `npm test -- --run` (en `field-app/`) | Node 22 | Job `field-app`, paso "npm test -- --run" |
| S9 | Compilación de producción | Compilación TypeScript y Vite sin el modo simulado. El CI además verifica que `dist/assets/*.js` no contenga marcadores de simulación | `npm run build` (en `field-app/`, sin `VITE_ENABLE_SIMULATION`) | Node 22 | Job `field-app`, paso "Production build without the simulated mode (D023)" |
| S10 | Compilación con simulación | Genera el build que usan los humos de navegador | `npm run build` con `VITE_ENABLE_SIMULATION=true` (en `field-app/`) | Node 22 | Job `field-app`, paso "Smoke build with the simulated mode" |
| S11 | Humo de interfaz | Flujo administrador (vista responsive) y flujo de campo en Chrome o Edge | `npm run smoke:ui` (en `field-app/`) | Build de S10; Chrome o Edge (`CHROME_PATH`) | Job `field-app`, paso "Browser smoke for responsive admin and field flow" |
| S12 | Humo PWA | Cola offline y recuperación de la PWA | `npm run smoke:pwa` (en `field-app/`) | Build de S10; Chrome (`CHROME_PATH`) | Job `field-app`, paso "Browser smoke for offline queue and PWA recovery" |
| S13 | Guarda de los scripts de humo | Comprueba la lógica de `scripts/smoke-build.mjs` (verificación de build simulado) | `npm run test:smoke-guard` (en `field-app/`) | Node 22 | **No está en el CI** |

Notas sobre los comandos:

- En `field-app/`, `npm test` sin `--run` abre Vitest en modo de observación. El CI usa `npm test -- --run` para que termine y devuelva un código de salida.
- En `backend/`, la clave `test` expande `test/**/*.test.ts` con el shell. La lista exacta de archivos que ejecuta se confirma en F5.2 con la salida real, no con esta tabla.
- La configuración de Vitest de la aplicación de campo (`field-app/vite.config.ts`) incluye `src/**/*.test.ts` y `src/**/*.test.tsx`. Los scripts de `field-app/scripts/` no entran en S8; solo en S13 y en los humos.
- Los archivos `*.integration.test.ts` de la aplicación de campo se ejecutan con S8. El sufijo es una convención de nombre, no una suite aparte.

## 3. Entorno de referencia

El CI define el entorno de referencia. Cualquier ejecución que se documente en [11-resultados-pruebas.md](11-resultados-pruebas.md) debe indicar si sigue esta referencia o no.

| Elemento | Valor en CI (`.github/workflows/ci.yml`) |
|---|---|
| Sistema operativo | Ubuntu 24.04 |
| Node.js | 22.12.0 |
| PostgreSQL | imagen `postgres:16.4-alpine`, base `phase5`, host `127.0.0.1:5432` |
| `DATABASE_URL` | Apunta a esa base local; las credenciales son de prueba y sintéticas |
| `VITE_PILOT_BACKEND_URL` | Vacío en el job `field-app`; los modos de ejecución se describen en [03-arquitectura-tecnologias.md](03-arquitectura-tecnologias.md) |

## 4. Orden de ejecución

Orden de los pasos en el CI, que es el orden de referencia para una ejecución completa.

Backend (job `backend-postgres`):

1. `npm ci` en `backend/`.
2. `npm run db:migrate:test` (S4).
3. `npm test` (S3).
4. `npm run build` (S5).
5. Validación del JSON de OpenAPI (S6).
6. `npm ci` en `field-app/`, necesario para el journey.
7. `npm run e2e:browser` (S7).

Aplicación de campo (job `field-app`):

1. `npm ci` en `field-app/`.
2. `npm test -- --run` (S8).
3. `npm run build` sin simulación (S9), con la comprobación de marcadores.
4. `npm run build` con `VITE_ENABLE_SIMULATION=true` (S10).
5. `npm run smoke:ui` (S11).
6. `npm run smoke:pwa` (S12).

## 5. Observaciones de la estrategia

Estas observaciones se verifican en F4.2 y F5. No son resultados.

- **Migración de prueba incompleta.** `backend/scripts/migrate-test-db.mjs` aplica seis archivos de `backend/sql/`. No aplica `003_payment_observations.sql`, que sí existe en la carpeta. Hay que confirmar si la omisión es intencional (la tabla de observaciones de pagos es legado, ver [05-diccionario-datos.md](05-diccionario-datos.md)) y si alguna prueba depende de ella.
- **Suite de scripts fuera del CI.** S13 no se ejecuta en el CI, aunque protege la verificación de build simulado que usan S11 y S12.
- **Chrome requerido para los humos.** S7, S11 y S12 necesitan un navegador instalado. Si no hay navegador, el paso falla antes de probar la aplicación; el fallo se registra como "no ejecutado" en [11-resultados-pruebas.md](11-resultados-pruebas.md), no como fallo funcional.
- **Vacíos de cobertura.** Los requisitos con cobertura parcial o sin cobertura están en la sección 7.

## 6. Catálogo de archivos de prueba

Cubre los 60 archivos de prueba y los 4 scripts de humo y de journey que hay en el repo. La columna "Títulos" cuenta las líneas que empiezan por `test(` o `it(`: no ejecuta nada y no incluye subpruebas con otro nombre. El número de casos realmente ejecutados lo registra [11-resultados-pruebas.md](11-resultados-pruebas.md).

El conteo de archivos cambió desde el commit base de la entrega (`f534f5c`), que tenía 55 archivos de prueba. Cinco se añadieron después con D022 a D024: `AdminReconciliation.test.tsx`, `NewAuthorizationAction.test.tsx`, `SyncQueue.test.tsx`, `new-authorization.test.ts` y `error-catalog.coverage.test.ts`.

| Archivo | Suite | Títulos | Qué cubre |
|---|---|---|---|
| `backend/test/application.test.ts` | S1, S3 | 23 | Login con cookie HttpOnly, sesiones, orígenes y cabeceras, límite de login, verificación de evidencia, reenvío idempotente, revisión ADMIN, operaciones legacy |
| `backend/test/architecture.test.ts` | S1, S3 | 4 | Reglas de dependencia del backend: controladores sin SQL, repositorios sin HTTP |
| `backend/test/auth.test.ts` | S1, S3 | 2 | Hash de contraseña con scrypt y tokens opacos guardados solo como digest |
| `backend/test/config.test.ts` | S1, S3 | 3 | Valores por defecto de sesión (7 días), cookies y límite de login |
| `backend/test/cut-consume.integration.test.ts` | S3 | 1 | Consumo de autorización de corte al confirmar (D020), replay, auditoría, conciliación y 403 para técnico |
| `backend/test/db.integration.test.ts` | S2, S3 | 1 | Paginación de `/v1/audit` y de órdenes del técnico contra PostgreSQL; versiones de paquete tras reinicio |
| `backend/test/debtor-queries.test.ts` | S1, S3 | 1 | Criterios de búsqueda de morosos: placeholders SQL alineados |
| `backend/test/http.test.ts` | S1, S3 | 3 | Parser JSON con límite de bytes, credenciales bearer, cabeceras anti-caché |
| `backend/test/local-database-guard.test.ts` | S3 | 2 | Guarda que solo acepta hosts locales de PostgreSQL |
| `backend/test/pilot-contract.test.ts` | S1, S3 | 6 | Fixtures y respuestas reales contra los esquemas del contrato OpenAPI |
| `backend/test/reconnection.test.ts` | S1, S3 | 4 | Habilitación de reconexión ligada, auditable e idempotente; técnico no asignado; versión obsoleta; orden sin corte confirmado |
| `backend/test/role-switch.test.ts` | S1, S3 | 4 | Cambio de rol entre roles concedidos, auditoría y rollback si falla la auditoría |
| `backend/test/router.test.ts` | S1, S3 | 3 | La tabla de rutas y el OpenAPI listan los mismos endpoints |
| `backend/test/server.test.ts` | S1, S3 | 2 | Arranque del servidor TypeScript y del código compilado |
| `backend/scripts/connected-browser-smoke.ts` | S7 | — | Journey conectado: backend con PostgreSQL, aplicación de campo y navegador headless |
| `field-app/src/App.role-switch.test.tsx` | S8 | 3 | Cambio de rol: confirmación, sin clics duplicados, recuperación tras respuesta perdida |
| `field-app/src/adapters/browser/connectivity.test.ts` | S8 | 5 | Estados online, débil y offline; notificación de cambios |
| `field-app/src/adapters/browser/session-persistence.test.ts` | S8 | 5 | Sesión sin token persistido; el usuario recordado no guarda contraseña |
| `field-app/src/adapters/http/client.test.ts` | S8 | 16 | Cliente HTTP: cookies, cambio de rol, filtros, consumo de autorización (D020), errores inciertos, paquete alterado |
| `field-app/src/adapters/indexeddb/authority-repository.integration.test.ts` | S8 | 16 | Repositorio de autoridad en IndexedDB: morosos, lotes idempotentes, asignación versionada, auditoría, propiedad de dispositivos |
| `field-app/src/adapters/indexeddb/repository.integration.test.ts` | S8 | 16 | Repositorio local: migración v1 a v2, borradores, cola con CAS, arrendamientos, paquetes y escrituras atómicas |
| `field-app/src/adapters/mock/retry.test.ts` | S8 | 4 | Reintentos del adaptador simulado; el consumo físico no se reintenta |
| `field-app/src/architecture.test.ts` | S8 | 8 | Reglas de dependencia de la aplicación de campo |
| `field-app/src/bootstrap/runtime.test.ts` | S8 | 4 | Composición: operaciones aceptadas, rechazo confirmado como revisión manual, reasignación |
| `field-app/src/components/AdminReconciliation.test.tsx` | S8 | 1 | Lista de operaciones por conciliar, sin acciones para el administrador |
| `field-app/src/components/AppHeader.test.tsx` | S8 | 5 | Barra superior compartida, estado y menú de cuenta |
| `field-app/src/components/NewAuthorizationAction.test.tsx` | S8 | 1 | Nueva autorización solo si el servidor probó que la anterior no se usó |
| `field-app/src/components/SyncQueue.test.tsx` | S8 | 2 | Verificar en vez de reintentar una reconexión o un corte no confirmados |
| `field-app/src/components/common/ExitConfirmationModal.test.tsx` | S8 | 1 | Diálogo de salida con mensaje de datos guardados |
| `field-app/src/components/common/Modal.test.tsx` | S8 | 3 | Diálogo accesible y bloqueo de cierre |
| `field-app/src/components/common/Notification.test.tsx` | S8 | 5 | Notificaciones por tono, accesibles, cierre automático en móvil |
| `field-app/src/components/common/PaginationControls.test.tsx` | S8 | 4 | Controles de paginación y sus límites |
| `field-app/src/components/common/SearchField.test.tsx` | S8 | 6 | Campo de búsqueda: etiqueta estable, limpieza, estado ocupado |
| `field-app/src/components/common/UiState.test.tsx` | S8 | 5 | Estados de carga, error recuperable y vacío |
| `field-app/src/domain/policies.test.ts` | S8 | 12 | Políticas de dominio: operaciones asignadas, transiciones físicas, evidencia, lectura, GPS, orden activa |
| `field-app/src/ports/authorization.test.ts` | S8 | 3 | Clasificación de errores de autorización por código, no por texto |
| `field-app/src/screens/FieldApp.test.tsx` | S8 | 34 | Pantallas de campo: estados de finalización, cola, revisión, filtros, mapa y actividad |
| `field-app/src/screens/LoginScreen.test.tsx` | S8 | 3 | Login: envío duplicado, reintento, usuario recordado sin contraseña |
| `field-app/src/screens/OperationsApp.requests.test.tsx` | S8 | 17 | Administración: búsquedas y cargas obsoletas, creación y asignación, lote parcial |
| `field-app/src/screens/OperationsApp.test.tsx` | S8 | 6 | Selección y diálogo de creación masiva |
| `field-app/src/services/capture-gps-request.test.ts` | S8 | 7 | Solicitud GPS: espera de 15 s y callbacks obsoletos |
| `field-app/src/services/map-cache.test.ts` | S8 | 6 | Caché de mapa: teselas y cajas; sin ruta inventada |
| `field-app/src/services/mobile-back-guard.test.ts` | S8 | 3 | Protección del botón atrás en móvil |
| `field-app/src/state/evidence.test.ts` | S8 | 6 | Reducción de fotos a los límites de tamaño y resolución; bloqueo si ningún intento cabe |
| `field-app/src/state/field-commands.test.ts` | S8 | 2 | Sincronizar la cola antes de refrescar órdenes |
| `field-app/src/state/new-authorization.test.ts` | S8 | 3 | Repetir un corte o una reconexión inciertos sin recapturar; no tocar la operación si el servidor no prueba que no se usó |
| `field-app/src/state/store.test.tsx` | S8 | 23 | Estado de la app: borradores, visita offline atómica, cortes con autorización no concluyente, auto-sincronización |
| `field-app/src/use-cases/auth.test.ts` | S8 | 4 | Autenticación, sesión de 7 días, migración de credenciales de demostración |
| `field-app/src/use-cases/process.integration.test.ts` | S8 | 20 | Visita y corte: autorización bloqueada, PHYSICAL_UNKNOWN, duplicados, CAS |
| `field-app/src/use-cases/reconnection.integration.test.ts` | S8 | 21 | Reconexión: habilitación, consumo con esperas de 1 s y 3 s, resultados inciertos |
| `field-app/src/use-cases/sync.integration.test.ts` | S8 | 21 | Sincronización: búsqueda exacta tras respuesta perdida, conflictos, subida de evidencia, autorizaciones |
| `field-app/src/use-cases/vertical-flow.integration.test.ts` | S8 | 1 | Flujo completo: administración, captura, autorización, sincronización y auditoría |
| `field-app/src/utils/capture-wizard.test.ts` | S8 | 3 | Asistente de captura: avance bloqueado tras un fallo de borrador |
| `field-app/src/utils/dialog-lifecycle.test.ts` | S8 | 21 | Ciclo de diálogos: foco, inert, bloqueo de página, diálogos anidados |
| `field-app/src/utils/error-catalog.coverage.test.ts` | S8 | 2 | Cada código de error de dominio y de cola tiene texto propio |
| `field-app/src/utils/error-catalog.test.ts` | S8 | 7 | Mensajes de error: qué pasó, qué quedó guardado y el siguiente paso |
| `field-app/src/utils/filters.test.ts` | S8 | 3 | Opciones de filtros: normalización y dependencias entre áreas y localidades |
| `field-app/src/utils/format.test.ts` | S8 | 5 | Formato de coordenadas y escape de texto dinámico |
| `field-app/src/utils/pagination.test.ts` | S8 | 4 | Paginación de órdenes y de datos secundarios |
| `field-app/src/utils/sorting.test.ts` | S8 | 3 | Orden de la actividad y de la cola |
| `field-app/scripts/smoke-build.test.mjs` | S13 | 1 | Guarda de build: verificación del build simulado |
| `field-app/scripts/smoke-build.mjs` | S11, S12 (auxiliar) | — | Funciones compartidas que verifican el build simulado antes de los humos |
| `field-app/scripts/ui-smoke.mjs` | S11 | — | Humo de interfaz: flujo administrador y de campo en Chrome o Edge |
| `field-app/scripts/pwa-smoke.mjs` | S12 | — | Humo PWA: cola offline y recuperación |

## 7. Cobertura por requisito

Cada requisito `RF-xx` de [01-requisitos-funcionales-tecnicos.md](01-requisitos-funcionales-tecnicos.md) aparece aquí con los casos que lo cubren. Las tres marcas significan:

- **Cubierto:** hay casos que ejercitan el comportamiento del requisito.
- **Parcial:** hay casos, pero falta una parte del requisito. La parte que falta está escrita.
- **Sin cobertura:** no hay ningún caso. Si la función no existe, se indica.

Los casos se citan por archivo y por el inicio de su título. Los archivos están en la sección 6.

| RF | Casos | Estado |
|---|---|---|
| RF-01 | `application.test.ts` (login devuelve cookie HttpOnly); `role-switch.test.ts` (cambio solo entre roles concedidos); `client.test.ts` (cambio de rol por cookie) | Cubierto |
| RF-02 | `policies.test.ts` (limita operaciones a órdenes asignadas); `authority-repository.integration.test.ts` (autoriza acciones técnicas solo para la asignación vigente); `reconnection.test.ts` (rechaza técnico no asignado) | Cubierto |
| RF-03 | `client.test.ts` (envía todos los filtros administrativos); `authority-repository.integration.test.ts` (filtra morosos por facturas pendientes y estado); `debtor-queries.test.ts` | Cubierto |
| RF-04 | `OperationsApp.requests.test.tsx` (crea una orden, la asigna y refresca); `authority-repository.integration.test.ts` (crear y asignar separadas, idempotentes y versionadas) | Cubierto |
| RF-05 | `authority-repository.integration.test.ts` (deduplica órdenes activas por cuenta y propósito); `policies.test.ts` (encuentra la orden activa e ignora las canceladas); `OperationsApp.requests.test.tsx` (recuperación de orden duplicada sin crear otra) | Cubierto |
| RF-06 | `authority-repository.integration.test.ts` (asignación versionada; una versión esperada obsoleta da `ORDER_VERSION_CONFLICT`) | Cubierto |
| RF-07 | `OperationsApp.requests.test.tsx` (crea y asigna el lote informando omitidos); `OperationsApp.test.tsx` (bloquea la creación si faltan suministros seleccionados); `authority-repository.integration.test.ts` (lote atómico, auditado e idempotente) | Cubierto |
| RF-08 | `authority-repository.integration.test.ts` (auditoría de transiciones con valores antes y después); `cut-consume.integration.test.ts` (acciones de autorización, consumo y sincronización auditadas); `role-switch.test.ts` (auditoría de roles) | Cubierto |
| RF-09 | Ninguno. La anulación no está implementada; el backend solo expone `ANULADO` en la respuesta | Sin cobertura |
| RF-10 | `OperationsApp.requests.test.tsx` (se detiene tras el primer fallo de asignación; rechazo de creación sin asignar ni refrescar); `reconnection.test.ts` (versión obsoleta rechazada) | Parcial: la conservación del conflicto para revisión se prueba en la interfaz; no hay prueba de backend que la fije |
| RF-11 | `repository.integration.test.ts` (sobrevive a cerrar y reabrir con el último paquete válido); `client.test.ts` (rechaza un paquete alterado antes de persistirlo); `FieldApp.test.tsx` (lista de órdenes asignadas y elegibilidad de acciones) | Cubierto |
| RF-12 | `store.test.tsx` (visita offline atómica que sobrevive a un nuevo arranque); `sync.integration.test.ts` (visitas bloqueadas como VISIT); `store.test.tsx` (bloquea corte offline y registra visita) | Cubierto |
| RF-13 | `policies.test.ts` (solo órdenes asignadas y transiciones válidas); `process.integration.test.ts` (no consume una segunda operación obsoleta); `store.test.tsx` (rechaza visita manual tras corte confirmado) | Cubierto |
| RF-14 | `policies.test.ts` (exige lectura que coincida con el medidor esperado; exige lectura) | Parcial: no hay prueba de lectura negativa ni de rechazo de unidad distinta de kWh |
| RF-15 | `policies.test.ts` (precisión GPS finita y no negativa; coordenadas inválidas rechazadas); `capture-gps-request.test.ts` (conserva el motivo de excepción) | Cubierto |
| RF-16 | `evidence.test.ts` (reduce hasta 5 MP y el límite del servidor; bloquea si ningún intento cabe); `policies.test.ts` (evidencia de imagen válida o motivo de excepción); `application.test.ts` (verifica bytes en el servidor) | Parcial: se prueba la re-codificación hacia un objetivo; el valor de 1 000 000 bytes no aparece como literal en las pruebas |
| RF-17 | `process.integration.test.ts` (pide autorización de corte con la versión autoritativa; bloquea timeout y unknown); `cut-consume.integration.test.ts` (consumo al confirmar); `mock/retry.test.ts` (no reintenta el consumo físico y rechaza reutilizar el token) | Cubierto |
| RF-18 | `process.integration.test.ts` (visita bloqueada con el código del backend; respuesta unknown como visita pendiente); `store.test.tsx` (conserva el borrador si la autorización no es concluyente); `client.test.ts` (consumo incierto para HTTP 5xx) | Cubierto |
| RF-19 | `reconnection.integration.test.ts` (esperas de 1 s y 3 s, deja la operación incierta si se pierden todos los intentos); `reconnection.integration.test.ts` (recupera el consumo incierto con el mismo id tras confirmar la reserva); `sync.integration.test.ts` (consume la reserva con el mismo id) | Parcial: los 15 s de espera (`CONSUME_TIMEOUT_MS`, `client.ts`) no tienen prueba que fije el valor |
| RF-20 | `repository.integration.test.ts` (revierte operación, orden y cola juntas si falla una escritura); `store.test.tsx` (no reemplaza el borrador ni la cola si falla su guardado) | Cubierto |
| RF-21 | `process.integration.test.ts` (respuesta perdida queda como PHYSICAL_UNKNOWN; solo se consulta por operationId); `FieldApp.test.tsx` (muestra revisión de PHYSICAL_UNKNOWN sin acción de repetir) | Cubierto |
| RF-22 | `policies.test.ts` (lectura, GPS y tipo de corte); `capture-wizard.test.ts` (lectura de corte separada de los ajustes) | Parcial: los umbrales de validación están pendientes de SEPSA y no tienen prueba |
| RF-23 | `reconnection.integration.test.ts` (exige EJECUTADO y habilitación externa, persiste una vez); `reconnection.integration.test.ts` (sincroniza el mismo id sin incrementar la versión otra vez); `reconnection.test.ts` (rechaza una orden sin corte confirmado) | Cubierto |
| RF-24 | `reconnection.integration.test.ts` y `client.test.ts` (conservan `effectiveAt`, nombre del técnico y `demora`) | Cubierto |
| RF-25 | `reconnection.test.ts` (habilitación y sincronización ligadas, auditables e idempotentes); `reconnection.test.ts` (una operación nueva reemplaza una reserva no consumida, no una reconexión consumida); `reconnection.integration.test.ts` (versión autoritativa con CAS local) | Cubierto |
| RF-26 | `reconnection.integration.test.ts` (recupera el intento persistido por habilitación y lo mantiene fuera de la consulta de sincronización); `reconnection.integration.test.ts` (habilitación ausente como not_found, incierta, sin envío); `reconnection.integration.test.ts` (conserva la causa original si la reserva expiró) | Cubierto |
| RF-27 | Ninguno sobre cargos ni prioridad. `reconnection.integration.test.ts` (no expone ni procesa pagos) no fija la regla, que está pendiente (P-01) | Sin cobertura |
| RF-28 | `repository.integration.test.ts` (deduplica el mismo id; sostiene un arrendamiento y lo recupera tras expirar); `SyncQueue.test.tsx` (reintento solo para confirmadas pendientes de sincronizar); `FieldApp.test.tsx` (recorre estados de la cola sin mutarla) | Cubierto |
| RF-29 | `repository.integration.test.ts` (sobrevive a cerrar y reabrir); `store.test.tsx` (restaura campos parciales del corte tras reabrir); `store.test.tsx` (sincroniza una vez al recuperar la conexión) | Cubierto |
| RF-30 | `sync.integration.test.ts` (sube los bytes antes del corte y reintenta la subida de forma idempotente); `application.test.ts` (acepta el corte solo tras verificar la evidencia); `application.test.ts` (rechaza el corte si falta la subida) | Cubierto |
| RF-31 | `sync.integration.test.ts` (reconcilia una respuesta perdida con una sola búsqueda, sin segundo envío); `sync.integration.test.ts` (not_found queda incierto y no se reenvía); `process.integration.test.ts` (respuesta perdida como PHYSICAL_UNKNOWN) | Cubierto |
| RF-32 | `application.test.ts` (la revisión ADMIN registra la operación con CAS y auditoría, sin confirmarla); `application.test.ts` (técnico, versión obsoleta y motivo vacío no pueden registrar la revisión) | Cubierto |
| RF-33 | `repository.integration.test.ts` (revierte operación, orden y cola juntas); `store.test.tsx` (visita offline atómica) | Parcial: la atomicidad se prueba; no hay prueba explícita de que las transiciones sean append-only |
| RF-34 | `error-catalog.test.ts` (explica qué pasó, qué quedó guardado y el siguiente paso); `FieldApp.test.tsx` (distingue completado confirmado, guardado, bloqueado e incierto) | Cubierto |
| RF-35 | `db.integration.test.ts` (lee `/v1/audit` con token de ADMIN y pagina); `role-switch.test.ts` y `cut-consume.integration.test.ts` (403 para técnico en otros endpoints de administración) | Parcial: no hay prueba de 403 para técnico sobre `/v1/audit` |
| RF-36 | `new-authorization.test.ts` (repite un corte o una reconexión inciertos con la misma captura); `NewAuthorizationAction.test.tsx` (ofrece nueva autorización solo tras prueba de no uso) | Cubierto |
| RF-37 | `cut-consume.integration.test.ts` (`/v1/admin/reconciliation`: ADMIN recibe la lista y el técnico recibe 403); `AdminReconciliation.test.tsx` (lista sin acciones para el administrador) | Cubierto. El endpoint no aparece en `pilot-contract.md` (discrepancia F3.0.4) |

## 8. Criterios de aceptación propuestos

Estos criterios son una propuesta del equipo. SEPSA todavía no los ha aprobado. Cada criterio cita su requisito y la prueba que lo verifica hoy. Los criterios que dependen de una regla pendiente de SEPSA lo indican en su texto.

CA-01 · RF-01 · Un usuario con un solo rol no puede cambiar de rol, aunque el cliente envíe roles adicionales. Prueba: `role-switch.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-02 · RF-02 · Un técnico solo lee y opera órdenes asignadas a su identidad, y el backend lo impone. Prueba: `policies.test.ts`, `authority-repository.integration.test.ts`, `reconnection.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-03 · RF-05 · No se crea una segunda orden activa para el mismo suministro y propósito; la orden existente se consulta. Prueba: `authority-repository.integration.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-04 · RF-06 · Una asignación con versión esperada obsoleta no sobrescribe la asignación vigente. Prueba: `authority-repository.integration.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-05 · RF-17 y RF-18 · Sin autorización concluyente, vigente y de un solo uso inmediatamente antes del corte, no hay corte; timeout, unknown y rechazo quedan bloqueados con su código. Prueba: `process.integration.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-06 · RF-19 · Un consumo con resultado incierto se reintenta con el mismo `operationId` y token, con esperas de 1 s y 3 s, y nunca pide una autorización nueva. Prueba: `reconnection.integration.test.ts`, `sync.integration.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-07 · RF-20 · Una visita o un corte se guardan localmente antes de mostrar éxito, y si falla una escritura no queda nada a medias. Prueba: `repository.integration.test.ts`, `store.test.tsx`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-08 · RF-21 y RF-31 · Una operación con respuesta perdida queda como PHYSICAL_UNKNOWN, se consulta solo por `operationId` y nunca se reenvía el POST. Prueba: `process.integration.test.ts`, `sync.integration.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-09 · RF-30 · El backend acepta un corte solo si la evidencia está verificada y ligada a esa operación. Prueba: `application.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-10 · RF-25 y RF-26 · Una reconexión solo se confirma con una habilitación de un solo uso ligada a orden, técnico, dispositivo, operación y versión, y la cola de sincronización no la consulta ni la reintenta. Prueba: `reconnection.test.ts`, `reconnection.integration.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-11 · RF-32 · La revisión humana de una operación incierta exige motivo y versión esperada, y no confirma el corte ni reenvía el POST. Prueba: `application.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-12 · RF-28 y RF-29 · Una operación no sale de la cola sin confirmación válida y sobrevive a recarga y reinicio. Prueba: `repository.integration.test.ts`, `SyncQueue.test.tsx`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-13 · RF-37 · El administrador ve las operaciones por conciliar en solo lectura, y el técnico recibe 403 al consultarlas. Prueba: `cut-consume.integration.test.ts`, `AdminReconciliation.test.tsx`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-14 · RF-34 · Cada mensaje de error dice qué quedó guardado y cuál es el siguiente paso. Prueba: `error-catalog.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-15 · RF-14 y RF-15 · Un corte sin lectura final, sin GPS o sin evidencia (y sin excepción justificada) no puede confirmarse. Los umbrales de validación siguen pendientes. Prueba: `policies.test.ts`. Estado: Propuesta, pendiente de aprobación de SEPSA.

CA-16 · RF-36 · Tras una autorización incierta, la nueva autorización solo se pide si el servidor probó que la anterior no se usó, y el técnico lo confirma. Prueba: `new-authorization.test.ts`, `NewAuthorizationAction.test.tsx`. Estado: Propuesta, pendiente de aprobación de SEPSA.

## 9. Escenarios de fallo críticos

Las reglas de [RULES.md](../RULES.md) piden probar, antes de entregar, el caso feliz y al menos un fallo relevante: offline, reinicio, reintento, duplicado, conflicto o autorización incierta. Además, la interfaz debe distinguir guardado local, sincronización y resultado remoto, y los permisos deben validarse en la capa autoritativa.

| Escenario | Casos | Estado |
|---|---|---|
| Offline | `sync.integration.test.ts` (no funciona offline y conserva la cola pendiente); `store.test.tsx` (bloquea el corte offline y registra solo visita); `reconnection.integration.test.ts` (no autoriza ni ejecuta reconexión offline) | Cubierto |
| Reinicio | `repository.integration.test.ts` (sobrevive a cerrar y reabrir con cola durable); `store.test.tsx` (restaura campos parciales del corte tras reabrir); `store.test.tsx` (la visita offline sobrevive a un nuevo arranque) | Cubierto |
| Reintento | `reconnection.integration.test.ts` (recupera el consumo incierto con el mismo id tras confirmar la reserva); `sync.integration.test.ts` (reintenta la subida interrumpida de forma idempotente); `mock/retry.test.ts` (tres intentos en el adaptador simulado) | Cubierto |
| Duplicado | `repository.integration.test.ts` (deduplica el mismo `operationId` en reclamos repetidos); `process.integration.test.ts` (no crea duplicados para un `operationId` ya registrado); `application.test.ts` (replay idempotente que no consume la autorización dos veces) | Cubierto |
| Conflicto | `sync.integration.test.ts` (conserva versiones local y remota como conflicto); `sync.integration.test.ts` (ack con id distinto queda incierto y no se reintenta un conflicto de revisión manual); `authority-repository.integration.test.ts` (conflicto de propiedad de dispositivo) | Cubierto |
| Autorización incierta | `process.integration.test.ts` (respuesta perdida como PHYSICAL_UNKNOWN, solo consulta por id); `sync.integration.test.ts` (autorización expirada, rechazada, no encontrada o unknown deja el corte incierto e intacto); `FieldApp.test.tsx` (revisión de PHYSICAL_UNKNOWN sin acción de repetir) | Cubierto |
| Distinción en la interfaz | `FieldApp.test.tsx` (distingue completado confirmado, guardado, bloqueado e incierto); `error-catalog.test.ts` (qué quedó guardado y el siguiente paso) | Cubierto |
| Permisos en la capa autoritativa | `application.test.ts` (el técnico no puede leer el catálogo administrativo); `cut-consume.integration.test.ts` (403 para técnico en `/v1/admin/reconciliation`); `reconnection.test.ts` (técnico no asignado: 403) | Cubierto |
| Consumo de autorización sin concluir tras reintentos | `reconnection.integration.test.ts` (si todos los intentos se pierden, la operación queda incierta y no se envía) | Cubierto |
| Conflicto de versión en el backend al asignar | `authority-repository.integration.test.ts` (`ORDER_VERSION_CONFLICT`) | Cubierto |
| Fallo de la escritura local en medio de una operación | `repository.integration.test.ts` (revierte operación, orden y cola juntas) | Cubierto |
| Respuesta de sincronización con el id de otra operación | `sync.integration.test.ts` (ack con id distinto queda incierto) | Cubierto |
| Auditoría que falla durante un cambio de rol | `role-switch.test.ts` (el cambio se revierte y el reintento sigue siendo posible) | Cubierto |
| Borrado de datos locales al cerrar sesión o perder el equipo | `session-persistence.test.ts` (limpia la sesión y conserva el usuario recordado) | Parcial: no hay prueba de qué datos de trabajo se borran localmente |
