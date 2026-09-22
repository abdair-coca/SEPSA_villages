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

Photo files remain locally persisted on the field device. The sync payload sends only evidence references and metadata (`evidence_storage: LOCAL_ONLY`), never the photo bytes; after valid online authorization, capture, and idempotency checks, the backend can acknowledge the cut while the evidence remains local. Controlled photo exceptions remain auditable. Pending operations created by the previous local-photo rejection are retryable after this backend update; other conflicts remain pending review.

Seed users are `admin.sepsa` (ADMIN), `jhonny.moya` and `tecnico.sepsa02-06` (TECHNICIAN: Alex Fernández, Paola Ríos, Cristian Soria, Daniela Paredes y Marco Aguilar — nombres ficticios de PRUEBA, no personal real). Initial password for all is `password123` for LOCAL pilot only; only scrypt hashes are stored in SQL. Rotate before any shared deployment.

`sql/005_definitive_seed.sql` contains the older 28-debtor bootstrap snapshot from `Deudores_morosos_30_03_2026.xlsx` (sheet MOROSOS). It is not the field-test replacement below. `sql/004_e2e_seed.sql` is deprecated and intentionally empty.

To import a workbook into an existing database without deleting orders or audit history, set `DATABASE_URL` for the process and run `python scripts/import-debtors-xlsx.py path/to/workbook.xlsx`. The importer validates headers, permits missing source GPS, preserves stable debtor/account/supply identifiers, stores the original row in `context.excel_row`, and commits all updates in one transaction. A non-date source value such as `Antigua` is stored as a null `updated_at` with the original value and a status marker in `context`.

### Field test dataset

For the 2026-09-22 field test, preview the supplied workbook first:

```powershell
$env:DATABASE_URL="postgres://pilot_provisional:pilot_provisional@localhost:15432/pilot_provisional"
python scripts/import-debtors-xlsx.py "C:\Users\abdai\Downloads\Listado_de_clientes_al_22_09_2026 (1).xlsx" --dataset EXCEL_20260922 --dry-run
```

After reviewing the preview, replace only `PILOT_PROVISIONAL` operational data and create eligible `CUT` orders for `jhonny.moya`:

```powershell
python scripts/import-debtors-xlsx.py "C:\Users\abdai\Downloads\Listado_de_clientes_al_22_09_2026 (1).xlsx" --dataset EXCEL_20260922 --replace-pilot --create-cut-orders --assign-technician jhonny.moya
```

This explicit replacement removes provisional sessions, sync operations, authorizations, order history, audit events, orders, and debtors. Pilot users remain. It loads 99 debtor rows and creates orders only for rows with `DEUDA > 0` and `MESES >= 3`: the supplied workbook currently produces 10 cut orders, all assigned to `jhonny.moya`; the remaining 89 rows remain available without a field-test cut order. The operation is transactional and records create/assignment audit entries for each generated order. It does not invent GPS, Kardex, source dates, or meanings for unconfirmed columns.

## Verification

`npm run build` compiles TypeScript. `npm test` runs pure tests and skips database integration harness when `DATABASE_URL` is absent.

For a new empty pilot database, set `DATABASE_URL` to the direct PostgreSQL connection string and run `npm run pilot:bootstrap` once. The command refuses to run when provisional tables already contain data, so it cannot silently erase pilot operations.
