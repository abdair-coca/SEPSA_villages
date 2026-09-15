import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import test from "node:test";
import type { Pool } from "pg";
import { Application } from "../src/application.js";

const config = {
  host: "127.0.0.1",
  port: 0,
  databaseUrl: "postgres://test",
  sessionTtlSeconds: 3600,
  authorizationTtlSeconds: 300,
  maxBodyBytes: 1024,
  corsOrigin: "http://localhost:5173",
};

test("admin technician catalog exposes active technician identities without credentials", async () => {
  const pool = new CatalogPool("ADMIN");
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/technicians`, { headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      source: "PILOT_PROVISIONAL",
      technicians: [
        { user_id: "technician-1", username: "tech.one", display_name: "Technician One", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" },
      ],
    });
    assert.match(pool.catalogQuery, /role = 'TECHNICIAN'/);
    assert.match(pool.catalogQuery, /enabled = true/);
    assert.doesNotMatch(JSON.stringify(body), /password|hash/i);
  } finally {
    await close(server);
  }
});

test("technician cannot read administrative technician catalog", async () => {
  const pool = new CatalogPool("TECHNICIAN");
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/technicians`, { headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456" } });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "FORBIDDEN", message: "Role ADMIN is required." });
  } finally {
    await close(server);
  }
});

test("login returns bearer token for switching technicians behind a proxy", async () => {
  const pool = new LoginPool();
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { session_token?: string };
    assert.equal(typeof body.session_token, "string");
    assert.ok(body.session_token);
  } finally {
    await close(server);
  }
});

test("admin assignment locks only order and debtor rows with nullable technician join", async () => {
  const pool = new AssignmentPool();
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/orders/order-1/assignment`, {
      method: "POST",
      headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
      body: JSON.stringify({ operation_id: "assign-1", technician_id: "technician-1", expected_version: 1 }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.assigned_technician_id, "technician-1");
    assert.equal(body.assigned_technician_name, "Technician One");
    assert.equal(body.version, 2);
    assert.match(pool.lockQuery, /FOR UPDATE OF o, d$/);
  } finally {
    await close(server);
  }
});

class CatalogPool {
  catalogQuery = "";

  constructor(private readonly role: "ADMIN" | "TECHNICIAN") {}

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) {
      return {
        rows: [{ session_id: "session-1", user_id: "user-1", username: "user", display_name: "User", role: this.role } as unknown as T],
        rowCount: 1,
      };
    }
    if (text.includes("FROM users WHERE source")) {
      this.catalogQuery = text;
      return {
        rows: [{ user_id: "technician-1", username: "tech.one", display_name: "Technician One", role: "TECHNICIAN", enabled: true } as unknown as T],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected query: ${text}`);
  }
}

class LoginPool {
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("SELECT user_id, username, display_name, role, password_hash")) {
      return {
        rows: [{ user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN", password_hash: "scrypt$16384$8$1$DGPitTZ--gEW7HtAcRpHdg$coTqCTgT-b8lAaNmr53P6w2clR4WDBcACmGWjCN6FpR0fT1FQ1oMosbxIkdtkNu3eTtMn_waaRZsR35nyZvFLA", enabled: true } as unknown as T],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected pool query: ${text}`);
  }

  async connect(): Promise<LoginClient> {
    return new LoginClient();
  }
}

class LoginClient {
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text === "BEGIN" || text === "COMMIT" || text.includes("INSERT INTO sessions") || text.includes("INSERT INTO audit_events")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected client query: ${text}`);
  }

  release(): void {}
}

class AssignmentPool {
  lockQuery = "";

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) {
      return {
        rows: [{ session_id: "session-1", user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } as unknown as T],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected pool query: ${text}`);
  }

  async connect(): Promise<AssignmentClient> {
    return new AssignmentClient(this);
  }
}

class AssignmentClient {
  constructor(private readonly pool: AssignmentPool) {}

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text === "BEGIN" || text === "COMMIT") return { rows: [], rowCount: 0 };
    if (text.includes("INSERT INTO command_operations")) return { rows: [], rowCount: 1 };
    if (text.startsWith("SELECT user_id FROM users")) return { rows: [{ user_id: "technician-1" } as unknown as T], rowCount: 1 };
    if (text.includes("FOR UPDATE OF o, d")) {
      this.pool.lockQuery = text;
      return { rows: [assignmentOrder({ version: 1 }) as unknown as T], rowCount: 1 };
    }
    if (text.startsWith("UPDATE orders SET")) return { rows: [], rowCount: 1 };
    if (text.startsWith("SELECT") && text.includes("FROM orders o")) {
      return { rows: [assignmentOrder({ version: 2, assigned_technician_id: "technician-1", assigned_technician_name: "Technician One" }) as unknown as T], rowCount: 1 };
    }
    if (text.startsWith("INSERT INTO order_assignments")) return { rows: [], rowCount: 1 };
    if (text.startsWith("INSERT INTO audit_events")) return { rows: [], rowCount: 1 };
    if (text.startsWith("UPDATE command_operations")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected client query: ${text}`);
  }

  release(): void {}
}

function assignmentOrder(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    order_id: "order-1",
    debtor_id: "debtor-1",
    account_id: "account-1",
    supply_id: "supply-1",
    purpose: "CUT",
    status: "GENERADO",
    physical_status: "NONE",
    version: 1,
    created_by: "admin-1",
    assigned_technician_id: null,
    created_at: "2026-09-14T00:00:00.000Z",
    context: {},
    cuc: "CUC-1",
    assigned_technician_name: null,
    ...overrides,
  };
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
