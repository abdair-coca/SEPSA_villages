# SQL del piloto provisional

Orden real de los scripts de `backend/sql/`, de los `.mjs` de `backend/migrations/` y de las listas que los ejecutan. El piloto ya está en uso y el [runbook](../../docs/operations/pilot-runbook.md) describe volúmenes y bases existentes.

## Reglas

- **Los nombres no se cambian.** El arranque, el bootstrap y el runbook identifican cada migración por su nombre de archivo. Renombrar obligaría a cambiar ese historial.
- **No se edita SQL aplicado** ([RULES.md](../../docs/RULES.md): no modificar migraciones históricas para corregir datos actuales). Un cambio nuevo va en un archivo nuevo con el siguiente número libre (`009_…`). Si debe aplicarse en despliegues existentes, se añade también a `scripts/apply-startup-schema-migrations.mjs`.
- `seeds/` contiene datos de prueba, no esquema. Ningún seed se ejecuta al arrancar la API.

## Archivos

| Archivo | Contenido | Añadido | Lo ejecuta |
|---|---|---|---|
| `001_init.sql` | Esquema base | 2026-09-13 · `3f9c58e` | bootstrap, Compose, pruebas |
| `002_evidence_assets.sql` | Evidencias fotográficas | 2026-09-30 · `869ab20` | **arranque**, bootstrap, Compose, pruebas |
| `003_reference_fields.sql` | Columnas de referencia para bases creadas antes de ampliar `001_init` | 2026-09-13 · `defbb83` | bootstrap, Compose, pruebas |
| `003_payment_observations.sql` | Observaciones de pago, solo inserción | 2026-09-30 · `2b1922d` | ninguno (intencional) |
| `007_work_package_versions.sql` | Versiones de paquete por técnico y dispositivo | 2026-09-30 · `54e3159` | **arranque**, bootstrap, pruebas |
| `007_role_grants.sql` | Grants de roles y `sessions.active_role` | 2026-10-02 · `77ca9a2` | `migrations/20261002-role-grants.mjs` (**arranque**, condicional), bootstrap, Compose, pruebas |
| `008_reconnection_schema.sql` | Esquema de RECONEXIÓN | 2026-10-04 · `f50fc64` | **arranque**, bootstrap, pruebas |
| `seeds/002_seed.sql` | Usuarios de prueba | 2026-09-13 · `3f9c58e` | bootstrap, Compose |
| `seeds/004_e2e_seed.sql` | Vacío a propósito (deprecado) | 2026-09-13 · `c84b84a` | bootstrap, Compose |

**arranque** = `scripts/apply-startup-schema-migrations.mjs`, que se ejecuta en cada arranque del contenedor.

## Orden por vía de ejecución

**Arranque de la API** (CMD del `Dockerfile`; en cada arranque, con o sin volumen nuevo). Cada paso se detiene si falla el anterior:

1. `scripts/apply-startup-schema-migrations.mjs`: `002_evidence_assets.sql` → `007_work_package_versions.sql` → `008_reconnection_schema.sql`.
2. `migrations/20261002-role-grants.mjs`: aplica `007_role_grants.sql` solo si falta `sessions.active_role`.
3. `dist/src/server.js`.

La carga de datos de prueba (`20260923-load-excel-20260922.mjs`) no está en el arranque desde D026. Se ejecuta a mano con `npm run pilot:migrate:field-test`.

**Bootstrap** (`npm run pilot:bootstrap`, una vez, sobre base vacía; se niega si hay datos): `001_init` → `002_evidence_assets` → `seeds/002_seed` → `003_reference_fields` → `seeds/004_e2e_seed` → `007_work_package_versions` → `007_role_grants` → `008_reconnection_schema`.

**Compose** (`backend/docker-compose.yml`, solo al crear un volumen vacío). PostgreSQL ejecuta los archivos montados en orden alfabético: `001_init` → `002_evidence_assets` → `seeds/002_seed` → `003_reference_fields` → `seeds/004_e2e_seed` → `007_role_grants`. No monta `007_work_package_versions` ni `008`: la API los aplica al arrancar.

**Base de pruebas** (`npm run db:migrate:test`, CI y pruebas E2E): `001_init` → `002_evidence_assets` → `003_reference_fields` → `007_role_grants` → `007_work_package_versions` → `008_reconnection_schema`. Sin seeds: las pruebas crean sus propios datos sintéticos. `007_role_grants` y `007_work_package_versions` no dependen entre sí; por eso este orden difiere del bootstrap.

## Scripts `.mjs`

- `20260923-load-excel-20260922.mjs` carga `migrations/data/EXCEL_20260922.json` (99 deudores, 10 órdenes elegibles). El archivo no está en el repo; se gestiona fuera de él. Si falta, el comando se detiene con un mensaje que lo indica. Exige los usuarios `admin.sepsa` y `jhonny.moya` creados por `seeds/002_seed.sql`. Crea la tabla `pilot_migrations` (el script, no un `.sql`) y registra su `migration_id` con el checksum del JSON; si el checksum no coincide con el ya aplicado, se detiene.
- `20261002-role-grants.mjs` aplica `007_role_grants.sql` solo si `sessions.active_role` no existe. Por eso ese SQL no está en la lista de `apply-startup-schema-migrations.mjs`.

Los `.mjs` existen porque su decisión depende del estado de la base (checksum o columna existente) o porque cargan datos desde un archivo. Convertirlos a SQL cambiaría cuándo se ejecutan en despliegues existentes, así que la relación se documenta y no se unifica.

## Números repetidos

`002`, `003` y `007` aparecen dos veces. El número se escribió al crear cada archivo, y el historial de git no muestra un criterio de numeración: `002_seed` y `003_reference_fields` existían desde el 13 de septiembre; `002_evidence_assets` y `003_payment_observations` llegaron el 30 de septiembre; `007_work_package_versions` también el 30 de septiembre y `007_role_grants` el 2 de octubre. Ningún script ordena por prefijo: las vías de arriba usan listas explícitas, salvo Compose, que ordena por nombre completo.

## Pendiente de validar

- `003_payment_observations.sql` se deja como está: ningún script lo ejecuta y no afecta a ningún flujo. Su estado en cada base no se ha verificado.
- Los seeds `005_definitive_seed.sql` y `006_replace-betanzos-20260923-jhonny.sql` se retiraron del repo (D031); el historial de git los conserva.
- `003_reference_fields.sql` no lo aplica el arranque. Un entorno creado antes de esa migración debe revisarse con su historial.
- `008_reconnection_schema.sql` vuelve a crear `orders_status_check` y `sync_operations_action_check` en cada arranque. El resultado es el mismo, pero cada despliegue toma un bloqueo exclusivo sobre esas tablas mientras revalida las filas.
- `seeds/004_e2e_seed.sql` comenta una ruta anterior a un seed ya retirado. No se edita porque es SQL aplicado.
