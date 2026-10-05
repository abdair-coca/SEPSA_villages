import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { Pool, PoolClient } from "pg";
import { Application } from "../src/application.js";
import { hashToken } from "../src/auth.js";
import type { Config } from "../src/config.js";

const config: Config = {
  host: "127.0.0.1",
  port: 0,
  databaseUrl: "postgres://test",
  sessionTtlSeconds: 3600,
  authorizationTtlSeconds: 300,
  maxBodyBytes: 1024 * 1024,
  corsOrigin: "http://localhost:5173",
};
const technicianId = "00000000-0000-4000-8000-000000000003";
const orderId = "00000000-0000-4000-8000-000000000001";
const deviceId = "phase2-device";
const operationId = "reconnection-phase2-operation-01";
const bearer = "phase2-synthetic-session-token";

test("pilot reconnection habilitation and sync are bound, auditable, and idempotent", async () => {
  const pool = new ReconnectionPool();
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const base = address(server);
    const headers = { authorization: `Bearer ${bearer}`, "content-type": "application/json" };
    const enablement = await post(base, "/v1/authorizations/reconnection", headers, {
      operation_id: operationId,
      order_id: orderId,
      device_id: deviceId,
      order_version: 4,
    });
    assert.equal(enablement.status, 200);
    assert.equal(enablement.body.technician_name_snapshot, "Técnico Uno");
    assert.equal(enablement.body.version, 4);

    const wrongBinding = await post(base, "/v1/authorizations/reconnection/consume", headers, {
      enablement_id: enablement.body.enablement_id,
      token: enablement.body.token,
      order_id: orderId,
      technician_id: technicianId,
      device_id: "another-device",
      operation_id: operationId,
      version: 4,
    });
    assert.equal(wrongBinding.status, 200);
    assert.equal(wrongBinding.body.status, "not_enabled");
    assert.equal(pool.client.grants.get(enablement.body.enablement_id)?.status, "RESERVED");

    const consumeBody = {
      enablement_id: enablement.body.enablement_id,
      token: enablement.body.token,
      order_id: orderId,
      technician_id: technicianId,
      device_id: deviceId,
      operation_id: operationId,
      version: 4,
    };
    assert.deepEqual((await post(base, "/v1/authorizations/reconnection/consume", headers, consumeBody)).body, {
      status: "consumed", operation_id: operationId, source: "PILOT_PROVISIONAL",
    });
    assert.equal((await post(base, "/v1/authorizations/reconnection/consume", headers, consumeBody)).body.status, "consumed");
    const enablementLookupResponse = await fetch(`${base}/v1/authorizations/reconnection/${operationId}`, { headers: { authorization: `Bearer ${bearer}` } });
    const enablementLookup = await enablementLookupResponse.json() as Record<string, unknown>;
    assert.deepEqual(enablementLookup, { status: "consumed", operation_id: operationId, source: "PILOT_PROVISIONAL" });

    const duplicateEnablement = await post(base, "/v1/authorizations/reconnection", headers, {
      operation_id: "reconnection-phase2-operation-02",
      order_id: orderId,
      device_id: deviceId,
      order_version: 4,
    });
    assert.equal(duplicateEnablement.status, 409);
    assert.equal(duplicateEnablement.body.code, "RECONNECTION_ALREADY_CONSUMED");

    const reconnectionPayload = {
      operation_id: operationId,
      action: "RECONNECTION",
      order_id: orderId,
      technician_id: technicianId,
      technician_name_snapshot: "Técnico Uno",
      device_id: deviceId,
      recorded_at: "2026-10-04T10:00:00.000Z",
      effective_at: "2026-10-04T10:00:00.000Z",
      demora: "Sin demora",
      evidence_refs: [],
      order_version: 4,
      authorization_id: enablement.body.enablement_id,
      exception_reason: "saltar_control_fotos: prueba sin foto",
    };
    const acknowledgement = await post(base, "/v1/sync/operations", headers, reconnectionPayload);
    assert.equal(acknowledgement.status, 200);
    assert.equal(acknowledgement.body.action, "RECONNECTION");
    assert.equal(acknowledgement.body.effective_at, reconnectionPayload.effective_at);
    assert.equal(acknowledgement.body.demora, "Sin demora");
    assert.equal(acknowledgement.body.technician_name_snapshot, "Técnico Uno");
    assert.equal(pool.client.order.status, "RECONEXIÓN");
    assert.equal(pool.client.order.version, 5);

    const replay = await post(base, "/v1/sync/operations", headers, reconnectionPayload);
    assert.equal(replay.status, 200);
    assert.equal(pool.client.order.version, 5);
    const mismatch = await post(base, "/v1/sync/operations", headers, { ...reconnectionPayload, demora: "dato cambiado" });
    assert.equal(mismatch.status, 409);

    const lookupResponse = await fetch(`${base}/v1/sync/operations/${operationId}`, { headers: { authorization: `Bearer ${bearer}` } });
    const lookup = await lookupResponse.json() as Record<string, unknown>;
    assert.equal(lookup.status, "confirmed");
    assert.equal(lookup.effective_at, reconnectionPayload.effective_at);
    assert.equal(lookup.demora, "Sin demora");
    assert.equal(lookup.technician_name_snapshot, "Técnico Uno");
    assert.deepEqual(pool.client.auditActions, [
      "AUTHORIZE_RECONNECTION",
      "CONSUME_RECONNECTION",
      "CONSUME_RECONNECTION",
      "CONSUME_RECONNECTION_REPLAY",
      "SYNC_RECONNECTION",
    ]);
    assert.doesNotMatch(JSON.stringify(pool.client.auditMetadata), new RegExp(enablement.body.token));
  } finally {
    await close(server);
  }
});

