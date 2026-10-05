# Backend del piloto provisional

API REST Node.js/TypeScript + PostgreSQL para validar el flujo administrativo y técnico. No es la API oficial de SEPSA ni debe recibir secretos institucionales o datos reales sin autorización.

## Desarrollo local

1. Copia `.env.example` a `.env` y configura `DATABASE_URL`.
2. Instala dependencias: `npm install`.
3. Levanta el servidor: `npm run dev`.

También puedes usar `docker compose up --build`; publica PostgreSQL en `15432` y la API en `8080` con valores provisionales.

## Datos y migraciones

- `npm run pilot:bootstrap` inicializa una base vacía, incluye `002_evidence_assets.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql`, y se niega a borrar datos existentes.
- `npm run pilot:field-test` importa un workbook mediante el script de carga.
- `npm run pilot:migrate:field-test` aplica la carga idempotente del dataset de prueba disponible.
- Compose ejecuta los SQL de inicialización solo al crear un volumen PostgreSQL vacío. Al iniciar la API, `scripts/apply-startup-schema-migrations.mjs` aplica `002_evidence_assets.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql` antes del servidor, también con volúmenes existentes. Las migraciones son idempotentes y requieren el esquema base instalado.
- Bootstrap y arranque usan listas explícitas; no aplican `003_payment_observations.sql`. No edites migraciones históricas para corregir datos actuales.
- El importador conserva filas originales y no inventa GPS, fechas o significados de columnas.

## Seguridad del piloto

- Configura `CORS_ORIGIN` con el origen exacto; no uses `*` fuera de desarrollo local.
- Las sesiones se validan en backend. No guardes contraseñas en texto plano ni credenciales de prueba fuera del entorno local.
- Las operaciones y autorizaciones usan identificadores/idempotencia; la auditoría conserva actor y resultado.
- La habilitación conectada de RECONNECTION es provisional y valida técnico asignado, orden, dispositivo, `operationId` y versión; no representa una decisión oficial de SEPSA.
- CUT, VISIT y RECONNECTION usan `/v1/sync/operations`; la reposición guarda fecha efectiva, snapshot del técnico y `DEMORA` en el payload de operación existente. No agrega tabla ni `cycleId`.
- Las fotos se guardan localmente y se cargan antes de sincronizar la acción; contrato y validación en [Corte y captura de campo](../docs/features/cuts.md) y [Sincronización](../docs/features/synchronization.md).

## Verificación

```powershell
npm run build
npm test
```

La integración de la API oficial, el contrato de evidencia y las políticas definitivas de SEPSA siguen pendientes.
