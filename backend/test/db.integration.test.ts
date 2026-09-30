import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { Application } from "../src/application.js";
import { hashToken } from "../src/auth.js";
import type { Config } from "../src/config.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Start isolated PostgreSQL, run `npm run db:migrate:test`, then `npm test`.");
}

const config: Config = { host: "127.0.0.1", port: 0, databaseUrl, sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, paymentAuthorityTimeoutMs: 3000, maxBodyBytes: 1024 * 1024, corsOrigin: "http://localhost:5173" };
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

test("PostgreSQL HTTP pages stay bounded and stable; package versions survive restart and clock history", async () => {
  const adminId = randomUUID();
  const technicianId = randomUUID();
  const adminToken = `synthetic-admin-${randomUUID()}`;
  const technicianToken = `synthetic-technician-${randomUUID()}`;
  const adminSessionId = randomUUID();
  const technicianSessionId = randomUUID();
  const timestamp = "2026-09-01T12:00:00.000Z";
  let adminServer: Awaited<ReturnType<typeof start>> | undefined;
  try {
    await pool.query("INSERT INTO users(user_id, username, display_name, role, password_hash, source) VALUES ($1, $2, 'Synthetic Admin', 'ADMIN', 'synthetic', 'PILOT_PROVISIONAL'), ($3, $4, 'Synthetic Tech', 'TECHNICIAN', 'synthetic', 'PILOT_PROVISIONAL')", [adminId, `phase5-admin-${adminId}`, technicianId, `phase5-tech-${technicianId}`]);
    await pool.query("INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source) VALUES ($1, $2, $3, now() + interval '1 hour', 'PILOT_PROVISIONAL'), ($4, $5, $6, now() + interval '1 hour', 'PILOT_PROVISIONAL')", [adminSessionId, adminId, hashToken(adminToken), technicianSessionId, technicianId, hashToken(technicianToken)]);

    const debtorIds = Array.from({ length: 7 }, (_, index) => `phase5-${adminId}-${index}`);
    for (const [index, debtorId] of debtorIds.entries()) {
      await pool.query(
        "INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, meter_id, area, locality, route, debt_cents, months_pending, updated_at, source) VALUES ($1, $2, $3, $4, 'Synthetic address', 'Synthetic meter', 'A', 'B', 'C', 1234, 2, $5, 'PILOT_PROVISIONAL')",
        [debtorId, `phase5-account-${adminId}-${index}`, `phase5-supply-${adminId}-${index}`, `Synthetic ${index}`, timestamp],
      );
    }
    const auditOrderId = randomUUID();
    await pool.query("INSERT INTO orders(order_id, debtor_id, purpose, status, physical_status, version, created_by, source) VALUES ($1, $2, 'CUT', 'GENERADO', 'NONE', 1, $3, 'PILOT_PROVISIONAL')", [auditOrderId, debtorIds[0], adminId]);
    const auditIds = Array.from({ length: 7 }, () => randomUUID()).sort();
    for (const auditId of auditIds) {
      await pool.query("INSERT INTO audit_events(audit_id, actor_id, actor_role, action, order_id, result, occurred_at, metadata, source) VALUES ($1, $2, 'ADMIN', 'PHASE5_SYNTHETIC', $3, 'accepted', $4, '{}'::jsonb, 'PILOT_PROVISIONAL')", [auditId, adminId, auditOrderId, timestamp]);
    }

    let paymentChecks = 0;
    const paymentTestAdapter = { async checkPayment() { paymentChecks += 1; return { status: paymentChecks === 1 ? "CLEAR" as const : "PAYMENT_CONFIRMED" as const }; } };
    let app = new Application(pool, config, paymentTestAdapter);
    adminServer = await start(app, adminToken);
    {
      const admin = adminServer;
      const filter = `query=phase5-${adminId}`;
      const first = await getJson(admin.url, `/v1/debtors?${filter}&limit=3&offset=0`, adminToken);
      const second = await getJson(admin.url, `/v1/debtors?${filter}&limit=3&cursor=${first.next_cursor}`, adminToken);
      const last = await getJson(admin.url, `/v1/debtors?${filter}&limit=3&offset=6`, adminToken);
      assert.equal(first.debtors.length, 3);
      assert.equal(first.total, 7);
      assert.equal(first.next_cursor, "3");
      assert.equal(second.offset, 3);
      assert.deepEqual([...first.debtors, ...second.debtors, ...last.debtors].map((row: any) => row.debtor_id), debtorIds);
      assert.equal(last.debtors.length, 1);
      assert.equal(last.next_cursor, null);
      assert.equal((await getJson(admin.url, "/v1/debtors?limit=0", adminToken, 400)).code, "INVALID_REQUEST");
      assert.equal((await getJson(admin.url, "/v1/debtors?offset=-1", adminToken, 400)).code, "INVALID_REQUEST");
      assert.equal((await getJson(admin.url, "/v1/debtors?offset=1&cursor=2", adminToken, 400)).code, "INVALID_REQUEST");

      const auditFirst = await getJson(admin.url, `/v1/audit?order_id=${auditOrderId}&limit=3&offset=0`, adminToken);
      const auditSecond = await getJson(admin.url, `/v1/audit?order_id=${auditOrderId}&limit=3&cursor=${auditFirst.next_cursor}`, adminToken);
      const auditLast = await getJson(admin.url, `/v1/audit?order_id=${auditOrderId}&limit=3&offset=6`, adminToken);
      assert.deepEqual([...auditFirst.audit, ...auditSecond.audit, ...auditLast.audit].map((row: any) => row.audit_id), auditIds);
      assert.equal(auditLast.next_cursor, null);
      assert.equal((await getJson(admin.url, `/v1/audit?order_id=${auditOrderId}&limit=101`, adminToken, 400)).code, "INVALID_REQUEST");
      assert.equal((await getJson(admin.url, `/v1/audit?order_id=${auditOrderId}&cursor=1&offset=0`, adminToken, 400)).code, "INVALID_REQUEST");
    }

    let technician = await start(app, technicianToken);
    const highHistoricalVersion = 9_000_000_000_000;
    let packageOne: any;
    try {
      packageOne = await getJson(technician.url, "/v1/technician/orders?device_id=phase5-device", technicianToken);
      const packageTwo = await getJson(technician.url, `/v1/technician/orders?device_id=phase5-device&known_version=${highHistoricalVersion}`, technicianToken);
      assert.ok(packageTwo.package.version > highHistoricalVersion);
      assert.ok(packageTwo.package.version > packageOne.package.version);
    } finally { await technician.close(); }

    app = new Application(pool, config, paymentTestAdapter);
    technician = await start(app, technicianToken);
    try {
      const afterRestart = await getJson(technician.url, "/v1/technician/orders?device_id=phase5-device", technicianToken);
      assert.ok(afterRestart.package.version > 9_000_000_000_000);
      assert.ok(afterRestart.package.version > packageOne.package.version);
      assert.equal((await getJson(technician.url, "/v1/technician/orders?device_id=phase5-device&known_version=9007199254740991", technicianToken, 400)).code, "INVALID_REQUEST");

      const created = await postJson(adminServer!.url, "/v1/orders", adminToken, { operation_id: `phase5-create-${randomUUID()}`, debtor_id: debtorIds[1], purpose: "CUT" }, 201);
      const assigned = await postJson(adminServer!.url, `/v1/orders/${created.order_id}/assignment`, adminToken, { operation_id: `phase5-assign-${randomUUID()}`, technician_id: technicianId, expected_version: created.version });
      const assignedPackage = await getJson(technician.url, "/v1/technician/orders?device_id=phase5-device", technicianToken);
      assert.ok(assignedPackage.package.orders.some((order: any) => order.order_id === created.order_id));

      const operationId = `phase5-cut-${randomUUID()}`;
      const bytes = Buffer.from("synthetic image evidence bytes");
      const contentHash = createHash("sha256").update(bytes).digest("hex");
      const evidenceId = `phase5-evidence-${randomUUID()}`;
      await postJson(technician.url, "/v1/evidence/assets", technicianToken, { evidence_id: evidenceId, order_id: created.order_id, operation_id: operationId, device_id: "phase5-device", mime_type: "image/jpeg", content_hash: contentHash, content_base64: bytes.toString("base64") });
      const authorization = await postJson(technician.url, "/v1/authorizations/cut", technicianToken, { operation_id: operationId, order_id: created.order_id, device_id: "phase5-device", order_version: assigned.version });
      const conflict = await postJson(technician.url, "/v1/sync/operations", technicianToken, {
        operation_id: operationId, action: "CUT", order_id: created.order_id, technician_id: technicianId, device_id: "phase5-device",
        recorded_at: timestamp, evidence_refs: [evidenceId], order_version: assigned.version, authorization_id: authorization.authorization_id,
        authorization_token: authorization.token,
        field_capture: { reading: { value: 123.45, unit: "kWh", meterId: "Synthetic meter", recordedAt: timestamp, status: "CAPTURED" }, location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: timestamp, status: "CAPTURED" }, cutType: "RED", nearbyMeters: false },
      }, 409);
      assert.equal(conflict.code, "CONFLICT");
      const storedAsset = await pool.query("SELECT status, content_hash FROM evidence_assets WHERE evidence_id = $1", [evidenceId]);
      const storedConflict = await pool.query("SELECT status FROM sync_operations WHERE operation_id = $1", [operationId]);
      const storedPayment = await pool.query("SELECT operation_id FROM payment_observations WHERE operation_id = $1", [operationId]);
      const storedAudit = await pool.query("SELECT action FROM audit_events WHERE operation_id = $1 ORDER BY occurred_at", [operationId]);
      assert.deepEqual(storedAsset.rows[0], { status: "verified", content_hash: contentHash });
      assert.equal(storedConflict.rows[0]?.status, "conflict");
      assert.equal(storedPayment.rows.length, 1);
      assert.ok(storedAudit.rows.some((row) => row.action === "SYNC_OPERATION"));
      assert.ok(storedAudit.rows.some((row) => row.action === "PAYMENT_CONFIRMED_OBSERVED"));
    } finally { await technician.close(); }
  } finally {
    await adminServer?.close();
    await pool.end();
  }
});

async function start(app: Application, token: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => { void app.handle(request, response); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("PostgreSQL integration server address unavailable.");
  void token;
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
