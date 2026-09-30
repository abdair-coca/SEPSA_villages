import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply PILOT_PROVISIONAL schema migration 007.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query(await readFile(new URL("../sql/007_work_package_versions.sql", import.meta.url), "utf8"));
} finally {
  await pool.end();
}
