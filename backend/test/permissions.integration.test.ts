import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Application } from "../src/http/application.js";
import { hashToken } from "../src/shared/auth-crypto.js";
import type { Config } from "../src/config.js";
import { requireLocalDatabaseUrl } from "../scripts/local-database-guard.mjs";

const databaseUrl = requireLocalDatabaseUrl(process.env.DATABASE_URL, "permissions integration tests (run `npm run db:migrate:test` first)");
const config: Config = { host: "127.0.0.1", port: 0, databaseUrl, sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, maxBodyBytes: 1024 * 1024, corsOrigin: "http://localhost:5173" };
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const timestamp = "2026-10-13T12:00:00.000Z";
const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

interface Actor { userId: string; token: string }

test("a technician or administrator cannot act outside the role or the assigned order scope (plan 4.2)", async (t) => {
  const admin = await createActor("ADMIN", "Synthetic Admin");
  const techA = await createActor("TECHNICIAN", "Synthetic Tech A");
  const techB = await createActor("TECHNICIAN", "Synthetic Tech B");
  const server = await start(new Application(pool, config));

  async function orderOf(owner: Actor): Promise<{ orderId: string; version: number }> {
    const debtorId = `perm-${randomUUID()}`;
    await pool.query("INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, meter_id, area, locality, route, debt_cents, months_pending, updated_at, source) VALUES ($1, $2, $3, 'Synthetic customer', 'Synthetic address', 'Synthetic meter', 'A', 'B', 'C', 1234, 3, $4, 'PILOT_PROVISIONAL')", [debtorId, `${debtorId}-account`, `${debtorId}-supply`, timestamp]);
    const created = await send(server.url, "POST", "/v1/orders", admin.token, { operation_id: `perm-create-${randomUUID()}`, debtor_id: debtorId, purpose: "CUT" }, 201);
    const assigned = await send(server.url, "POST", `/v1/orders/${created.order_id}/assignment`, admin.token, { operation_id: `perm-assign-${randomUUID()}`, technician_id: owner.userId, expected_version: created.version });
    return { orderId: created.order_id, version: assigned.version };
  }

  function cutPayload(actor: Actor, order: { orderId: string; version: number }, operationId: string, grant?: { authorization_id: string; token: string; technician_name_snapshot: string }) {
    return {
      operation_id: operationId, action: "CUT", order_id: order.orderId, technician_id: actor.userId, device_id: "perm-device",
      technician_name_snapshot: grant?.technician_name_snapshot ?? "Synthetic", recorded_at: timestamp, evidence_refs: [], order_version: order.version,
      authorization_id: grant?.authorization_id, authorization_token: grant?.token, exception_reason: "saltar_control_fotos: prueba sin foto",
      field_capture: { reading: { value: 10, unit: "kWh", meterId: "Synthetic meter", recordedAt: timestamp, status: "CAPTURED" }, location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: timestamp, status: "CAPTURED" }, cutType: "RED", nearbyMeters: false },
    };
  }

  try {
    await t.test("technician A cannot authorize, consume, upload evidence or sync on technician B's order", async () => {
      const order = await orderOf(techB);
      const operationId = `perm-b-${randomUUID()}`;
      const grant = await send(server.url, "POST", "/v1/authorizations/cut", techB.token, { operation_id: operationId, order_id: order.orderId, device_id: "perm-device", order_version: order.version });

      const foreignRequest = { operation_id: `perm-a-${randomUUID()}`, order_id: order.orderId, device_id: "perm-device", order_version: order.version };
      assert.equal((await send(server.url, "POST", "/v1/authorizations/cut", techA.token, foreignRequest, 403)).code, "ORDER_NOT_ASSIGNED");
      assert.equal((await send(server.url, "POST", "/v1/authorizations/reconnection", techA.token, foreignRequest, 403)).code, "ORDER_NOT_ASSIGNED");

      const consumeBody = { authorization_id: grant.authorization_id, token: grant.token, order_id: order.orderId, device_id: "perm-device", operation_id: operationId, version: order.version };
      assert.equal((await send(server.url, "POST", "/v1/authorizations/cut/consume", techA.token, { ...consumeBody, technician_id: techB.userId }, 403)).code, "TECHNICIAN_SCOPE");
      assert.equal((await send(server.url, "POST", "/v1/authorizations/cut/consume", techA.token, { ...consumeBody, technician_id: techA.userId }, 404)).code, "ORDER_SCOPE_NOT_FOUND");
      assert.equal((await send(server.url, "GET", `/v1/authorizations/cut/${operationId}`, techA.token)).status, "not_found");
      assert.equal((await send(server.url, "GET", `/v1/authorizations/reconnection/${operationId}`, techA.token)).status, "not_found");

      const evidence = { evidence_id: `perm-ev-${randomUUID()}`, order_id: order.orderId, operation_id: operationId, device_id: "perm-device", mime_type: "image/png", content_hash: createHash("sha256").update(pngBytes).digest("hex"), content_base64: pngBytes.toString("base64") };
      assert.equal((await send(server.url, "POST", "/v1/evidence/assets", techA.token, { ...evidence, technician_id: techB.userId }, 403)).code, "TECHNICIAN_SCOPE");
      assert.equal((await send(server.url, "POST", "/v1/evidence/assets", techA.token, evidence, 404)).code, "ORDER_SCOPE_NOT_FOUND");

      const forged = await rawSend(server.url, "POST", "/v1/sync/operations", techA.token, cutPayload(techB, order, operationId, grant));
      assert.equal(forged.status, 403);
      assert.equal(forged.body.code, "TECHNICIAN_SCOPE");
      const own = await rawSend(server.url, "POST", "/v1/sync/operations", techA.token, cutPayload(techA, order, `perm-a-${randomUUID()}`));
      assert.notEqual(own.status, 200, JSON.stringify(own.body));
      const stored = await pool.query("SELECT status, physical_status, assigned_technician_id FROM orders WHERE order_id = $1", [order.orderId]);
      assert.equal(stored.rows[0].assigned_technician_id, techB.userId);
      assert.notEqual(stored.rows[0].physical_status, "CONFIRMED");

      // B sí puede sincronizar lo suyo; A no ve esa operación.
      assert.equal((await send(server.url, "POST", "/v1/authorizations/cut/consume", techB.token, { ...consumeBody, technician_id: techB.userId })).status, "consumed");
      assert.equal((await send(server.url, "POST", "/v1/sync/operations", techB.token, cutPayload(techB, order, operationId, grant))).status, "acknowledged");
      assert.equal((await send(server.url, "GET", `/v1/sync/operations/${operationId}`, techA.token)).status, "not_found");
      assert.equal((await send(server.url, "GET", `/v1/sync/operations/${operationId}`, techB.token)).status, "confirmed");
    });

    await t.test("the administrator cannot use technician-only routes", async () => {
      const order = await orderOf(techA);
      const operationId = `perm-admin-${randomUUID()}`;
      const request = { operation_id: operationId, order_id: order.orderId, device_id: "perm-device", order_version: order.version };
      for (const path of ["/v1/authorizations/cut", "/v1/authorizations/reconnection"]) {
        assert.equal((await send(server.url, "POST", path, admin.token, request, 403)).code, "FORBIDDEN", path);
      }
      for (const path of ["/v1/authorizations/cut/consume", "/v1/authorizations/reconnection/consume"]) {
        assert.equal((await send(server.url, "POST", path, admin.token, { ...request, authorization_id: randomUUID(), enablement_id: randomUUID(), token: "x", technician_id: techA.userId, version: order.version }, 403)).code, "FORBIDDEN", path);
      }
      assert.equal((await send(server.url, "POST", "/v1/sync/operations", admin.token, cutPayload(techA, order, operationId), 403)).code, "FORBIDDEN");
      assert.equal((await send(server.url, "POST", "/v1/evidence/assets", admin.token, { evidence_id: "x", order_id: order.orderId, operation_id: operationId, device_id: "d", mime_type: "image/png", content_hash: "0".repeat(64), content_base64: "AAAA" }, 403)).code, "FORBIDDEN");
      assert.equal((await send(server.url, "GET", "/v1/technician/orders", admin.token, undefined, 403)).code, "FORBIDDEN");
    });

    await t.test("a technician cannot use administrator routes", async () => {
      const order = await orderOf(techA);
      for (const path of ["/v1/admin/reconciliation", "/v1/audit", "/v1/debtors", "/v1/orders", "/v1/technicians"]) {
        assert.equal((await send(server.url, "GET", path, techA.token, undefined, 403)).code, "FORBIDDEN", path);
      }
      assert.equal((await send(server.url, "POST", "/v1/orders", techA.token, { operation_id: `perm-x-${randomUUID()}`, debtor_id: "x", purpose: "CUT" }, 403)).code, "FORBIDDEN");
      assert.equal((await send(server.url, "POST", "/v1/orders/batch", techA.token, { operation_id: `perm-x-${randomUUID()}`, items: [] }, 403)).code, "FORBIDDEN");
      assert.equal((await send(server.url, "POST", `/v1/orders/${order.orderId}/assignment`, techA.token, { operation_id: `perm-x-${randomUUID()}`, technician_id: techB.userId, expected_version: order.version }, 403)).code, "FORBIDDEN");
      assert.equal((await send(server.url, "POST", `/v1/sync/operations/${randomUUID()}/review`, techA.token, { order_id: order.orderId, technician_id: techA.userId, device_id: "d", expected_version: order.version, reason: "x" }, 403)).code, "FORBIDDEN");
    });

    await t.test("technician A does not see B's orders and unauthenticated or invalid sessions get 401", async () => {
      const mine = await orderOf(techA);
      const theirs = await orderOf(techB);
      const listed = await send(server.url, "GET", "/v1/technician/orders?device_id=perm-device", techA.token);
      const ids = JSON.stringify(listed);
      assert.ok(ids.includes(mine.orderId));
      assert.ok(!ids.includes(theirs.orderId));

      assert.equal((await rawSend(server.url, "GET", "/v1/orders", undefined)).status, 401);
      assert.equal((await rawSend(server.url, "GET", "/v1/orders", "not-a-token")).status, 401);

      const expired = await createActor("TECHNICIAN", "Synthetic Expired", "- interval '1 hour'");
      assert.equal((await rawSend(server.url, "GET", "/v1/technician/orders?device_id=perm-device", expired.token)).status, 401);

      const leaving = await createActor("TECHNICIAN", "Synthetic Leaving");
      assert.equal((await rawSend(server.url, "GET", "/v1/auth/session", leaving.token)).status, 200);
      assert.equal((await rawSend(server.url, "POST", "/v1/auth/logout", leaving.token, {})).status, 204);
      assert.equal((await rawSend(server.url, "GET", "/v1/auth/session", leaving.token)).status, 401);
      const stored = await pool.query("SELECT token_hash FROM sessions WHERE user_id = $1", [leaving.userId]);
      assert.equal(stored.rows[0].token_hash, hashToken(leaving.token));
      assert.notEqual(stored.rows[0].token_hash, leaving.token);
    });
  } finally {
    await server.close();
    await pool.end();
  }
});