test("a new operation replaces an unconsumed reservation but not a consumed reconnection", async () => {
  const pool = new ReconnectionPool();
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const base = address(server);
    const headers = { authorization: `Bearer ${bearer}`, "content-type": "application/json" };
    const requestEnablement = (operationId: string) => post(base, "/v1/authorizations/reconnection", headers, { operation_id: operationId, order_id: orderId, device_id: deviceId, order_version: 4 });
    const first = await requestEnablement("reconnection-abandoned-01");
    const second = await requestEnablement("reconnection-retry-02");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(pool.client.grants.get(first.body.enablement_id)?.status, "REJECTED");
    assert.equal(pool.client.grants.get(second.body.enablement_id)?.status, "RESERVED");
    const staleConsume = await post(base, "/v1/authorizations/reconnection/consume", headers, {
      enablement_id: first.body.enablement_id,
      token: first.body.token,
      order_id: orderId,
      technician_id: technicianId,
      device_id: deviceId,
      operation_id: "reconnection-abandoned-01",
      version: 4,
    });
    assert.equal(staleConsume.body.status, "not_enabled");
    assert.ok(pool.client.auditActions.includes("RECONNECTION_ENABLEMENT_REPLACED"));
  } finally {
    await close(server);
  }
});

test("reconnection habilitation rejects an unassigned technician and stale order version", async () => {
  const pool = new ReconnectionPool();
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const base = address(server);
    const headers = { authorization: `Bearer ${bearer}`, "content-type": "application/json" };
    pool.client.order.assigned_technician_id = "00000000-0000-4000-8000-000000000099";
    const unassigned = await post(base, "/v1/authorizations/reconnection", headers, { operation_id: "reconnection-unassigned", order_id: orderId, device_id: deviceId, order_version: 4 });
    assert.equal(unassigned.status, 403);
    assert.equal(pool.client.grants.size, 0);

    pool.client.order.assigned_technician_id = technicianId;
    const stale = await post(base, "/v1/authorizations/reconnection", headers, { operation_id: "reconnection-stale", order_id: orderId, device_id: deviceId, order_version: 3 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "VERSION_CONFLICT");
    assert.equal(pool.client.grants.size, 0);
  } finally {
    await close(server);
  }
});

test("reconnection habilitation refuses an order that does not identify one confirmed CUT", async () => {
  const pool = new ReconnectionPool();
  pool.client.cutCount = 2;
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const response = await post(address(server), "/v1/authorizations/reconnection", { authorization: `Bearer ${bearer}`, "content-type": "application/json" }, { operation_id: "reconnection-ambiguous", order_id: orderId, device_id: deviceId, order_version: 4 });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "CUT_CYCLE_AMBIGUOUS");
    assert.equal(pool.client.grants.size, 0);
  } finally {
    await close(server);
  }
});

class ReconnectionPool {
  readonly client = new ReconnectionClient();

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) {
      return {
        rows: [{ session_id: "phase2-session", user_id: technicianId, username: "tech.one", display_name: "Técnico Uno", role: "TECHNICIAN" } as unknown as T],
        rowCount: 1,
      };
    }
    if (text.includes("FROM sync_operations WHERE operation_id = $1 AND ($2::text")) {
      const row = this.client.operations.get(String(values[0]));
      return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
    }
    throw new Error(`Unexpected reconnection pool query: ${text}`);
  }

  async connect(): Promise<ReconnectionClient> { return this.client; }
}

