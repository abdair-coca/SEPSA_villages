import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

test("PILOT_PROVISIONAL database harness", { skip: !process.env.DATABASE_URL ? "DATABASE_URL is not configured" : false }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<{ value: number }>("SELECT 1 AS value");
    assert.equal(result.rows[0]?.value, 1);
  } finally {
    await pool.end();
  }
});
