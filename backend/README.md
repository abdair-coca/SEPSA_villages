# PILOT_PROVISIONAL Backend

REST and PostgreSQL backend for provisional vertical slice. This is not an official SEPSA API, schema, credential set, or integration.

## Run

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Apply `sql/001_init.sql`, `sql/002_seed.sql`, `sql/003_reference_fields.sql`, `sql/004_e2e_seed.sql` and `sql/005_definitive_seed.sql` when upgrading an existing database (in numeric order).
3. Run `npm install`.
4. Run `npm run dev`.

`docker compose up --build` starts PostgreSQL on host port `15432` and API on `8080` with provisional values.

Set `CORS_ORIGIN` to the exact frontend origin used by the pilot. Do not use `*` when deploying beyond local development.

Session tokens are delivered through an `HttpOnly` cookie and never returned to frontend storage. Authorization tokens are hashed in authorization storage and removed from synchronized operation payloads and audit metadata; `payload_hash` preserves idempotency checks.

Photo files remain locally persisted until an official SEPSA upload and verification contract exists. The backend does not mark a photo-backed cut as physically executed without that verification; controlled photo exceptions remain auditable.

Seed users are `admin.sepsa` (ADMIN), `jhonny.moya` and `tecnico.sepsa02-06` (TECHNICIAN: Alex Fernández, Paola Ríos, Cristian Soria, Daniela Paredes y Marco Aguilar — nombres ficticios de PRUEBA, no personal real). Initial password for all is `password123` for LOCAL pilot only; only scrypt hashes are stored in SQL. Rotate before any shared deployment.

`sql/005_definitive_seed.sql` loads 28 debtors from `Deudores_morosos_30_03_2026.xlsx` (sheet MOROSOS) and wipes previous PILOT_PROVISIONAL users, debtors, orders, assignments, authorizations and sync state so technicians start with zero orders. `sql/004_e2e_seed.sql` is deprecated and intentionally empty.

## Verification

`npm run build` compiles TypeScript. `npm test` runs pure tests and skips database integration harness when `DATABASE_URL` is absent.