class ReconnectionClient {
  order = { order_id: orderId, debtor_id: "debtor-1", account_id: "account-1", supply_id: "supply-1", purpose: "CUT", status: "EJECUTADO", physical_status: "CONFIRMED", version: 4, created_by: "admin-1", assigned_technician_id: technicianId, created_at: "2026-10-04T09:00:00.000Z", context: {}, cuc: "CUC-1", assigned_technician_name: "Técnico Uno" };
  readonly grants = new Map<string, Record<string, unknown>>();
  readonly operations = new Map<string, Record<string, unknown>>();
  readonly auditActions: string[] = [];
  cutCount = 1;
  auditMetadata: unknown;

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [], rowCount: 0 };
    if (text.includes("FOR UPDATE OF o, d") || text.includes("FROM orders o")) return { rows: [this.order as unknown as T], rowCount: 1 };
    if (text.includes("FROM orders WHERE order_id = $1")) return { rows: [this.order as unknown as T], rowCount: 1 };
    if (text.includes("SELECT operation_id FROM sync_operations WHERE order_id = $1 AND action = 'CUT'")) {
      const cuts = Array.from({ length: this.cutCount }, (_, index) => ({ operation_id: `cut-operation-${index + 1}` } as unknown as T));
      return { rows: cuts, rowCount: cuts.length };
    }
    if (text.includes("UPDATE cut_authorizations SET status = 'EXPIRED'")) return { rows: [], rowCount: 0 };
    if (text.includes("SELECT technician_id, order_id, device_id, action, status FROM cut_authorizations WHERE operation_id")) {
      const grant = [...this.grants.values()].find((item) => item.operation_id === values[0]);
      return { rows: grant ? [grant as T] : [], rowCount: grant ? 1 : 0 };
    }
    if (text.includes("SELECT authorization_id, operation_id, status FROM cut_authorizations WHERE order_id")) {
      const active = [...this.grants.values()].filter((item) => item.order_id === values[0] && ["RESERVED", "CONSUMED"].includes(String(item.status)));
      return { rows: active as T[], rowCount: active.length };
    }
    if (text.includes("SELECT authorization_id, technician_id, status, expires_at FROM cut_authorizations WHERE operation_id")) {
      const grant = [...this.grants.values()].find((item) => item.operation_id === values[0]);
      return { rows: grant ? [grant as T] : [], rowCount: grant ? 1 : 0 };
    }
    if (text.startsWith("INSERT INTO cut_authorizations")) {
      const grant = { authorization_id: values[0], operation_id: values[1], order_id: values[2], technician_id: values[3], device_id: values[4], order_version: values[5], token_hash: values[6], status: "RESERVED", expires_at: values[7], action: text.includes("'RECONNECTION'") ? "RECONNECTION" : "CUT", technician_name_snapshot: values[9] ?? null, consumed_operation_id: null };
      this.grants.set(String(grant.authorization_id), grant);
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("SELECT authorization_id, operation_id, order_id, technician_id, technician_name_snapshot")) {
      const grant = this.grants.get(String(values[0]));
      return { rows: grant ? [grant as T] : [], rowCount: grant ? 1 : 0 };
    }
    if (text.startsWith("UPDATE cut_authorizations SET status = 'CONSUMED'")) {
      const grant = this.grants.get(String(values[0]));
      if (!grant || grant.status !== "RESERVED") return { rows: [], rowCount: 0 };
      grant.status = "CONSUMED";
      grant.consumed_operation_id = values[1];
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE cut_authorizations SET status = 'REJECTED'")) {
      const grant = this.grants.get(String(values[0]));
      if (!grant || grant.status !== "RESERVED") return { rows: [], rowCount: 0 };
      grant.status = "REJECTED";
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("SELECT operation_id, technician_id, device_id, status, payload_hash, conflict_reason FROM sync_operations")) {
      const operation = this.operations.get(String(values[0]));
      return { rows: operation ? [operation as T] : [], rowCount: operation ? 1 : 0 };
    }
    if (text.startsWith("INSERT INTO sync_operations")) {
      const operation = { operation_id: values[0], technician_id: values[1], device_id: values[2], order_id: values[3], action: values[4], payload: values[5], payload_hash: values[6], status: "pending", conflict_reason: null };
      this.operations.set(String(operation.operation_id), operation);
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE orders SET status = 'RECONEXIÓN'")) {
      if (this.order.version !== values[1]) return { rows: [], rowCount: 0 };
      this.order.status = "RECONEXIÓN";
      this.order.version += 1;
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE sync_operations SET status = 'acknowledged'")) {
      const operation = this.operations.get(String(values[0]));
      if (operation) operation.status = "acknowledged";
      return { rows: [], rowCount: operation ? 1 : 0 };
    }
    if (text.startsWith("INSERT INTO audit_events")) {
      this.auditActions.push(String(values[3]));
      this.auditMetadata = values[11];
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected reconnection client query: ${text}`);
  }

  release(): void {}
}

async function post(base: string, path: string, headers: Record<string, string>, value: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const response = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(value) });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

function address(server: ReturnType<typeof createServer>): string {
  const value = server.address();
  if (!value || typeof value === "string") throw new Error("Test server address is unavailable.");
  return `http://127.0.0.1:${value.port}`;
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
