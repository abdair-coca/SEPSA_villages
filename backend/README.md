# PILOT_PROVISIONAL Backend

REST and PostgreSQL backend for provisional vertical slice. This is not an official SEPSA API, schema, credential set, or integration.

## Run

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Apply `sql/001_init.sql`, `sql/002_seed.sql`, then `sql/003_reference_fields.sql` when upgrading an existing database.
3. Run `npm install`.
4. Run `npm run dev`.

`docker compose up --build` starts PostgreSQL on host port `15432` and API on `8080` with provisional values.

Set `CORS_ORIGIN` to the exact frontend origin used by the pilot. Do not use `*` when deploying beyond local development.

Session tokens are delivered through an `HttpOnly` cookie and never returned to frontend storage. Authorization tokens are hashed in authorization storage and removed from synchronized operation payloads and audit metadata; `payload_hash` preserves idempotency checks.

Photo files remain locally persisted until an official SEPSA upload and verification contract exists. The backend does not mark a photo-backed cut as physically executed without that verification; controlled photo exceptions remain auditable.

Seed usernames are `PILOT_PROVISIONAL_ADMIN` and `PILOT_PROVISIONAL_TECHNICIAN`. Seed password values are `PILOT_PROVISIONAL_ADMIN_PASSWORD_2026` and `PILOT_PROVISIONAL_TECHNICIAN_PASSWORD_2026`; only their scrypt hashes are stored in SQL.

## Verification

`npm run build` compiles TypeScript. `npm test` runs pure tests and skips database integration harness when `DATABASE_URL` is absent.
