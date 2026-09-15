import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sqlDirectory = resolve(scriptDirectory, "..", "sql");
const sqlFiles = [
  "001_init.sql",
  "002_seed.sql",
  "003_reference_fields.sql",
  "004_e2e_seed.sql",
  "005_definitive_seed.sql",
];

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required for pilot bootstrap.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const tableResult = await pool.query("SELECT to_regclass('public.users') AS table_name");
    if (tableResult.rows[0]?.table_name) {
      const result = await pool.query(`
        SELECT
          (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM debtors) AS debtors,
          (SELECT count(*) FROM orders) AS orders,
          (SELECT count(*) FROM sync_operations) AS sync_operations,
          (SELECT count(*) FROM audit_events) AS audit_events
      `);
      const counts = Object.values(result.rows[0] ?? {}).map(Number);
      if (counts.some((count) => count > 0)) {
        throw new Error("Pilot database already contains data; bootstrap aborted.");
      }
    }

    for (const sqlFile of sqlFiles) {
      const sql = await readFile(resolve(sqlDirectory, sqlFile), "utf8");
      await pool.query(sql);
      console.log(`Applied ${sqlFile}`);
    }
    console.log("Pilot database bootstrapped.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Pilot bootstrap failed.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
