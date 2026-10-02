import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { Pool } from "pg";
import { Application } from "../src/application.js";
import type { Role } from "../src/types.js";

const config = { host: "127.0.0.1", port: 0, databaseUrl: "postgres://test", sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, maxBodyBytes: 1024, corsOrigin: "http://localhost:5173" };

class RolePool {
  role: Role = "ADMIN";
  roles: Role[] = ["ADMIN", "TECHNICIAN"];
  valid = true;
  audit: unknown[][] = [];
  sessionQuery = "";
  switchQuery = "";
  failAudit = false;
  private previous: Role = "ADMIN";

  async query(text: string, values: unknown[] = []) {
    if (text === "BEGIN") { this.previous = this.role; return { rows: [] }; }
    if (text === "ROLLBACK") { this.role = this.previous; return { rows: [] }; }
    if (text === "COMMIT") return { rows: [] };
    if (text.startsWith("SELECT active_role FROM sessions")) return { rows: [{ active_role: this.role }] };
    if (text.startsWith("UPDATE sessions s SET active_role")) {
      this.switchQuery = text;
      if (!this.valid || !this.roles.includes("ADMIN") || !this.roles.includes("TECHNICIAN")) return { rows: [], rowCount: 0 };
      this.role = values[1] as Role;
      return { rows: [{ active_role: this.role, expires_at: "2099-01-01T00:00:00.000Z" }], rowCount: 1 };
    }
    if (text.includes("FROM sessions")) {
      this.sessionQuery = text;
      return { rows: this.valid && this.roles.includes(this.role) ? [{ session_id: "session-1", user_id: "user-1", username: "dual-role-fixture", display_name: "Dual Role Fixture", role: this.role, roles: this.roles, expires_at: "2099-01-01T00:00:00.000Z" }] : [] };
    }
    if (text.startsWith("INSERT INTO audit_events")) {
      if (this.failAudit) throw new Error("Audit write failed");
      this.audit.push(values); return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${text}`);
  }
  async connect() { return this; }
  release() {}
}

async function withServer(pool: RolePool, work: (request: (path: string, body?: unknown, authenticated?: boolean) => Promise<Response>) => Promise<void>) {
  const application = new Application(pool as unknown as Pool, config);
  const server = createServer((request, response) => void application.handle(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  try {
    await work((path, body, authenticated = true) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(authenticated ? { authorization: "Bearer ROLE_SWITCH_TEST_TOKEN" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("dual-grant switch preserves session identity, audits roles and enforces active role", async () => {
  const pool = new RolePool();
  await withServer(pool, async (request) => {
    const switched = await request("/v1/auth/role", { role: "TECHNICIAN", user_id: "another-user" });
    assert.equal(switched.status, 200);
    const body = await switched.json();
    assert.equal(body.session_id, "session-1");
    assert.equal(body.user.user_id, "user-1");
    assert.equal(body.user.role, "TECHNICIAN");
    assert.deepEqual(body.user.roles, ["ADMIN", "TECHNICIAN"]);
    assert.equal(body.session_token, undefined);
    const audit = pool.audit[0];
    assert.ok(audit);
    assert.equal(audit[3], "SWITCH_ROLE");
    assert.deepEqual(audit[11], { previous_role: "ADMIN", active_role: "TECHNICIAN" });
    assert.equal((await request("/v1/debtors")).status, 403);
    const restored = await (await request("/v1/auth/session")).json();
    assert.equal(restored.user.role, "TECHNICIAN");
    assert.match(pool.sessionQuery, /s\.active_role AS role/);
    assert.match(pool.sessionQuery, /active_grant\.role = s\.active_role/);
    assert.match(pool.switchQuery, /g\.role = 'ADMIN'/);
    assert.match(pool.switchQuery, /g\.role = 'TECHNICIAN'/);
    assert.equal((await request("/v1/auth/role", { role: "ADMIN" })).status, 200);
    assert.equal(pool.role, "ADMIN");
    assert.equal((await request("/v1/auth/role", { role: "ADMIN" })).status, 200);
    assert.equal(pool.role, "ADMIN");
  });
});

test("single-role accounts cannot switch even when client supplies forged grants", async () => {
  for (const role of ["ADMIN", "TECHNICIAN"] as const) {
    const pool = new RolePool();
    pool.role = role;
    pool.roles = [role];
    await withServer(pool, async (request) => {
      const response = await request("/v1/auth/role", { role: role === "ADMIN" ? "TECHNICIAN" : "ADMIN", roles: ["ADMIN", "TECHNICIAN"] });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "ROLE_NOT_GRANTED");
      assert.equal(pool.role, role);
      assert.equal(pool.audit.length, 0);
    });
  }
});

test("invalid role and unauthenticated or revoked sessions cannot switch", async () => {
  const pool = new RolePool();
  await withServer(pool, async (request) => {
    assert.equal((await request("/v1/auth/role", { role: "OWNER" })).status, 400);
    assert.equal((await request("/v1/auth/role", { role: "TECHNICIAN" }, false)).status, 401);
    pool.valid = false;
    assert.equal((await request("/v1/auth/role", { role: "TECHNICIAN" })).status, 401);
    pool.valid = true;
    pool.roles = ["TECHNICIAN"];
    assert.equal((await request("/v1/auth/session")).status, 401);
    assert.equal(pool.audit.length, 0);
  });
});

test("failed audit rolls back role change and leaves retry possible", async () => {
  const pool = new RolePool();
  pool.failAudit = true;
  await withServer(pool, async (request) => {
    assert.equal((await request("/v1/auth/role", { role: "TECHNICIAN" })).status, 500);
    assert.equal(pool.role, "ADMIN");
    pool.failAudit = false;
    assert.equal((await request("/v1/auth/role", { role: "TECHNICIAN" })).status, 200);
    assert.equal(pool.role, "TECHNICIAN");
  });
});
