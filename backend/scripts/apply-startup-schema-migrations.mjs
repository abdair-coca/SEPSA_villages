import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply PILOT_PROVISIONAL startup schema migrations.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrations = [
  "002_evidence_assets.sql",
  "007_work_package_versions.sql",
  "008_reconnection_schema.sql",
];

try {
  for (const migration of migrations) {
    await pool.query(await readFile(new URL(`../sql/${migration}`, import.meta.url), "utf8"));
    console.log(`Applied ${migration}`);
  }
} finally {
  await pool.end();
}
