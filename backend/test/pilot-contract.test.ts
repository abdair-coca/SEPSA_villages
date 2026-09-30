import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { Application } from "../src/application.js";
import type { Config } from "../src/config.js";
import { assertSchema } from "./contract-schema.js";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/pilot-contract.json", import.meta.url), "utf8")) as Record<string, unknown>;
const config: Config = { host: "127.0.0.1", port: 0, databaseUrl: "", sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, paymentAuthorityTimeoutMs: 3000, maxBodyBytes: 1024 * 1024, corsOrigin: "http://localhost:5173" };

test("synthetic fixtures conform to canonical request and response schemas", () => {
  assertSchema("CreateOrderRequest", fixtures.orderCreateRequest);
  assertSchema("Order", fixtures.order);
  assertSchema("AssignOrderRequest", fixtures.assignmentRequest);
  assertSchema("SyncRequest", fixtures.visitSyncRequest);
  assertSchema("SyncResponse", fixtures.syncResponse);
  assertSchema("LookupResponse", fixtures.lookupUnknown);
  assertSchema("LookupResponse", fixtures.lookupConfirmed);
  assertSchema("HumanReviewRequest", fixtures.humanReviewRequest);
  assertSchema("HumanReviewResponse", fixtures.humanReviewResponse);
  assert.deepEqual(fixtures.paymentAvailability, { availability: "NOT_IMPLEMENTED", pending: ["TODO: VALIDAR CON SEPSA"] });
});

test("canonical schemas reject missing fields, wrong types, enums, and extra request fields", () => {
  const create = fixtures.orderCreateRequest as Record<string, unknown>;
  assert.throws(() => assertSchema("CreateOrderRequest", { debtor_id: create.debtor_id, purpose: "CUT" }), /operation_id/);
  assert.throws(() => assertSchema("CreateOrderRequest", { ...create, operation_id: 10 }), /type string/);
  assert.throws(() => assertSchema("CreateOrderRequest", { ...create, purpose: "RECONNECTION" }), /const CUT/);
  assert.throws(() => assertSchema("CreateOrderRequest", { ...create, unexpected: true }), /unexpected/);
  const visit = fixtures.visitSyncRequest as Record<string, unknown>;
  assert.throws(() => assertSchema("SyncRequest", { ...visit, action: "PAYMENT" }), /enum/);
  assert.throws(() => assertSchema("LookupResponse", { status: "confirmed", operation_id: "legacy-operation" }), /order_id/);
  assert.throws(() => assertSchema("SyncResponse", { status: "acknowledged", operation_id: "legacy-operation", source: "PILOT_PROVISIONAL" }), /order_id/);
});

test("real Application order and permission responses conform to OpenAPI schemas", async () => {
  const adminServer = await start("ADMIN");
  try {
    const response = await fetch(`${adminServer.url}/v1/orders`, { headers: { authorization: "Bearer synthetic-test-session-token-001" } });
    assert.equal(response.status, 200);
    assertSchema("OrdersResponse", await response.json());
  } finally { await adminServer.close(); }

  const technicianServer = await start("TECHNICIAN");
  try {
    const response = await fetch(`${technicianServer.url}/v1/orders`, { headers: { authorization: "Bearer synthetic-test-session-token-001" } });
    assert.equal(response.status, 403);
    assertSchema("Error", await response.json());
  } finally { await technicianServer.close(); }
});

