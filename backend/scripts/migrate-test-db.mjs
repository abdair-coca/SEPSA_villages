import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Start an isolated PostgreSQL 16 service, then run npm run db:migrate:test.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrations = [
  "sql/001_init.sql",
  "sql/002_evidence_assets.sql",
  "sql/003_payment_observations.sql",
  "sql/003_reference_fields.sql",
  "sql/007_work_package_versions.sql",
];

try {
  for (const path of migrations) {
    await pool.query(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
    console.log(`Applied ${path}`);
  }
} finally {
  await pool.end();
}