async function createActor(role: "ADMIN" | "TECHNICIAN", displayName: string, expiry = "+ interval '1 hour'"): Promise<Actor> {
  const userId = randomUUID();
  const token = `synthetic-${role.toLowerCase()}-${randomUUID()}`;
  await pool.query("INSERT INTO users(user_id, username, display_name, role, password_hash, source) VALUES ($1, $2, $3, $4, 'synthetic', 'PILOT_PROVISIONAL')", [userId, `perm-${userId}`, displayName, role]);
  await pool.query(`INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source, active_role) VALUES ($1, $2, $3, now() ${expiry}, 'PILOT_PROVISIONAL', $4)`, [randomUUID(), userId, hashToken(token), role]);
  return { userId, token };
}

async function start(app: Application): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => { void app.handle(request, response); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Permissions integration server address unavailable.");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function rawSend(url: string, method: string, path: string, token: string | undefined, value?: unknown): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (value !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${url}${path}`, { method, headers, body: value === undefined ? undefined : JSON.stringify(value) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

async function send(url: string, method: string, path: string, token: string, value?: unknown, expectedStatus = 200): Promise<any> {
  const { status, body } = await rawSend(url, method, path, token, value);
  assert.equal(status, expectedStatus, `${method} ${path}: ${JSON.stringify(body)}`);
  return body;
}
