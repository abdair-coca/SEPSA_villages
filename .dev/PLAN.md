# Plan de limpieza estructural

Estado: **activo**. Checklist de ejecución: [`.dev/TASK.md`](TASK.md).

## Objetivo

Que un ingeniero pueda entender y mantener el sistema **manualmente, sin agentes de código**: encontrar dónde vive cada cosa por su carpeta, leer archivos de tamaño razonable y entender el porqué de las reglas críticas desde el propio código.

## Restricción principal

**Ninguna fase cambia funcionalidad.** Solo se mueven, renombran, dividen o comentan archivos. Si durante una fase aparece un bug o una mejora, se anota en la sección "Hallazgos" de `.dev/TASK.md` y se resuelve en una tarea aparte, nunca dentro de la fase.

## Reglas para todas las fases

1. Una fase = una rama o una serie de commits pequeños; cada commit deja todo en verde.
2. Mover archivos con `git mv` para conservar el historial.
3. No cambiar nombres de símbolos exportados (componentes, funciones, tipos) salvo que la fase lo indique.
4. No cambiar textos visibles, endpoints, contratos HTTP, esquemas de IndexedDB ni SQL aplicado.
5. Antes de cada commit, ejecutar la validación de la fase (ver abajo).
6. Al terminar una fase, marcar sus casillas en `.dev/TASK.md` y actualizar el estado en la tabla de fases de este documento.

### Validación estándar

| Paquete | Comandos |
|---|---|
| field-app | `npx tsc --noEmit` · `npx vitest run` · `npm run build` · `npm run smoke:ui` · `npm run smoke:pwa` (los tres últimos con `VITE_PILOT_BACKEND_URL=""`, como en CI) |
| backend | `npx tsc --noEmit` · `npm run test:unit` · `npm run test:integration` · `npm run e2e:browser` (los dos últimos con `DATABASE_URL` de un PostgreSQL aislado y `npm run db:migrate:test` previo; nunca la base del `.env`) |

Una fase que solo toca un paquete valida ese paquete; si toca contratos o arranque, valida ambos.

## Criterio de organización: por tipo

El código se organiza **por tipo técnico** (pantallas, componentes, estado, casos de uso, adaptadores, utilidades, estilos), no por funcionalidad. El núcleo hexagonal existente (`domain`, `ports`, `adapters`) se conserva porque ya es correcto.

### Convenciones de nombres

- Componentes React: `PascalCase.tsx` (`OrderDetail.tsx`, `CaptureForm.tsx`).
- Resto de archivos TypeScript: `kebab-case.ts` (`map-cache.ts`, `format-date.ts`).
- Tests junto al archivo que prueban: `Nombre.test.tsx`, `nombre.test.ts`, `nombre.integration.test.ts`.
- Backend: sufijo por tipo: `orders.controller.ts`, `orders.service.ts`, `orders.repository.ts`, `order.mapper.ts`.
- Sin barrels `index.ts` que reexporten carpetas enteras con `export *`; cada import apunta al archivo real, para que "ir a la definición" sea obvio sin herramientas.

### Estructura objetivo — field-app

