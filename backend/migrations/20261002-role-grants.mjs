import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required to run the role-grants migration.");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query("SELECT pg_advisory_lock(hashtext('sepsa:role-grants:007'))");
  const applied = await pool.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'active_role') AS applied");
  if (!applied.rows[0].applied) {
    const sql = await readFile(new URL("../sql/007_role_grants.sql", import.meta.url), "utf8");
    await pool.query(sql);
    console.log("Applied 007_role_grants.sql");
  }
} finally {
  await pool.end();
}
