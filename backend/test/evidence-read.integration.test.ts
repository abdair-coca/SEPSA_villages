import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
import { Application } from "../src/http/application.js";
import { hashToken } from "../src/shared/auth-crypto.js";
import type { Config } from "../src/config.js";
import { requireLocalDatabaseUrl } from "../scripts/local-database-guard.mjs";

const databaseUrl = requireLocalDatabaseUrl(process.env.DATABASE_URL, "the evidence read integration test (run `npm run db:migrate:test` first)");
const config: Config = { host: "127.0.0.1", port: 0, databaseUrl, sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, maxBodyBytes: 4 * 1024 * 1024, corsOrigin: "http://localhost:5173" };
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

test("el técnico lee su propia foto desde otro dispositivo, con los bytes y el hash originales", async () => {
  const fixture = await createFixture();
  let server: Server | undefined;
  try {
    server = createServer((request, response) => { void new Application(pool, config).handle(request, response); });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const upload = await fetch(`${base}/v1/evidence/assets`, {
      method: "POST",
      headers: { authorization: `Bearer ${fixture.technicianToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        evidence_id: fixture.evidenceId, order_id: fixture.orderId, operation_id: fixture.operationId, device_id: "device-a",
        mime_type: "image/jpeg", content_hash: fixture.hash, content_base64: fixture.bytes.toString("base64"),
      }),
    });
    assert.equal(upload.status, 200, await upload.clone().text());

    const read = (token: string, id = fixture.evidenceId) => fetch(`${base}/v1/evidence/assets/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } });

    // Dispositivo A y dispositivo B (otra sesión del mismo técnico) reciben los mismos bytes y el mismo hash.
    const fromDeviceA = await read(fixture.technicianToken);
    assert.equal(fromDeviceA.status, 200);
    const bodyA = await fromDeviceA.json() as Record<string, string>;
    assert.equal(Buffer.from(bodyA.content_base64 ?? "", "base64").equals(fixture.bytes), true, "los bytes leídos deben ser los subidos");
    assert.equal(bodyA.content_hash, fixture.hash);
    assert.equal(bodyA.mime_type, "image/jpeg");
    assert.equal(bodyA.order_id, fixture.orderId);
    assert.equal(bodyA.operation_id, fixture.operationId);
    assert.equal(bodyA.source, "PILOT_PROVISIONAL");
    const fromDeviceB = await read(fixture.secondDeviceToken);
    assert.deepEqual(await fromDeviceB.json(), bodyA);

    // Una foto ajena y una inexistente responden igual: no se revela que el identificador exista.
    const foreign = await read(fixture.otherTechnicianToken);
    const missing = await read(fixture.technicianToken, `missing-${fixture.suffix}`);
    assert.equal(foreign.status, 404);
    assert.equal(missing.status, 404);
    assert.equal((await foreign.json() as { code: string }).code, "EVIDENCE_NOT_FOUND");
    assert.equal((await missing.json() as { code: string }).code, "EVIDENCE_NOT_FOUND");

    // Roles, sesión y validación del identificador.
    assert.equal((await read(fixture.adminToken)).status, 403);
    assert.equal((await fetch(`${base}/v1/evidence/assets/${fixture.evidenceId}`)).status, 401);
    assert.equal((await read(fixture.technicianToken, "x".repeat(201))).status, 400);

    // Cada lectura válida del técnico queda auditada, sin el contenido de la foto.
    const audit = await pool.query<{ actor_id: string; entity_id: string; metadata: Record<string, unknown> }>(
      "SELECT actor_id, entity_id, metadata FROM audit_events WHERE action = 'TECHNICIAN_EVIDENCE_READ' AND entity_id = $1",
      [fixture.evidenceId],
    );
    assert.equal(audit.rows.length, 2, "dos lecturas válidas del técnico, ninguna de la ajena ni de la inexistente");
    assert.ok(audit.rows.every((event) => event.actor_id === fixture.technicianId));
    assert.equal(JSON.stringify(audit.rows).includes(fixture.bytes.toString("base64").slice(0, 40)), false);
  } finally {
    await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve());
  }
});

test.after(async () => {
  await pool.end();
});

async function createFixture() {
  const suffix = randomUUID();
  const technicianId = randomUUID();
  const otherTechnicianId = randomUUID();
  const adminId = randomUUID();
  const debtorId = randomUUID();
  const orderId = randomUUID();
  const technicianToken = `evidence-tech-${suffix}`;
  const secondDeviceToken = `evidence-tech-b-${suffix}`;
  const otherTechnicianToken = `evidence-other-${suffix}`;
  const adminToken = `evidence-admin-${suffix}`;
  const timestamp = "2026-10-01T10:00:00.000Z";
  const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 180, g: 20, b: 20 } } }).jpeg().toBuffer();
  const hash = createHash("sha256").update(bytes).digest("hex");

  await pool.query(
    "INSERT INTO users(user_id, username, display_name, role, password_hash, source) VALUES ($1, $2, 'Técnico foto', 'TECHNICIAN', 'synthetic', 'PILOT_PROVISIONAL'), ($3, $4, 'Otro técnico foto', 'TECHNICIAN', 'synthetic', 'PILOT_PROVISIONAL'), ($5, $6, 'Admin foto', 'ADMIN', 'synthetic', 'PILOT_PROVISIONAL')",
    [technicianId, `evidence-tech-${suffix}`, otherTechnicianId, `evidence-other-${suffix}`, adminId, `evidence-admin-${suffix}`],
  );
  await pool.query(
    "INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source, active_role) VALUES ($1, $2, $3, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'TECHNICIAN'), ($4, $2, $5, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'TECHNICIAN'), ($6, $7, $8, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'TECHNICIAN'), ($9, $10, $11, now() + interval '1 hour', 'PILOT_PROVISIONAL', 'ADMIN')",
    [randomUUID(), technicianId, hashToken(technicianToken), randomUUID(), hashToken(secondDeviceToken), randomUUID(), otherTechnicianId, hashToken(otherTechnicianToken), randomUUID(), adminId, hashToken(adminToken)],
  );
  await pool.query(
    "INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, meter_id, area, locality, route, debt_cents, months_pending, updated_at, source) VALUES ($1, $2, $3, 'Cliente foto', 'Dirección sintética', 'MTR-FOTO', 'A', 'B', 'C', 1234, 2, $4, 'PILOT_PROVISIONAL')",
    [debtorId, `evidence-account-${suffix}`, `evidence-supply-${suffix}`, timestamp],
  );
  await pool.query(
    "INSERT INTO orders(order_id, debtor_id, purpose, status, physical_status, version, created_by, assigned_technician_id, source) VALUES ($1, $2, 'CUT', 'GENERADO', 'NONE', 1, $3, $4, 'PILOT_PROVISIONAL')",
    [orderId, debtorId, adminId, technicianId],
  );
  return { suffix, technicianId, technicianToken, secondDeviceToken, otherTechnicianToken, adminToken, orderId, evidenceId: `evidence-${suffix}`, operationId: `visit-${suffix}`, bytes, hash };
}
