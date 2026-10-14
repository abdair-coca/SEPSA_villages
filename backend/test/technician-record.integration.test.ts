import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Application } from "../src/http/application.js";
import { hashToken } from "../src/shared/auth-crypto.js";
import type { Config } from "../src/config.js";
import { requireLocalDatabaseUrl } from "../scripts/local-database-guard.mjs";

const databaseUrl = requireLocalDatabaseUrl(process.env.DATABASE_URL, "the technician record integration test (run `npm run db:migrate:test` first)");
const config: Config = { host: "127.0.0.1", port: 0, databaseUrl, sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, maxBodyBytes: 1024 * 1024, corsOrigin: "http://localhost:5173" };
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const timestamp = "2026-10-01T10:00:00.000Z";
const fieldCapture = {
  reading: { status: "CAPTURED", value: 1520.5, meterId: "MTR-RECORD", unit: "kWh", recordedAt: timestamp },
  location: { status: "CAPTURED", latitude: 14.6, longitude: -90.5, accuracyMeters: 8, recordedAt: timestamp },
  cutType: "MEDIDOR",
  nearbyMeters: false,
};

test("el registro del técnico lo ve desde cualquier dispositivo, solo con sus operaciones, paginado y auditado", async () => {
  const fixture = await createFixture();
  let server: Server | undefined;
  try {
    server = createServer((request, response) => { void new Application(pool, config).handle(request, response); });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const get = (path: string, token: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });

    // Dispositivo A: ambas operaciones, la más reciente primero, con la captura tal como se registró.
    const deviceA = await get("/v1/technician/record", fixture.technicianToken);
    assert.equal(deviceA.status, 200);
    const bodyA = await deviceA.json() as { operations: Array<Record<string, unknown>>; total: number; next_cursor: string | null };
    assert.deepEqual(bodyA.operations.map((item) => item.operation_id), [fixture.visitOperationId, fixture.cutOperationId]);
    assert.equal(bodyA.total, 2);
    assert.equal(bodyA.next_cursor, null);
    assert.deepEqual((bodyA.operations[1] as { field_capture: unknown }).field_capture, fieldCapture);
    const rawBody = JSON.stringify(bodyA);
    assert.equal(rawBody.includes(fixture.secretToken), false, "el token de autorización no debe salir");
    assert.equal(rawBody.includes(fixture.otherTechnicianOperationId), false, "no se mezclan operaciones de otro técnico");

    // Segundo dispositivo: otra sesión del mismo técnico, con su propio dispositivo, ve el mismo registro.
    const deviceB = await get("/v1/technician/record", fixture.secondDeviceToken);
    assert.deepEqual(await deviceB.json(), bodyA);

    // Filtro por orden y paginación con cursor.
    const orderOnly = await get(`/v1/technician/record?order_id=${fixture.orderId}`, fixture.technicianToken);
    assert.equal((await orderOnly.json() as { total: number }).total, 2);
    const firstPage = await (await get("/v1/technician/record?limit=1", fixture.technicianToken)).json() as { operations: Array<{ operation_id: string }>; total: number; next_cursor: string | null };
    assert.deepEqual(firstPage.operations.map((item) => item.operation_id), [fixture.visitOperationId]);
    assert.equal(firstPage.total, 2);
    assert.equal(firstPage.next_cursor, "1");
    const secondPage = await (await get("/v1/technician/record?limit=1&cursor=1", fixture.technicianToken)).json() as { operations: Array<{ operation_id: string }>; next_cursor: string | null };
    assert.deepEqual(secondPage.operations.map((item) => item.operation_id), [fixture.cutOperationId]);
    assert.equal(secondPage.next_cursor, null);

    // Otro técnico solo ve su propia operación.
    const otherTechnician = await (await get("/v1/technician/record", fixture.otherTechnicianToken)).json() as { operations: Array<{ operation_id: string }> };
    assert.deepEqual(otherTechnician.operations.map((item) => item.operation_id), [fixture.otherTechnicianOperationId]);

    // Validaciones y roles.
    assert.equal((await get("/v1/technician/record?order_id=no-es-uuid", fixture.technicianToken)).status, 400);
    assert.equal((await get("/v1/technician/record?limit=0", fixture.technicianToken)).status, 400);
    assert.equal((await get("/v1/technician/record", fixture.adminToken)).status, 403);
    assert.equal((await fetch(`${base}/v1/technician/record`)).status, 401);

    // Cada consulta válida del técnico queda auditada (cinco: dos dispositivos, filtro y dos páginas), sin datos del
    // registro en el evento. Las peticiones rechazadas antes del servicio no se auditan.
    const audit = await pool.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_events WHERE action = 'TECHNICIAN_RECORD_READ' AND actor_id = $1",
      [fixture.technicianId],
    );
    assert.equal(audit.rows.length, 5);
    assert.equal(JSON.stringify(audit.rows).includes(fixture.visitOperationId), false);
    assert.equal(JSON.stringify(audit.rows).includes(fixture.secretToken), false);
    assert.ok(audit.rows.some((event) => event.metadata.returned === 2 && event.metadata.total === 2));
  } finally {
    await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve());
  }
});