test("real Application lookup response preserves the unknown state", async () => {
  const server = await start("TECHNICIAN");
  try {
    const response = await fetch(`${server.url}/v1/sync/operations/synthetic-operation-unknown`, { headers: { authorization: "Bearer synthetic-test-session-token-001" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assertSchema("LookupResponse", body);
    assert.equal((body as { status: string }).status, "not_found");
  } finally { await server.close(); }
});

test("real Application package, authorization reservation, and audit responses conform to schemas", async () => {
  const technician = await start("TECHNICIAN");
  try {
    const packageResponse = await fetch(`${technician.url}/v1/technician/orders?device_id=synthetic-device-01`, { headers: { authorization: "Bearer synthetic-test-session-token-001" } });
    assert.equal(packageResponse.status, 200);
    assertSchema("PackageResponse", await packageResponse.json());

    const authorizationResponse = await fetch(`${technician.url}/v1/authorizations/cut`, {
      method: "POST",
      headers: { authorization: "Bearer synthetic-test-session-token-001", "content-type": "application/json" },
      body: JSON.stringify({ operation_id: "synthetic-cut-01", order_id: "synthetic-order-01", device_id: "synthetic-device-01", order_version: 1 }),
    });
    assert.equal(authorizationResponse.status, 200);
    assertSchema("AuthorizationResponse", await authorizationResponse.json());
  } finally { await technician.close(); }

  const admin = await start("ADMIN");
  try {
    const response = await fetch(`${admin.url}/v1/audit?order_id=00000000-0000-4000-8000-000000000001`, { headers: { authorization: "Bearer synthetic-test-session-token-001" } });
    assert.equal(response.status, 200);
    assertSchema("AuditResponse", await response.json());
  } finally { await admin.close(); }
});

test("real Application creates an order from the contract fixture", async () => {
  const admin = await start("ADMIN");
  try {
    const response = await fetch(`${admin.url}/v1/orders`, {
      method: "POST",
      headers: { authorization: "Bearer synthetic-test-session-token-001", "content-type": "application/json" },
      body: JSON.stringify(fixtures.orderCreateRequest),
    });
    assert.equal(response.status, 201);
    assertSchema("Order", await response.json());
  } finally { await admin.close(); }
});

async function start(role: "ADMIN" | "TECHNICIAN"): Promise<{ url: string; close: () => Promise<void> }> {
  const pool = {
    async query(text: string) {
      if (text.includes("FROM sessions")) return { rows: [{ session_id: "synthetic-session", user_id: "synthetic-user", username: "synthetic-user", display_name: "Synthetic User", role }], rowCount: 1 };
      if (text.includes("FROM sync_operations")) return { rows: [], rowCount: 0 };
      if (text.includes("SELECT audit_id, actor_id")) return { rows: [{ audit_id: "synthetic-audit-01", actor_id: "synthetic-user", actor_role: "ADMIN", action: "SYNTHETIC", entity_id: null, order_id: null, operation_id: null, result: "accepted", reason: null, device_id: null, occurred_at: "2026-09-29T12:00:00.000Z", transition: null, metadata: {} }], rowCount: 1 };
      if (text.includes("FROM orders o")) return { rows: [syntheticOrderRow()], rowCount: 1 };
      throw new Error("Unexpected contract test query.");
    },
    async connect() { return { query: async (text: string) => {
      if (text.includes("FROM orders o")) return { rows: [syntheticOrderRow()], rowCount: 1 };
      if (text.includes("FROM debtors WHERE debtor_id")) return { rows: [{ debtor_id: "synthetic-debtor-01", account_id: "synthetic-account-01", supply_id: "synthetic-supply-01" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }, release() {} }; },
  } as unknown as Pool;
  const app = new Application(pool, config, { async checkPayment() { return { status: "CLEAR" }; } });
  const server = createServer((request, response) => { void app.handle(request, response); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Contract test server address unavailable.");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function syntheticOrderRow(): Record<string, unknown> {
  return { order_id: "synthetic-order-01", cuc: "synthetic-cuc-01", debtor_id: "synthetic-debtor-01", account_id: "synthetic-account-01", supply_id: "synthetic-supply-01", purpose: "CUT", status: "GENERADO", physical_status: "NONE", version: 1, created_by: "synthetic-admin", assigned_technician_id: "synthetic-user", assigned_technician_name: "Synthetic User", created_at: "2026-09-29T12:00:00.000Z", context: {}, source: "PILOT_PROVISIONAL" };
}
