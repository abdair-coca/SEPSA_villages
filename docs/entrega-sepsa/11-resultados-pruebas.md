# 11. Resultados de pruebas

Fuente: ejecución de los comandos del plan de pruebas sobre el repo.
Fecha: 2026-10-13
Estado: entrega, copia fechada. La primera ejecución fue sin base de datos; la segunda añade las suites con PostgreSQL local. Las salidas completas no se versionan.

Sin cambios sin commitear en las carpetas probadas.

## 1. Resumen

| Parte | Resultado |
|---|---|
| Servidor sin base de datos: instalación, compilación, OpenAPI y pruebas unitarias | Pasa |
| Servidor con base de datos y recorrido conectado | No ejecutado |
| App de campo: instalación, pruebas, builds, humos de interfaz y PWA | Pasa |

## 2. Entorno

Windows 11. Node.js v22.23.3 (`npx node@22`, sin cambiar el Node del sistema; la referencia del CI es 22.12.0). npm 11.11.0. PostgreSQL responde en `localhost:5432`, pero la versión no se consultó y no hay credenciales de prueba configuradas. Una primera tanda con Node v24.14.1 se descartó por no cumplir la referencia.

## 3. Resultados

| Suite | Comando | Código | Resultado |
|---|---|---|---|
| — | `npm ci` (servidor y app) | 0 | 0 vulnerabilidades reportadas |
| S5 | `npm run build` (servidor) | 0 | Sin errores |
| S6 | Validación del JSON de OpenAPI | 0 | JSON válido |
| S1 | `npm run test:unit` (servidor) | 0 | 55 pruebas, todas pasan |
| S3 | `npm test` (servidor), sin `DATABASE_URL` | 1 | 57 pasan y 2 fallan porque se niegan a correr sin base. No es un fallo funcional verificado |
| S4 | `npm run db:migrate:test`, sin `DATABASE_URL` | 1 | Se niega a correr sin base de prueba |
| S8 | `npm test -- --run` (app) | 0 | 45 archivos, 485 pruebas, todas pasan |
| S9 | `npm run build` (app, sin simulación) | 0 | Correcto |
| S10 | `npm run build` (app, con simulación) | 0 | Correcto |
| S13 | `npm run test:smoke-guard` | 0 | 1 de 1 pasa |
| S11 | `npm run smoke:ui` | 0 | 17 de 17 verificaciones pasan |
| S12 | `npm run smoke:pwa` | 0 | Con la red cortada, la visita queda pendiente; al volver la red se sincroniza sola |

## 4. No ejecutado

- **S4, S2 y la parte con base de S3:** falta una base PostgreSQL local aislada, distinta de la de desarrollo.
- **S7, `npm run e2e:browser`:** requiere la base migrada y un navegador headless.
- **Base de desarrollo:** el servicio de `localhost:15432` no responde.

No se usó el servidor en `localhost:5432` porque no hay credenciales de prueba en el repo. Ningún resultado se ha inferido de otra ejecución.

## 5. Observaciones

- La migración de prueba aplica 6 de los 7 archivos de `backend/sql/`. No aplica `003_payment_observations.sql`. Ninguna prueba ejecutada depende de esa tabla. Queda por confirmar que la omisión es intencional.
- `smoke:ui` y `smoke:pwa` usan un perfil temporal y el build simulado. No necesitan PostgreSQL.

Para cerrar la fase, hay que ejecutar en este orden, con una base de prueba: `npm run db:migrate:test`, `npm test` y `npm run e2e:browser`.

## 6. Segunda ejecución, con PostgreSQL local (2026-10-13)

Sin cambios sin commitear en `backend/`, `field-app/` ni `docs/`. PostgreSQL 18.3 en `127.0.0.1:55432`, base aislada creada para la prueba y distinta de la de desarrollo. Servidor con Node.js v22.23.3 (`npx node@22`); el recorrido en navegador se ejecutó con el Node del sistema (v24.14.1) y Chrome instalado, y no se repitió con Node 22.

| Suite | Comando | Código | Resultado |
|---|---|---|---|
| S4 | `npm run db:migrate:test` | 0 | Migraciones aplicadas |
| S2, S3 | `npm test` (servidor) | 0 | 69 pruebas, todas pasan (incluye `permissions.integration.test.ts`, `cut-consume.integration.test.ts` y `db.integration.test.ts`) |
| S7 | `npm run e2e:browser` | 0 | Resultado `passed`: 10 comprobaciones (acceso del administrador, orden y asignación, visita sin conexión, recarga, sincronización y auditoría, corte desde la interfaz con foto y GPS sintéticos, respuesta de consumo perdida reintentada con la misma operación, reconexión y evidencia en PostgreSQL) |
| S8 | `npm test -- --run` (app) | 0 | 45 archivos, 488 pruebas, todas pasan |
| — | Arranque idempotente: `apply-startup-schema-migrations.mjs` y `20261002-role-grants.mjs`, dos veces | 0 | `orders`, `users`, `debtors`, `audit_events`, `cut_authorizations` y `sessions` sin cambios (conteo y huella) |

