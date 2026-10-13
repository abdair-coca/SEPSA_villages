import test from "node:test";
import assert from "node:assert/strict";
import { requireLocalDatabaseUrl } from "../scripts/local-database-guard.mjs";

test("local database guard accepts only local PostgreSQL hosts", () => {
  for (const url of ["postgres://phase5:secret@127.0.0.1:5432/phase5", "postgres://user@localhost/db", "postgres://user@[::1]:5432/db"]) {
    assert.equal(requireLocalDatabaseUrl(url, "test"), url);
  }
});

test("local database guard rejects remote, missing or invalid URLs before connecting", () => {
  assert.throws(() => requireLocalDatabaseUrl("postgres://user:pw@ep-example-123.us-east-2.aws.neon.tech/neondb?sslmode=require", "test"), /non-local database host/);
  assert.throws(() => requireLocalDatabaseUrl("postgres://user@10.0.0.5/db", "test"), /non-local database host/);
  assert.throws(() => requireLocalDatabaseUrl(undefined, "test"), /DATABASE_URL is required/);
  assert.throws(() => requireLocalDatabaseUrl("not a url", "test"), /not a valid URL/);
});