```
field-app/src/
├── main.tsx                 Punto de entrada: monta React, registra el Service Worker, carga estilos
├── App.tsx                  Selección de modo (simulado/backend), sesión y pantalla según rol
├── domain/                  Reglas puras y tipos. No importa nada del proyecto ni React.
│   ├── types.ts
│   ├── policies.ts
│   └── errors.ts
├── ports/                   Contratos (interfaces) entre casos de uso y adaptadores
├── use-cases/               (antes application/) Casos de uso: corte, visita, sync, reconexión, descarga, admin, auth
├── adapters/                Implementaciones concretas de los ports
│   ├── http/                Cliente del backend piloto
│   ├── indexeddb/           Persistencia local y cola durable
│   ├── browser/             Conectividad, almacenamiento de sesión, Service Worker
│   └── mock/                Autorización y transporte simulados
├── state/                   (antes app/) Store de la app de campo: store, acciones, sync, resultados, evidencia, comandos compuestos
├── bootstrap/               (antes app/runtime.ts) Construcción de stores y paquetes demo/autenticados
├── services/                Servicios de navegador sin UI: caché de mapas, petición GPS
├── screens/                 Pantallas completas (una por rol/ruta)
│   ├── FieldApp.tsx         Pantalla del técnico
│   ├── OperationsApp.tsx    Pantalla del administrador
│   └── LoginScreen.tsx
├── components/              Componentes con lógica de negocio visible
│   ├── AppHeader.tsx
│   ├── OrderDetail.tsx
│   ├── CaptureForm.tsx
│   ├── SyncQueue.tsx
│   ├── FieldMap.tsx
│   ├── ...                  (subcomponentes extraídos en la fase 4)
│   └── common/              Primitivas genéricas sin conocimiento del dominio
│       ├── Modal.tsx · Notification.tsx · SearchField.tsx
│       ├── PaginationControls.tsx · UiState.tsx · Icons.tsx
│       └── BrandLockup.tsx · ExitConfirmationModal.tsx
├── utils/                   Funciones puras de presentación
│   ├── format.ts            Fechas, montos, ids cortos, coordenadas, valores vacíos, textos largos
│   ├── labels.ts            Etiquetas de estados y acciones
│   ├── sorting.ts           Ordenamientos y conteos de órdenes, actividad y cola
│   ├── pagination.ts        Paginación de listas en pantalla
│   ├── filters.ts           Opciones y coincidencia de filtros del administrador
│   ├── capture-wizard.ts    Pasos y recuperación del asistente de captura
│   └── dialog-lifecycle.ts  Foco, teclado y tema de diálogos (incluido el mapa a pantalla completa)
└── styles/                  CSS por tipo: tokens, controles, shell, y un archivo por pantalla/componente
```

Regla de dependencias (se verifica con un test en la fase 1):

```
screens → components → (state, utils, services) → use-cases → ports ← adapters
                                                       ↓
                                                    domain   (no depende de nadie)
```

- `domain` no importa nada del proyecto.
- `use-cases` importan solo `domain` y `ports`.
- `components/common` no importa `domain`, `state` ni `use-cases`.
- Solo los puntos de composición (`main.tsx`, `App.tsx`, `bootstrap/`) conocen adaptadores concretos.
- Ninguna capa interna (`domain`, `ports`, `use-cases`, `adapters`, `state`, `bootstrap`, `services`, `utils`) importa `screens/` ni `components/`.
- Lo verifica `field-app/src/architecture.test.ts`; las excepciones conocidas están listadas allí con su motivo.

### Estructura objetivo — backend

```
backend/src/
├── server.ts                Arranque del servidor HTTP
├── config.ts                Lectura y validación de variables de entorno
├── db.ts                    Pool y transacciones de PostgreSQL
├── types.ts                 Tipos compartidos (usuario de sesión, etc.)
├── http/
│   ├── application.ts       Pipeline: request id, cabeceras, CORS, errores
│   ├── router.ts            Tabla única endpoint → controlador
│   ├── responses.ts         (antes http.ts) sendJson, errores, parseo de cuerpo
│   ├── http-policy.ts       CORS, origen, cabeceras de seguridad
│   ├── http-contracts.ts
│   └── cookies.ts
├── controllers/             Solo HTTP: parsear, validar forma, llamar al servicio, responder
│   └── auth · orders · debtors · authorizations · evidence · sync · audit (.controller.ts)
├── services/                Reglas de negocio: roles, duplicados, idempotencia, auditoría, autorización
│   └── auth · orders · debtors · authorizations · evidence · sync · audit (.service.ts)
├── repositories/            Solo SQL
│   └── users · orders · debtors · authorizations · evidence · sync · audit · commands (.repository.ts)
├── mappers/                 (antes projections/) Fila SQL → JSON de respuesta
├── shared/                  Idempotencia de comandos, digest, paginación, validación, rate limiter
└── logging/
    └── security-logger.ts
```

Regla de dependencias: `controllers → services → repositories → db`. Un controlador nunca ejecuta SQL; un repositorio nunca conoce `IncomingMessage`/`ServerResponse` ni `HttpError` de negocio.

## Política de comentarios

No se comenta línea por línea. Se escriben tres tipos de comentario, en español:

1. **Cabecera de archivo** (3–6 líneas) en cada archivo no trivial: qué hace, quién lo usa, qué *no* hace.
2. **Invariantes críticos (el porqué)** junto al código que los aplica: autorización de corte de un solo uso, lease de la cola, `cutSendPhase`, ACK perdido y consulta de estado, idempotencia por `operation_id`, conflicto de versión sin last-write-wins, excepciones controladas de GPS/foto.
3. **JSDoc en `ports/`** y en las funciones públicas de `use-cases/` y `services/`: contrato, errores posibles y garantías.

El detalle de reglas sigue en `docs/`; el comentario enlaza al documento en vez de copiarlo.

## Fases

| # | Fase | Paquete | Riesgo | Estado |
|---|---|---|---|---|
| 0 | Cierre del refactor actual y limpieza | ambos | Bajo | Hecha |
| 1 | Reorganización por tipo de field-app | field-app | Bajo | Hecha |
| 2 | Utilidades y reglas en su capa | field-app | Bajo | Hecha |
| 3 | Comentarios y mapa del código | ambos | Nulo | Hecha |
| 4 | División de componentes grandes | field-app | Medio | Hecha |
| 5 | Backend por tipo (controller/service/repository) | backend | Medio | Hecha |
| 6 | CSS por tipo y deduplicación | field-app | **Alto** | Hecha (por sección, no por componente; ver Hallazgos de la fase 6 en `TASK.md`) |
| 7 | Higiene del repositorio y migraciones | repo | Medio | Pendiente |

Ejecutar en orden. Las fases 3 y 4 pueden alternarse, pero la 6 va siempre después de la 4 (los estilos se reparten según los componentes finales).

### Fase 0 — Cierre del refactor actual y limpieza

**Objetivo:** partir de un `main` limpio y en verde.

- Validar y commitear el refactor sin commitear (división de `application.ts`, `FieldApp.tsx`, `store.ts`).
- Eliminar artefactos locales (`backend/cookies2.txt`, `backend/scripts/__pycache__/`, `field-app/vite.log`) y añadirlos a `.gitignore`.
- Decidir qué hacer con `.agents/` y `.opencode/` (ignorar o versionar).

**Hecho cuando:** `git status` limpio, todo en verde, `.gitignore` cubre los artefactos.

### Fase 1 — Reorganización por tipo de field-app

**Objetivo:** que la carpeta diga qué tipo de cosa contiene. Solo movimientos e imports.

- Mover según la estructura objetivo (`application/` → `use-cases/`, `app/` → `state/` + `bootstrap/` + `services/`, `ui/` → `screens/` + `components/` + `components/common/` + `utils/` + `styles/`).
- Aplicar la convención de nombres (`order-detail.tsx` → `OrderDetail.tsx`, etc.).
- `session-persistence.ts` va a `adapters/browser/` (es almacenamiento del navegador); `pwa.ts` va a `adapters/browser/service-worker.ts`.
- Reemplazar los barrels `export *` por imports directos.
- Añadir un test de arquitectura que falle si se rompe la regla de dependencias.

**Hecho cuando:** no queda `ui/`, `app/` ni `application/`; el test de arquitectura pasa; validación de field-app en verde.

### Fase 2 — Utilidades y reglas en su capa

**Objetivo:** eliminar el cajón de sastre `field-app-utils.ts` y sacar reglas de negocio de la UI.

- Repartir `field-app-utils.ts` en `utils/format.ts`, `utils/labels.ts` y `utils/sorting.ts`.
- Mover reglas de negocio a `domain/policies.ts` (`isManualVisitAllowed` y cualquier otra que decida qué puede hacer el usuario).
- Mover helpers puros exportados desde pantallas (`getAdminOrderPage`, `formatAdminCoordinates`, `getMissingOrderCreationDebtorIds`, `queuePageItem`, `paginateReviewFields`, `cutCompletionOutcome`…) a `utils/` o `domain/` según corresponda, junto con sus tests.

**Hecho cuando:** ninguna pantalla o componente exporta funciones puras de negocio; validación de field-app en verde.

### Fase 3 — Comentarios y mapa del código

**Objetivo:** que el código se explique solo.

- Aplicar la política de comentarios a `domain/`, `ports/`, `use-cases/`, `adapters/indexeddb/`, `state/` y al backend.
- Añadir a `docs/ARCHITECTURE.md` una sección "Mapa del código": carpeta → responsabilidad → archivo de entrada, y el recorrido de una orden de punta a punta (admin crea → técnico descarga → captura → autorización → sync → auditoría) indicando archivo y función de cada paso.

