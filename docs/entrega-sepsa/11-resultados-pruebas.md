# 11. Resultados de pruebas

Fuente: `docs/entrega-sepsa/10-plan-pruebas.md` (suites y comandos), `backend/package.json`, `field-app/package.json`, `.github/workflows/ci.yml` (orden de pasos). Las salidas completas están guardadas en el entorno donde se ejecutó (no se versionan).
Fecha: 2026-10-13
Estado: entrega, copia fechada. Resultados parciales: las suites que necesitan una base PostgreSQL de prueba no se han ejecutado (sección 4). Las fuentes activas mandan; si este documento y una fuente difieren, se corrige este documento (decisión D021 en `docs/DECISIONS.md`).
Commit ejecutado: `da7af84`. En `backend/`, `field-app/` y `docs/entrega-sepsa/` no había cambios sin commitear al empezar.

## 1. Resumen

| Parte | Resultado |
|---|---|
| Backend sin base de datos: instalación, compilación, OpenAPI y pruebas unitarias | Pasa |
| Backend con base de datos: migración de prueba, pruebas completas y journey conectado | No ejecutado (sección 4) |
| Aplicación de campo: instalación, pruebas, build de producción, build simulado, humos de interfaz y PWA, guarda de humos | Pasa |

## 2. Entorno

| Elemento | Valor en esta ejecución | Referencia del CI (`ci.yml`) |
|---|---|---|
| Sistema operativo | Windows 11 Home 10.0.26200 | Ubuntu 24.04 |
| Node.js | v22.23.3, obtenido con `npx node@22` sin cambiar el Node del sistema | 22.12.0 |
| npm | 11.11.0 | No fijado |
| PostgreSQL | Servidor en `localhost:5432` que acepta conexiones (cliente `psql` 18.3; versión del servidor no consultada), sin credenciales de prueba configuradas. El servidor de `backend/.env` (`localhost:15432`) no responde | `postgres:16.4-alpine` |
| Navegador | Chrome instalado en la ruta por defecto; los humos usan Chrome o Edge | Chromium en el runner |
| `VITE_PILOT_BACKEND_URL` | Vacía en todos los pasos de `field-app` | Vacía en el job `field-app` |

Una primera tanda de comandos se ejecutó con npm lanzado por el Node del sistema (v24.14.1). Su npm arranca los scripts con su propio Node, así que esa tanda no cumplía el entorno de referencia. Se descartó entera y todos los resultados de este documento se repitieron bajo Node 22.23.3.

## 3. Resultados por comando

Los identificadores S1 a S13 son los de la tabla de suites de `10-plan-pruebas.md`.

| ID | Comando (directorio) | Código de salida | Resultado |
|---|---|---|---|
| — | `npm ci` (backend) | 0 | Instalación limpia; npm reporta 0 vulnerabilidades |
| — | `npm ci` (field-app) | 0 | Instalación limpia; npm reporta 0 vulnerabilidades |
| S5 | `npm run build` (backend) | 0 | Compila sin errores |
| S6 | `JSON.parse` de `openapi/pilot-provisional.openapi.json` (backend) | 0 | JSON válido |
| S1 | `npm run test:unit` (backend) | 0 | 55 pruebas, 55 pasan, 0 fallan |
| S3 | `npm test` (backend), sin `DATABASE_URL` | 1 | 59 pruebas: 57 pasan y 2 fallan. Los dos fallos son `db.integration.test.ts` y `cut-consume.integration.test.ts`, que se niegan a correr sin `DATABASE_URL` ("DATABASE_URL is required…"). No es un fallo funcional verificado; ver sección 4 |
| S4 | `npm run db:migrate:test` (backend), sin `DATABASE_URL` | 1 | El script se niega a correr: "DATABASE_URL is required for test database migrations". Ver sección 4 |
| S8 | `npm test -- --run` (field-app) | 0 | 45 archivos, 485 pruebas, todas pasan |
| S9 | `npm run build` (field-app, sin modo simulado) | 0 | Build correcto. Ningún archivo de `dist/assets/*.js` contiene marcadores de simulación |
| S10 | `npm run build` (field-app) con `VITE_ENABLE_SIMULATION=true` | 0 | Build correcto |
| S13 | `npm run test:smoke-guard` (field-app) | 0 | 1 de 1 pasa. Este comando no está en el CI |
| S11 | `npm run smoke:ui` (field-app) | 0 | 17 de 17 verificaciones con `"passed": true` |
| S12 | `npm run smoke:pwa` (field-app) | 0 | Respuesta HTTP 200 de la vista previa; service worker activo y controlando la página; con la red cortada, una visita queda guardada como pendiente; al volver la red se sincroniza sola (un evento `online`, sin sincronización manual) y la operación queda en estado `synced` |