test.after(async () => {
  await pool.end();
});

async function createFixture() {
  const technicianId = randomUUID();
  const otherTechnicianId = randomUUID();
  const adminId = randomUUID();
  const debtorId = randomUUID();
  const orderId = randomUUID();
  const otherOrderId = randomUUID();
  const suffix = randomUUID();
  const technicianToken = `record-tech-${suffix}`;
  const secondDeviceToken = `record-tech-device-b-${suffix}`;
  const otherTechnicianToken = `record-other-${suffix}`;
  const adminToken = `record-admin-${suffix}`;
  const secretToken = `secret-auth-token-${suffix}`;
  const cutOperationId = `cut-${suffix}`;
  const visitOperationId = `visit-${suffix}`;
  const otherTechnicianOperationId = `other-${suffix}`;

  await pool.query(
    "INSERT INTO users(user_id, username, display_name, role, password_hash, source) VALUES ($1, $2, 'Técnico registro', 'TECHNICIAN', 'synthetic', 'PILOT_PROVISIONAL'), ($3, $4, 'Otro técnico', 'TECHNICIAN', 'synthetic', 'PILOT_PROVISIONAL'), ($5, $6, 'Admin registro', 'ADMIN', 'synthetic', 'PILOT_PROVISIONAL')",
    [technicianId, `record-tech-${suffix}`, otherTechnicianId, `record-other-${suffix}`, adminId, `record-admin-${suffix}`],
  );
  await pool.query(
    "INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source, active_role) VALUES ($1, $2, $3, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'TECHNICIAN'), ($4, $2, $5, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'TECHNICIAN'), ($6, $7, $8, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'TECHNICIAN'), ($9, $10, $11, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'ADMIN')",
    [randomUUID(), technicianId, hashToken(technicianToken), randomUUID(), hashToken(secondDeviceToken), randomUUID(), otherTechnicianId, hashToken(otherTechnicianToken), randomUUID(), adminId, hashToken(adminToken)],
  );
  await pool.query(
    "INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, meter_id, area, locality, route, debt_cents, months_pending, updated_at, source) VALUES ($1, $2, $3, 'Cliente registro', 'Dirección sintética', 'MTR-RECORD', 'A', 'B', 'C', 1234, 2, $4, 'PILOT_PROVISIONAL')",
    [debtorId, `record-account-${suffix}`, `record-supply-${suffix}`, timestamp],
  );
  await pool.query(
    "INSERT INTO orders(order_id, debtor_id, purpose, status, physical_status, version, created_by, assigned_technician_id, source) VALUES ($1, $2, 'CUT', 'EJECUTADO', 'CONFIRMED', 3, $3, $4, 'PILOT_PROVISIONAL'), ($5, $2, 'CUT', 'GENERADO', 'NONE', 1, $3, $6, 'PILOT_PROVISIONAL')",
    [orderId, debtorId, adminId, technicianId, otherOrderId, otherTechnicianId],
  );
  await pool.query(
    "INSERT INTO sync_operations(operation_id, technician_id, device_id, order_id, action, payload, payload_hash, status, acknowledged_at, source, created_at) VALUES ($1, $2, 'device-a', $3, 'CUT', $4, $5, 'acknowledged', $6, 'PILOT_PROVISIONAL', $6), ($7, $2, 'device-a', $3, 'VISIT', $8, $5, 'acknowledged', $9, 'PILOT_PROVISIONAL', $9), ($10, $11, 'device-x', $12, 'VISIT', $13, $5, 'acknowledged', $6, 'PILOT_PROVISIONAL', $6)",
    [
      cutOperationId, technicianId, orderId,
      JSON.stringify({ operation_id: cutOperationId, action: "CUT", recorded_at: timestamp, order_version: 2, evidence_refs: [], field_capture: fieldCapture, authorization_token: secretToken }),
      "a".repeat(64), "2026-10-01T10:00:01.000Z",
      visitOperationId, JSON.stringify({ operation_id: visitOperationId, action: "VISIT", recorded_at: "2026-10-01T10:05:00.000Z", reason: "Cliente ausente" }), "2026-10-01T10:05:01.000Z",
      otherTechnicianOperationId, otherTechnicianId, otherOrderId, JSON.stringify({ operation_id: otherTechnicianOperationId, action: "VISIT", recorded_at: timestamp, reason: "Ajeno" }),
    ],
  );
  return { technicianId, technicianToken, secondDeviceToken, otherTechnicianToken, adminToken, secretToken, orderId, cutOperationId, visitOperationId, otherTechnicianOperationId };
}
