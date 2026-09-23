import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const SOURCE = "PILOT_PROVISIONAL";
const DATASET = "EXCEL_20260922";
const MIGRATION_LOCK = "sepsa:field-test:excel-20260922";
const EXPECTED_DEBTOR_COUNT = 99;
const EXPECTED_ELIGIBLE_COUNT = 10;
const ADMIN_USERNAME = "admin.sepsa";
const TECHNICIAN_USERNAME = "jhonny.moya";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the field-test migration.");
}

const dataPath = resolve(dirname(fileURLToPath(import.meta.url)), "data", "EXCEL_20260922.json");
const rows = JSON.parse(await readFile(dataPath, "utf8"));
validateDataset(rows);

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [MIGRATION_LOCK]);

  const admin = await findRequiredUser(client, ADMIN_USERNAME, "ADMIN");
  const technician = await findRequiredUser(client, TECHNICIAN_USERNAME, "TECHNICIAN");

  for (const row of rows) {
    await upsertDebtor(client, row);
  }

  let createdOrders = 0;
  let assignedExistingOrders = 0;
  let skippedExistingOrders = 0;
  for (const row of rows.filter(isEligible)) {
    const result = await ensureOrder(client, row, admin.user_id, technician.user_id);
    if (result === "created") createdOrders += 1;
    if (result === "assigned-existing") assignedExistingOrders += 1;
    if (result === "skipped-existing") skippedExistingOrders += 1;
  }

  await client.query("COMMIT");
  console.log(JSON.stringify({
    dataset: DATASET,
    debtorRows: rows.length,
    eligibleRows: rows.filter(isEligible).length,
    createdOrders,
    assignedExistingOrders,
    skippedExistingOrders,
    assignedTechnician: TECHNICIAN_USERNAME,
  }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

function validateDataset(dataset) {
  if (!Array.isArray(dataset) || dataset.length !== EXPECTED_DEBTOR_COUNT) {
    throw new Error(`Expected ${EXPECTED_DEBTOR_COUNT} debtor rows in ${DATASET}.`);
  }
  const debtorIds = new Set(dataset.map((row) => row.debtor_id));
  const accountIds = new Set(dataset.map((row) => row.account_id));
  if (debtorIds.size !== dataset.length || accountIds.size !== dataset.length) {
    throw new Error("The migration dataset contains duplicate debtor or account identifiers.");
  }
  const eligibleCount = dataset.filter(isEligible).length;
  if (eligibleCount !== EXPECTED_ELIGIBLE_COUNT) {
    throw new Error(`Expected ${EXPECTED_ELIGIBLE_COUNT} eligible rows, received ${eligibleCount}.`);
  }
}

function isEligible(row) {
  return row.debt_cents > 0 && row.months_pending >= 3;
}

async function findRequiredUser(client, username, role) {
  const result = await client.query(
    `SELECT user_id
       FROM users
      WHERE username = $1
        AND role = $2
        AND enabled = true
        AND source = $3`,
    [username, role, SOURCE],
  );
  if (!result.rows[0]) throw new Error(`Required enabled ${role} user ${username} was not found.`);
  return result.rows[0];
}

async function upsertDebtor(client, row) {
  await client.query(
    `INSERT INTO debtors (
       debtor_id, account_id, supply_id, customer_name, address, reference_text, meter_id,
       area, locality, route, debt_cents, months_pending, kardex, context, updated_at,
       source, circuit, customer_ci, contact_phone, tariff, supply_status, enabling_title,
       route_order, cadastral_latitude, cadastral_longitude, meter_brand, meter_index,
       meter_multiplier, claims, payment_plan, suspension_date, reconnection_manual,
       reconnection_date, reconnection_technician
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15,
       $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
       $32, $33, $34
     )
     ON CONFLICT (debtor_id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       supply_id = EXCLUDED.supply_id,
       customer_name = EXCLUDED.customer_name,
       address = EXCLUDED.address,
       reference_text = CASE WHEN EXCLUDED.reference_text <> '' THEN EXCLUDED.reference_text ELSE debtors.reference_text END,
       meter_id = EXCLUDED.meter_id,
       area = EXCLUDED.area,
       locality = EXCLUDED.locality,
       route = EXCLUDED.route,
       debt_cents = EXCLUDED.debt_cents,
       months_pending = EXCLUDED.months_pending,
       context = debtors.context || EXCLUDED.context,
       updated_at = EXCLUDED.updated_at,
       source = EXCLUDED.source,
       circuit = EXCLUDED.circuit,
       contact_phone = COALESCE(EXCLUDED.contact_phone, debtors.contact_phone),
       tariff = EXCLUDED.tariff,
       supply_status = EXCLUDED.supply_status,
       enabling_title = COALESCE(EXCLUDED.enabling_title, debtors.enabling_title),
       route_order = EXCLUDED.route_order,
       cadastral_latitude = COALESCE(EXCLUDED.cadastral_latitude, debtors.cadastral_latitude),
       cadastral_longitude = COALESCE(EXCLUDED.cadastral_longitude, debtors.cadastral_longitude),
       meter_brand = COALESCE(EXCLUDED.meter_brand, debtors.meter_brand),
       meter_index = EXCLUDED.meter_index,
       meter_multiplier = COALESCE(EXCLUDED.meter_multiplier, debtors.meter_multiplier),
       claims = COALESCE(EXCLUDED.claims, debtors.claims),
       payment_plan = COALESCE(EXCLUDED.payment_plan, debtors.payment_plan),
       suspension_date = COALESCE(EXCLUDED.suspension_date, debtors.suspension_date),
       reconnection_manual = COALESCE(EXCLUDED.reconnection_manual, debtors.reconnection_manual),
       reconnection_date = COALESCE(EXCLUDED.reconnection_date, debtors.reconnection_date),
       reconnection_technician = COALESCE(EXCLUDED.reconnection_technician, debtors.reconnection_technician)`,
    [
      row.debtor_id, row.account_id, row.supply_id, row.customer_name, row.address, row.reference_text,
      row.meter_id, row.area, row.locality, row.route, row.debt_cents, row.months_pending,
      JSON.stringify(row.kardex), JSON.stringify(row.context), row.updated_at, SOURCE, row.circuit,
      row.customer_ci, row.contact_phone, row.tariff, row.supply_status, row.enabling_title,
      row.route_order, row.cadastral_latitude, row.cadastral_longitude, row.meter_brand, row.meter_index,
      row.meter_multiplier, row.claims, row.payment_plan, row.suspension_date, row.reconnection_manual,
      row.reconnection_date, row.reconnection_technician,
    ],
  );
}

async function ensureOrder(client, row, adminId, technicianId) {
  const existing = await client.query(
    `SELECT order_id, assigned_technician_id, status, version
       FROM orders
      WHERE debtor_id = $1
        AND purpose = 'CUT'
        AND source = $2
      ORDER BY created_at DESC
      FOR UPDATE`,
    [row.debtor_id, SOURCE],
  );
  const active = existing.rows.find((order) => order.status === "GENERADO");
  if (active) {
    if (active.assigned_technician_id && active.assigned_technician_id !== technicianId) {
      throw new Error(`Active order for ${row.debtor_id} is assigned to another technician.`);
    }
    if (active.assigned_technician_id === technicianId) return "skipped-existing";
    const nextVersion = active.version + 1;
    await client.query(
      `UPDATE orders
          SET assigned_technician_id = $2, version = $3, updated_at = now()
        WHERE order_id = $1 AND version = $4`,
      [active.order_id, technicianId, nextVersion, active.version],
    );
    await insertAssignmentAudit(client, {
      orderId: active.order_id,
      technicianId,
      adminId,
      version: nextVersion,
      operationId: `FIELD-TEST-${DATASET}-ASSIGN-${row.account_id}`,
      assignmentId: deterministicId("assignment", row.debtor_id),
      auditId: deterministicId("assign-audit", row.debtor_id),
      before: null,
    });
    return "assigned-existing";
  }

  const orderId = deterministicId("order", row.debtor_id);
  const assignmentId = deterministicId("assignment", row.debtor_id);
  const createAuditId = deterministicId("create-audit", row.debtor_id);
  const assignAuditId = deterministicId("assign-audit", row.debtor_id);
  const cuc = `CUC-${DATASET}-${row.account_id}`;
  const inserted = await client.query(
    `INSERT INTO orders (order_id, cuc, debtor_id, purpose, status, physical_status, version, created_by, assigned_technician_id, source)
     VALUES ($1, $2, $3, 'CUT', 'GENERADO', 'NONE', 2, $4, $5, $6)
     ON CONFLICT (order_id) DO NOTHING`,
    [orderId, cuc, row.debtor_id, adminId, technicianId, SOURCE],
  );
  if (inserted.rowCount === 0) return "skipped-existing";

  await client.query(
    `INSERT INTO audit_events (audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, transition, metadata, source)
     VALUES ($1, $2, 'ADMIN', 'CREATE_ORDER', $3, $3, $4, 'accepted', $5::jsonb, $6::jsonb, $7)
     ON CONFLICT (audit_id) DO NOTHING`,
    [
      createAuditId, adminId, orderId, `FIELD-TEST-${DATASET}-CREATE-${row.account_id}`,
      JSON.stringify({ before: null, after: "GENERADO", version: 1 }),
      JSON.stringify({ field_test: true, dataset: DATASET, debtor_id: row.debtor_id }), SOURCE,
    ],
  );
  await client.query(
    `INSERT INTO order_assignments (assignment_id, order_id, technician_id, assigned_by, from_technician_id, version, source)
     VALUES ($1, $2, $3, $4, NULL, 2, $5)
     ON CONFLICT (assignment_id) DO NOTHING`,
    [assignmentId, orderId, technicianId, adminId, SOURCE],
  );
  await client.query(
    `INSERT INTO audit_events (audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, transition, metadata, source)
     VALUES ($1, $2, 'ADMIN', 'ASSIGN_ORDER', $3, $3, $4, 'accepted', $5::jsonb, $6::jsonb, $7)
     ON CONFLICT (audit_id) DO NOTHING`,
    [
      assignAuditId, adminId, orderId, `FIELD-TEST-${DATASET}-ASSIGN-${row.account_id}`,
      JSON.stringify({ before: null, after: technicianId, version: 2 }),
      JSON.stringify({ field_test: true, dataset: DATASET, technician_username: TECHNICIAN_USERNAME }), SOURCE,
    ],
  );
  return "created";
}

async function insertAssignmentAudit(client, input) {
  await client.query(
    `INSERT INTO order_assignments (assignment_id, order_id, technician_id, assigned_by, from_technician_id, version, source)
     VALUES ($1, $2, $3, $4, NULL, $5, $6)
     ON CONFLICT (assignment_id) DO NOTHING`,
    [input.assignmentId, input.orderId, input.technicianId, input.adminId, input.version, SOURCE],
  );
  await client.query(
    `INSERT INTO audit_events (audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, transition, metadata, source)
     VALUES ($1, $2, 'ADMIN', 'ASSIGN_ORDER', $3, $3, $4, 'accepted', $5::jsonb, $6::jsonb, $7)
     ON CONFLICT (audit_id) DO NOTHING`,
    [
      input.auditId, input.adminId, input.orderId, input.operationId,
      JSON.stringify({ before: input.before, after: input.technicianId, version: input.version }),
      JSON.stringify({ field_test: true, dataset: DATASET, technician_username: TECHNICIAN_USERNAME }), SOURCE,
    ],
  );
}

function deterministicId(kind, debtorId) {
  const hex = createHashHex(`${DATASET}:${kind}:${debtorId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-${(parseInt(hex.slice(16, 18), 16) & 0x3f | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function createHashHex(value) {
  return createHash("sha256").update(value).digest("hex");
}
