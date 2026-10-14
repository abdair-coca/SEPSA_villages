# 11. Resultados de pruebas

Fuente: ejecución de los comandos del plan de pruebas sobre el repo.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Resumen de tres ejecuciones; comandos, códigos y salidas completos en el anexo A11. Las salidas completas no se versionan.

## 1. Resumen

| Parte | Resultado |
|---|---|
| Servidor sin base de datos: instalación, compilación, OpenAPI y pruebas unitarias | Pasa |
| Servidor con PostgreSQL local (segunda ejecución) | Pasa: 69 pruebas, migraciones y recorrido en navegador (10 comprobaciones) |
| App de campo: pruebas, builds, humos de interfaz y PWA | Pasa; última revisión: 490 pruebas |

## 2. Ejecuciones

- **Primera (sin base de datos):** pasan la instalación, la compilación, el JSON de OpenAPI, 55 pruebas unitarias del servidor, 485 pruebas de la app, los builds (con y sin simulación), la guarda de los scripts de humo, 17 de 17 verificaciones de interfaz y el humo de PWA. Sin `DATABASE_URL`, las suites de base de datos se niegan a correr.
- **Segunda (PostgreSQL 18.3 local, base aislada):** pasan las migraciones de prueba, 69 pruebas del servidor, el recorrido en navegador (acceso, orden, visita sin conexión, recarga, sincronización, corte con foto y GPS sintéticos, respuesta perdida reintentada con la misma operación, reconexión y evidencia en PostgreSQL) y 488 pruebas de la app. El arranque idempotente no cambió los conteos ni las huellas de las tablas críticas.
- **Revisión final:** 490 pruebas de la app, `tsc` sin errores, build de producción sin marcadores de simulación, humos con build simulado, 55 pruebas del servidor y OpenAPI válido. Commits `7354101` (código) y `b89bfa5` (documentos).

## 3. No ejecutado

- `npm test` del servidor (S2, S3) y `npm run e2e:browser` (S7) en la revisión final: la base de prueba no respondía y esa revisión no tenía sus credenciales. CI los ejecuta al subir los cambios.
- Ninguna prueba usa la base de desarrollo. Ningún resultado se ha inferido de otra ejecución.

## 4. Observaciones

- La migración de prueba aplica 6 de los 7 archivos de `backend/sql/`; no aplica `003_payment_observations.sql`. Ninguna prueba depende de esa tabla; queda confirmar que la omisión es intencional.
- `smoke:ui` y `smoke:pwa` usan un perfil temporal y el build simulado; no necesitan PostgreSQL.
- Para cerrar la fase con base de prueba, ejecutar en este orden: `npm run db:migrate:test`, `npm test` y `npm run e2e:browser`.