La carga del Excel ya no forma parte del arranque (D026), por lo que no se probó en esa ejecución. Con los datos sintéticos de la prueba no se comprobó nada sobre producción.

## 7. Revisión final (2026-10-13)

Los cambios sin commitear de otra tarea (`AppHeader`, `OperationsApp` y estilos) aparecieron después de estas ejecuciones y no forman parte de ellas.

| Suite | Comando | Código | Resultado |
|---|---|---|---|
| S8 | `npm test -- --run` (app) | 0 | 45 archivos, 490 pruebas, todas pasan (incluye las dos pruebas de doble toque de `store.test.tsx`) |
| — | `npx tsc --noEmit` (app) | 0 | Sin errores |
| S9 | `npm run build` (app, producción) | 0 | Sin `tech-camila`, `device-rugged-01`, `seedE2eData`, `SIMULATED_AUTHORITY` ni `dirección simulada` en `dist/assets/*.js` |
| — | `npm run test:smoke-guard` | 0 | 1 de 1 |
| S11–S12 | `npm run smoke:ui` y `npm run smoke:pwa`, con build simulado (`VITE_PILOT_BACKEND_URL` vacío y `VITE_ENABLE_SIMULATION=true`) | 0 | Ambos pasan |
| S1 | `npm run test:unit` (servidor), y `npm run build` del servidor | 0 | 55 de 55 pruebas |
| — | Lectura JSON de `openapi/pilot-provisional.openapi.json` | 0 | Válido |

**No ejecutado:** `npm test` del servidor (S2, S3) y `npm run e2e:browser` (S7). La base de prueba en `127.0.0.1:55432` no respondía y esta revisión no tiene sus credenciales. Quedan pendientes; CI los ejecuta al subir los cambios.

## 8. Registro del técnico desde otro dispositivo (2026-10-14)

Pruebas de RF-36 (D029). Se ejecutaron con el código de `1115fb3` y con PostgreSQL local del contenedor de desarrollo (`localhost:15432`), en la base aislada `pilot_phase_registry` migrada con `npm run db:migrate:test`. La base de desarrollo no se usó.

| Suite | Comando | Código | Resultado |
|---|---|---|---|
| S1 | `npm run test:unit` (servidor) | 0 | 59 pruebas, todas pasan; incluye el mapeo del registro, que no expone el token de autorización |
| — | `npm run test:integration` (servidor, con PostgreSQL) | 0 | 3 pruebas, todas pasan: `db.integration`, `technician-record.integration` y `evidence-read.integration` |
| — | `npx tsc --noEmit` (servidor y app) | 0 | Sin errores |
| S8 | `npx vitest run` (app) | 0 | 47 archivos, 511 pruebas, todas pasan |
| S9 | `npm run build` (app, producción, conectada al servidor) | 0 | Correcto, con el código de `1115fb3` |
| S11 | `npm run smoke:ui` | 0 | 17 de 17 verificaciones pasan. Se ejecutó tras la fase 1; no se repitió tras la fase 2 |
| S7 | `npm run e2e:browser` (con PostgreSQL local aislado) | 0 | `passed`: 10 comprobaciones del flujo previo al registro (acceso, asignación, visita sin conexión, recarga, sincronización y auditoría, corte con foto y GPS, reconexión, evidencia en PostgreSQL). No cubre el registro del técnico ni sus fotos |

**Prueba en navegador (manual, no automatizada).** Se usó el build de producción y el backend aislado:

| Paso | Resultado |
|---|---|
| Visita con una foto JPEG de 640 × 420 px (19 283 bytes) | Confirmada por el servidor. La foto queda en `evidence_assets` con el SHA-256 del archivo original |
| Registro de la orden antes de registrar la visita | «Sin registros en el servidor» |
| Dispositivo nuevo: almacenamiento local borrado, otro identificador de dispositivo | El registro muestra la visita, su excepción y su fecha de confirmación. «Estado local» vacío |
| Ver la foto desde el dispositivo nuevo | La foto se muestra y la comprobación de SHA-256 pasa |
| Una apertura del registro en el build de producción | Una fila de auditoría `TECHNICIAN_RECORD_READ`. En desarrollo aparecen dos, por `StrictMode` |
| Consola del navegador | Sin errores |

**Verificación manual del responsable del proyecto (2026-10-14):** la prueba con dos dispositivos físicos y la vista móvil con ancho de teléfono real. El agente de desarrollo no las ejecutó; el resultado es el informado por el responsable.

**Automatizado:** `npm run e2e:browser` se volvió a ejecutar y pasó sus 10 comprobaciones. No cubre el registro del técnico ni sus fotos; esas se cubren con las pruebas de integración y la prueba en navegador de esta sección.