## 4. No ejecutado y causa

| Suite | Motivo | Qué hace falta para ejecutarla |
|---|---|---|
| S4, `npm run db:migrate:test` | No hay `DATABASE_URL` de prueba. El script rechaza hosts no locales y exige una URL definida | Una base PostgreSQL local aislada, distinta de la de desarrollo, y su `DATABASE_URL` |
| S2 y la parte de S3 con `db.integration.test.ts` y `cut-consume.integration.test.ts` | Dependen de la base migrada por S4 | Lo mismo que S4 |
| S7, `npm run e2e:browser` | Requiere la base migrada y un navegador headless. Su paso previo S4 no se ejecutó | Lo mismo que S4, más Chrome o Chromium en `CHROME_PATH` si no está en la ruta por defecto |
| Base de desarrollo de `backend/.env` (`localhost:15432`) | El servidor no responde. Docker no está en marcha | Iniciar el servicio de base de desarrollo, si se quiere usar. No se usó para las pruebas |

No se usó el servidor en `localhost:5432`. No hay credenciales de prueba en el repositorio y no se intentaron otras.

Las suites S2, S3 (parte con base), S4 y S7 quedan sin resultado. Ningún resultado de ellas se ha inferido de otra ejecución.

## 5. Observaciones

- **Migración de prueba incompleta.** `backend/scripts/migrate-test-db.mjs` aplica 6 de los 7 archivos de `backend/sql/`. No aplica `003_payment_observations.sql`. Ningún archivo de `backend/src`, `backend/scripts`, `backend/migrations`, `backend/test` ni `field-app/src` referencia la tabla `payment_observations`, así que la omisión no rompe ninguna prueba que se haya ejecutado. La tabla es de pagos, fuera del alcance activo según `docs/RULES.md`. El commit que la introdujo (`2b1922d`) se titula "feat(pilot): harden sessions and gate cuts on payments". Ningún documento deja escrita la intención de excluirla de la migración de prueba; queda por confirmar con el equipo.
- **Glob de pruebas del backend.** `npm test` ejecuta 59 pruebas repartidas en los 14 archivos de `backend/test/`. El conteo se obtiene de la salida del runner, no de la tabla de `10`.
- **Humos sin base de datos.** `smoke:ui` y `smoke:pwa` usan un perfil temporal y el build simulado. No necesitan PostgreSQL.
- **Adelanto anterior.** La entrada de F5.5 en `10` (2026-10-12) decía que `smoke:ui` había pasado 17 de 17 en una copia limpia. Esta ejecución la sustituye; el resultado coincide.

## 6. Estado de la fase

Esta fase no está cerrada. Faltan las suites S2, S3 (completa), S4 y S7, que dependen de una base PostgreSQL de prueba. Cuando esa base esté disponible, se ejecutan en este orden: `npm run db:migrate:test`, `npm test` y `npm run e2e:browser`, todos con su `DATABASE_URL`. Después se actualizan las filas correspondientes de esta tabla con fecha, código de salida y conteos.
