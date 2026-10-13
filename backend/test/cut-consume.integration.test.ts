import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Application } from "../src/http/application.js";
import { hashToken } from "../src/shared/auth-crypto.js";
import type { Config } from "../src/config.js";
import { requireLocalDatabaseUrl } from "../scripts/local-database-guard.mjs";

const databaseUrl = requireLocalDatabaseUrl(process.env.DATABASE_URL, "cut consume integration tests (run `npm run db:migrate:test` first)");
const config: Config = { host: "127.0.0.1", port: 0, databaseUrl, sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, maxBodyBytes: 1024 * 1024, corsOrigin: "http://localhost:5173" };
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const deviceId = "cut-consume-device";
const timestamp = "2026-10-12T12:00:00.000Z";

test("CUT authorization is consumed on confirmation and the later sync does not depend on its expiry (D020)", async (t) => {
  const adminId = randomUUID();
  const technicianId = randomUUID();
  const adminToken = `synthetic-admin-${randomUUID()}`;
  const technicianToken = `synthetic-technician-${randomUUID()}`;
  await pool.query("INSERT INTO users(user_id, username, display_name, role, password_hash, source) VALUES ($1, $2, 'Synthetic Admin', 'ADMIN', 'synthetic', 'PILOT_PROVISIONAL'), ($3, $4, 'Synthetic Tech', 'TECHNICIAN', 'synthetic', 'PILOT_PROVISIONAL')", [adminId, `cut-admin-${adminId}`, technicianId, `cut-tech-${technicianId}`]);
  await pool.query("INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source, active_role) VALUES ($1, $2, $3, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'ADMIN'), ($4, $5, $6, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'TECHNICIAN')", [randomUUID(), adminId, hashToken(adminToken), randomUUID(), technicianId, hashToken(technicianToken)]);
  const server = await start(new Application(pool, config));

  async function assignedOrder(): Promise<{ orderId: string; version: number }> {
    const debtorId = `cut-consume-${randomUUID()}`;
    await pool.query("INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, meter_id, area, locality, route, debt_cents, months_pending, updated_at, source) VALUES ($1, $2, $3, 'Synthetic customer', 'Synthetic address', 'Synthetic meter', 'A', 'B', 'C', 1234, 3, $4, 'PILOT_PROVISIONAL')", [debtorId, `${debtorId}-account`, `${debtorId}-supply`, timestamp]);
    const created = await postJson(server.url, "/v1/orders", adminToken, { operation_id: `cut-create-${randomUUID()}`, debtor_id: debtorId, purpose: "CUT" }, 201);
    const assigned = await postJson(server.url, `/v1/orders/${created.order_id}/assignment`, adminToken, { operation_id: `cut-assign-${randomUUID()}`, technician_id: technicianId, expected_version: created.version });
    return { orderId: created.order_id, version: assigned.version };
  }

  async function authorize(order: { orderId: string; version: number }, operationId: string) {
    const grant = await postJson(server.url, "/v1/authorizations/cut", technicianToken, { operation_id: operationId, order_id: order.orderId, device_id: deviceId, order_version: order.version });
    const consumeBody = { authorization_id: grant.authorization_id, token: grant.token, order_id: order.orderId, technician_id: technicianId, device_id: deviceId, operation_id: operationId, version: order.version };
    return { grant, consumeBody };
  }

  function cutPayload(order: { orderId: string; version: number }, operationId: string, grant: { authorization_id: string; token: string; technician_name_snapshot: string }) {
    return {
      operation_id: operationId, action: "CUT", order_id: order.orderId, technician_id: technicianId, device_id: deviceId,
      technician_name_snapshot: grant.technician_name_snapshot, recorded_at: timestamp, evidence_refs: [], order_version: order.version,
      authorization_id: grant.authorization_id, authorization_token: grant.token, exception_reason: "saltar_control_fotos: prueba sin foto",
      field_capture: { reading: { value: 10, unit: "kWh", meterId: "Synthetic meter", recordedAt: timestamp, status: "CAPTURED" }, location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: timestamp, status: "CAPTURED" }, cutType: "RED", nearbyMeters: false },
    };
  }

  try {
    await t.test("consumes once, replays idempotently and syncs after the authorization expired", async () => {
      const order = await assignedOrder();
      const operationId = `cut-consume-${randomUUID()}`;
      const { grant, consumeBody } = await authorize(order, operationId);
      assert.deepEqual(await postJson(server.url, "/v1/authorizations/cut/consume", technicianToken, consumeBody), { status: "consumed", operation_id: operationId, source: "PILOT_PROVISIONAL" });
      assert.equal((await postJson(server.url, "/v1/authorizations/cut/consume", technicianToken, consumeBody)).status, "consumed");
      assert.equal((await getJson(server.url, `/v1/authorizations/cut/${operationId}`, technicianToken)).status, "consumed");

      await pool.query("UPDATE cut_authorizations SET expires_at = now() - interval '1 hour' WHERE authorization_id = $1", [grant.authorization_id]);
      const acknowledged = await postJson(server.url, "/v1/sync/operations", technicianToken, cutPayload(order, operationId, grant));
      assert.equal(acknowledged.status, "acknowledged");
      const stored = await pool.query("SELECT status, physical_status FROM orders WHERE order_id = $1", [order.orderId]);
      assert.deepEqual(stored.rows[0], { status: "EJECUTADO", physical_status: "CONFIRMED" });
      const audit = await pool.query<{ action: string }>("SELECT action FROM audit_events WHERE operation_id = $1 ORDER BY occurred_at", [operationId]);
      assert.deepEqual(audit.rows.map((row) => row.action), ["AUTHORIZE_CUT", "CONSUME_CUT", "CONSUME_CUT_REPLAY", "SYNC_CUT"]);
    });

    await t.test("rejects an expired, mis-bound or foreign consume without consuming", async () => {
      const order = await assignedOrder();
      const operationId = `cut-expired-${randomUUID()}`;
      const { grant, consumeBody } = await authorize(order, operationId);
      assert.equal((await postJson(server.url, "/v1/authorizations/cut/consume", technicianToken, { ...consumeBody, token: "wrong-token" })).status, "not_authorized");
      assert.equal((await getJson(server.url, `/v1/authorizations/cut/${operationId}`, technicianToken)).status, "reserved");
      assert.equal((await postJson(server.url, "/v1/authorizations/cut/consume", adminToken, consumeBody, 403)).code, "FORBIDDEN");
      assert.equal((await getJson(server.url, `/v1/authorizations/cut/${operationId}`, adminToken, 403)).code, "FORBIDDEN");

      await pool.query("UPDATE cut_authorizations SET expires_at = now() - interval '1 minute' WHERE authorization_id = $1", [grant.authorization_id]);
      assert.equal((await postJson(server.url, "/v1/authorizations/cut/consume", technicianToken, consumeBody)).status, "not_authorized");
      assert.equal((await getJson(server.url, `/v1/authorizations/cut/${operationId}`, technicianToken)).status, "expired");
      assert.equal((await getJson(server.url, `/v1/authorizations/cut/cut-unknown-${randomUUID()}`, technicianToken)).status, "not_found");
    });

    await t.test("rejects the reservation when the order changed and reports it as rejected", async () => {
      const order = await assignedOrder();
      const operationId = `cut-changed-${randomUUID()}`;
      const { consumeBody } = await authorize(order, operationId);
      await pool.query("UPDATE orders SET version = version + 1 WHERE order_id = $1", [order.orderId]);
      assert.equal((await postJson(server.url, "/v1/authorizations/cut/consume", technicianToken, consumeBody)).status, "not_authorized");
      assert.equal((await getJson(server.url, `/v1/authorizations/cut/${operationId}`, technicianToken)).status, "rejected");
    });

    await t.test("still accepts a reserved authorization from the previous app within its validity", async () => {
      const order = await assignedOrder();
      const operationId = `cut-legacy-${randomUUID()}`;
      const { grant } = await authorize(order, operationId);
      assert.equal((await postJson(server.url, "/v1/sync/operations", technicianToken, cutPayload(order, operationId, grant))).status, "acknowledged");
      assert.equal((await getJson(server.url, `/v1/authorizations/cut/${operationId}`, technicianToken)).status, "consumed");
    });
    await t.test("lists consumed-not-synced and conflicting operations for the admin only, read-only (D024)", async () => {
      const order = await assignedOrder();
      const operationId = `cut-reconcile-${randomUUID()}`;
      const { grant, consumeBody } = await authorize(order, operationId);
      await postJson(server.url, "/v1/authorizations/cut/consume", technicianToken, consumeBody);
      const pending = await getJson(server.url, "/v1/admin/reconciliation", adminToken);
      assert.deepEqual(pending.items.find((item: { operation_id: string }) => item.operation_id === operationId), {
        kind: "CONSUMED_NOT_SYNCED", operation_id: operationId, order_id: order.orderId, action: "CUT", technician_id: technicianId,
        technician_name: "Synthetic Tech", account_id: pending.items.find((item: { operation_id: string }) => item.operation_id === operationId)?.account_id, customer_name: "Synthetic customer", detail: null,
        since: pending.items.find((item: { operation_id: string }) => item.operation_id === operationId)?.since,
      });
      assert.equal((await getJson(server.url, "/v1/admin/reconciliation", technicianToken, 403)).code, "FORBIDDEN");

      await pool.query("UPDATE orders SET version = version + 1 WHERE order_id = $1", [order.orderId]);
      await postJson(server.url, "/v1/sync/operations", technicianToken, cutPayload(order, operationId, grant), 409);
      const after = await getJson(server.url, "/v1/admin/reconciliation", adminToken);
      const kinds = after.items.filter((item: { operation_id: string }) => item.operation_id === operationId).map((item: { kind: string }) => item.kind);
      assert.deepEqual(kinds, ["SYNC_CONFLICT"]);
    });
  } finally {
    await server.close();
    await pool.end();
  }
});

async function start(app: Application): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => { void app.handle(request, response); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cut consume integration server address unavailable.");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function getJson(url: string, path: string, token: string, expectedStatus = 200): Promise<any> {
  const response = await fetch(`${url}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}

async function postJson(url: string, path: string, token: string, value: unknown, expectedStatus = 200): Promise<any> {
  const response = await fetch(`${url}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(value) });
  const body = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}