**Hecho cuando:** cada archivo no trivial tiene cabecera; cada invariante crítico tiene su porqué; el mapa existe y sus rutas son correctas.

### Fase 4 — División de componentes grandes

**Objetivo:** ningún componente o módulo de UI por encima de ~300 líneas sin justificación.

- `OperationsApp.tsx` (653): extraer búsqueda de morosos, diálogo de creación/asignación, panel de orden y auditoría a `components/`.
- `FieldApp.tsx` (716): extraer inicio, lista de órdenes, navegación inferior y estado de red.
- `FieldMap.tsx` (556): separar popup, controles de pantalla completa y capa de teselas.
- `App.tsx` (263): extraer el guardia del botón atrás y la resolución de modo a `bootstrap/`/`services/`.
- Evaluar (sin obligación) `adapters/indexeddb/repository.ts` (884) y `authority-repository.ts` (751): separar por agregado solo si el corte es obvio.

**Hecho cuando:** los archivos objetivo bajan de ~300 líneas o tienen una cabecera que justifica el tamaño; validación de field-app y `smoke:ui` en verde.

### Fase 5 — Backend por tipo

**Objetivo:** separar HTTP, reglas y SQL.

- Mover sin cambios a la estructura objetivo (`application/` → `controllers/`, `projections/` → `mappers/`, `application.ts` y helpers HTTP → `http/`).
- Convertir la cadena de `if` del router en una tabla única en `http/router.ts`.
- Por módulo, de a uno por commit, en este orden: `orders`, `debtors`, `audit`, `auth`, `evidence`, `authorizations`, `sync`. Extraer el SQL a `repositories/` y las reglas a `services/`; el controlador queda solo con HTTP.
- Las transacciones (`withTransaction`) se abren en el servicio y se pasan al repositorio.

**Hecho cuando:** ningún controlador contiene SQL; la tabla de rutas lista todos los endpoints de `openapi/pilot-provisional.openapi.json`; validación de backend completa en verde (incluida integración y E2E).

### Fase 6 — CSS por tipo y deduplicación

**Objetivo:** reemplazar `styles.css` (~9.900 líneas) por archivos pequeños y sin sobrescrituras.

- Capturar referencia visual antes de empezar (`smoke:ui`, móvil y escritorio, ambos roles, estados principales).
- Repartir en `styles/`: `tokens.css`, `controls.css`, `shell.css` y un archivo por pantalla y componente.
- Eliminar selectores duplicados y reglas muertas; reemplazar colores directos por tokens solo donde el valor coincide.
- Comparar capturas antes/después en cada commit.

**Hecho cuando:** `styles.css` no existe o solo importa los demás; ninguna diferencia visual no intencionada; validación de field-app en verde.

### Fase 7 — Higiene del repositorio y migraciones

**Objetivo:** que la raíz y `docs/` solo contengan material vigente.

- Migraciones: antes de renombrar, revisar cómo se registran las aplicadas (`scripts/apply-startup-schema-migrations.mjs`, `migrate-test-db.mjs`, `bootstrap-pilot.mjs`, Dockerfile, CI). Si el nombre de archivo se usa como identificador en una base ya desplegada, **no renombrar**: documentar el orden en un README de `sql/`.
- Separar seeds (`*_seed.sql`, `006_replace-…`) del esquema.
- Ordenar `docs/`: archivar el `.docx` con nombre de prompt, el PDF y `constitution.md` (o enlazarlos desde el router si son vigentes).
- Archivar `boceto-mvp/` en `docs/archive/` o eliminarlo si ya no aporta.

**Hecho cuando:** la raíz contiene solo `backend/`, `field-app/`, `docs/` y archivos de configuración; el orden de migraciones está documentado; validación de backend en verde.

## Fuera de alcance

- Cambios de funcionalidad, textos visibles, contratos HTTP o esquema de datos.
- Nuevas dependencias (salvo, si se justifica, una herramienta de comparación visual para la fase 6).
- Integración oficial con SEPSA y pendientes `TODO: VALIDAR CON SEPSA`.
