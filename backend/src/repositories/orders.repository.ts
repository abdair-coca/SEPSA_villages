/**
 * SQL de órdenes (`orders`, `order_assignments`, `work_package_versions`) y del catálogo de técnicos.
 * Solo ejecuta consultas y devuelve filas; las reglas (rol, duplicados, versión, estado) viven en
 * `services/orders.service.ts` y el mapeo a JSON en `mappers/order.mapper.ts`. Los bloqueos `FOR UPDATE` /
 * `FOR SHARE` se conservan tal cual: el orden de las consultas lo decide el servicio.
 */
import type { Queryable } from "../db.js";
import type { OrderRow } from "../mappers/order.mapper.js";
import type { TechnicianRow } from "../mappers/session.mapper.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";
import { kardexColumns } from "./debtors.repository.js";

export function orderColumns(alias: string): string {
  return `${alias}.order_id, ${alias}.cuc, ${alias}.debtor_id, d.account_id, d.supply_id, ${alias}.purpose, ${alias}.status, ${alias}.physical_status, ${alias}.version, ${alias}.created_by, ${alias}.assigned_technician_id, assigned_technician.display_name AS assigned_technician_name, ${alias}.created_at,
    jsonb_build_object('debtor_id', d.debtor_id, 'account_id', d.account_id, 'supply_id', d.supply_id, 'customer_name', d.customer_name, 'address', d.address, 'references', d.reference_text, 'meter_id', d.meter_id, 'area', d.area, 'area_name', NULLIF(BTRIM(d.context->>'area_name'), ''), 'locality', d.locality, 'route', d.route, 'route_name', NULLIF(BTRIM(d.context->>'ruta_name'), ''), 'debt_cents', d.debt_cents, 'months_pending', d.months_pending, 'updated_at', d.updated_at, 'kardex', ${kardexColumns("d.kardex")}, 'source', d.source, 'circuit', d.circuit, 'customer_ci', d.customer_ci, 'contact_phone', d.contact_phone, 'tariff', d.tariff, 'supply_status', d.supply_status, 'enabling_title', d.enabling_title, 'route_order', d.route_order, 'cadastral_latitude', d.cadastral_latitude, 'cadastral_longitude', d.cadastral_longitude, 'meter_brand', d.meter_brand, 'meter_index', d.meter_index, 'meter_multiplier', d.meter_multiplier, 'claims', d.claims, 'suspension_date', d.suspension_date, 'reconnection_manual', d.reconnection_manual, 'reconnection_date', d.reconnection_date, 'reconnection_technician', d.reconnection_technician) AS context`;
}

export function orderSelect(where: string, order: string): string {
  return `SELECT ${orderColumns("o")} FROM orders o JOIN debtors d ON d.debtor_id = o.debtor_id LEFT JOIN users assigned_technician ON assigned_technician.user_id = o.assigned_technician_id AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = assigned_technician.user_id AND g.role = 'TECHNICIAN') WHERE ${where} ORDER BY ${order}`;
}

export async function listEnabledTechnicians(db: Queryable): Promise<TechnicianRow[]> {
  const result = await db.query<TechnicianRow>(
    "SELECT user_id, username, display_name, 'TECHNICIAN' AS role, enabled FROM users WHERE source = $1 AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = users.user_id AND g.role = 'TECHNICIAN') AND enabled = true ORDER BY display_name ASC, username ASC",
    [PROVISIONAL_SOURCE],
  );
  return result.rows;
}

export async function listOrders(db: Queryable): Promise<OrderRow[]> {
  const result = await db.query<OrderRow>(orderSelect("o.source = $1", "o.created_at DESC"), [PROVISIONAL_SOURCE]);
  return result.rows;
}

export async function hasActiveOrderForDebtorShared(client: Queryable, debtorId: string, purpose: string): Promise<boolean> {
  const duplicate = await client.query("SELECT order_id FROM orders WHERE debtor_id = $1 AND purpose = $2 AND status = 'GENERADO' FOR SHARE", [debtorId, purpose]);
  return Boolean(duplicate.rows[0]);
}

export async function hasActiveOrderForAccountShared(client: Queryable, accountId: string, purpose: string): Promise<boolean> {
  const duplicate = await client.query("SELECT o.order_id FROM orders o JOIN debtors d ON d.debtor_id = o.debtor_id WHERE d.account_id = $1 AND o.purpose = $2 AND o.status = 'GENERADO' FOR SHARE", [accountId, purpose]);
  return Boolean(duplicate.rows[0]);
}

export interface InsertOrderInput {
  orderId: string;
  cuc: string;
  debtorId: string;
  purpose: string;
  createdBy: string;
}

export async function insertOrder(client: Queryable, input: InsertOrderInput): Promise<void> {
  await client.query(
    `INSERT INTO orders(order_id, cuc, debtor_id, purpose, status, physical_status, version, created_by, source)
     VALUES ($1, $2, $3, $4, 'GENERADO', 'NONE', 1, $5, $6)`,
    [input.orderId, input.cuc, input.debtorId, input.purpose, input.createdBy, PROVISIONAL_SOURCE],
  );
}

export async function findOrderById(client: Queryable, orderId: string): Promise<OrderRow | undefined> {
  const result = await client.query<OrderRow>(orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC"), [orderId, PROVISIONAL_SOURCE]);
  return result.rows[0];
}

/** Lee la orden con su contexto y bloquea la fila de la orden y la del moroso hasta el fin de la transacción. */
export async function findOrderForUpdate(client: Queryable, orderId: string): Promise<OrderRow | undefined> {
  const result = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [orderId, PROVISIONAL_SOURCE]);
  return result.rows[0];
}

export async function isEnabledTechnician(client: Queryable, technicianId: string): Promise<boolean> {
  const technician = await client.query("SELECT user_id FROM users WHERE user_id = $1 AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = users.user_id AND g.role = 'TECHNICIAN') AND enabled = true AND source = $2", [technicianId, PROVISIONAL_SOURCE]);
  return Boolean(technician.rows[0]);
}

/** Asigna el técnico y sube la versión solo si la versión sigue siendo la esperada; devuelve las filas afectadas. */
export async function updateOrderAssignment(client: Queryable, orderId: string, technicianId: string, nextVersion: number, expectedVersion: number): Promise<number | null> {
  const updateResult = await client.query("UPDATE orders SET assigned_technician_id = $2, version = $3, updated_at = now() WHERE order_id = $1 AND version = $4", [orderId, technicianId, nextVersion, expectedVersion]);
  return updateResult.rowCount;
}

export interface InsertOrderAssignmentInput {
  assignmentId: string;
  orderId: string;
  technicianId: string;
  assignedBy: string;
  fromTechnicianId: string | null;
  version: number;
}

export async function insertOrderAssignment(client: Queryable, input: InsertOrderAssignmentInput): Promise<void> {
  await client.query("INSERT INTO order_assignments(assignment_id, order_id, technician_id, assigned_by, from_technician_id, version, source) VALUES ($1, $2, $3, $4, $5, $6, $7)", [input.assignmentId, input.orderId, input.technicianId, input.assignedBy, input.fromTechnicianId, input.version, PROVISIONAL_SOURCE]);
}

export async function ensureWorkPackageVersion(client: Queryable, technicianId: string, deviceId: string): Promise<void> {
  await client.query("INSERT INTO work_package_versions(technician_id, device_id, last_version) VALUES ($1, $2, 0) ON CONFLICT (technician_id, device_id) DO NOTHING", [technicianId, deviceId]);
}

export async function lockWorkPackageLastVersion(client: Queryable, technicianId: string, deviceId: string): Promise<number> {
  const currentVersion = await client.query<{ last_version: string }>("SELECT last_version::text FROM work_package_versions WHERE technician_id = $1 AND device_id = $2 FOR UPDATE", [technicianId, deviceId]);
  return Number(currentVersion.rows[0]?.last_version ?? 0);
}

export async function listOrdersAssignedTo(client: Queryable, technicianId: string): Promise<OrderRow[]> {
  const result = await client.query<OrderRow>(orderSelect("o.assigned_technician_id = $1 AND o.source = $2", "o.updated_at DESC NULLS LAST, o.order_id ASC"), [technicianId, PROVISIONAL_SOURCE]);
  return result.rows;
}

export async function updateWorkPackageVersion(client: Queryable, technicianId: string, deviceId: string, nextVersion: number): Promise<void> {
  await client.query("UPDATE work_package_versions SET last_version = $3, updated_at = now() WHERE technician_id = $1 AND device_id = $2", [technicianId, deviceId, nextVersion]);
}

/** Técnico asignado a la orden, sin bloquear. `undefined` si la orden no existe. */
export async function findOrderAssignment(db: Queryable, orderId: string): Promise<{ assigned_technician_id: string | null } | undefined> {
  const orderScope = await db.query<{ assigned_technician_id: string | null }>("SELECT assigned_technician_id FROM orders WHERE order_id = $1 AND source = $2", [orderId, PROVISIONAL_SOURCE]);
  return orderScope.rows[0];
}

/** Igual que `findOrderAssignment`, pero bloquea la fila de la orden hasta el fin de la transacción. */
export async function findOrderAssignmentForUpdate(client: Queryable, orderId: string): Promise<{ assigned_technician_id: string | null } | undefined> {
  const orderResult = await client.query<{ assigned_technician_id: string | null }>("SELECT assigned_technician_id FROM orders WHERE order_id = $1 AND source = $2 FOR UPDATE", [orderId, PROVISIONAL_SOURCE]);
  return orderResult.rows[0];
}

export interface OrderState {
  assigned_technician_id: string | null;
  status: string;
  physical_status: string;
  version: number;
}

/** Estado de la orden (asignación, estado, estado físico y versión) bloqueando su fila. */
export async function findOrderStateForUpdate(client: Queryable, orderId: string): Promise<OrderState | undefined> {
  const orderResult = await client.query<OrderState>("SELECT assigned_technician_id, status, physical_status, version FROM orders WHERE order_id = $1 AND source = $2 FOR UPDATE", [orderId, PROVISIONAL_SOURCE]);
  return orderResult.rows[0];
}

export interface HumanReviewOrderRow {
  order_id: string;
  version: number;
  status: string;
  physical_status: string;
  assigned_technician_id: string | null;
}

export async function findOrderForReviewForUpdate(client: Queryable, orderId: string): Promise<HumanReviewOrderRow | undefined> {
  const orderResult = await client.query<HumanReviewOrderRow>(
    "SELECT order_id, version, status, physical_status, assigned_technician_id FROM orders WHERE order_id = $1 AND source = $2 FOR UPDATE",
    [orderId, PROVISIONAL_SOURCE],
  );
  return orderResult.rows[0];
}

/** Marca el resultado físico como incierto (`PHYSICAL_UNKNOWN`) y sube la versión, salvo que ya esté confirmado. Devuelve las filas afectadas. */
export async function markOrderPhysicalUnknown(client: Queryable, orderId: string, expectedVersion: number): Promise<number | null> {
  const update = await client.query("UPDATE orders SET physical_status = 'PHYSICAL_UNKNOWN', version = version + 1, updated_at = now() WHERE order_id = $1 AND version = $2 AND physical_status <> 'CONFIRMED'", [orderId, expectedVersion]);
  return update.rowCount;
}

/** Confirma el corte: la orden pasa a `EJECUTADO`/`CONFIRMED` y sube la versión. Devuelve las filas afectadas. */
export async function markOrderCutExecuted(client: Queryable, orderId: string, version: number): Promise<number | null> {
  const updatedOrder = await client.query("UPDATE orders SET status = 'EJECUTADO', physical_status = 'CONFIRMED', version = version + 1, updated_at = now() WHERE order_id = $1 AND version = $2", [orderId, version]);
  return updatedOrder.rowCount;
}

/** Registra la reconexión: la orden pasa de `EJECUTADO`/`CONFIRMED` a `RECONEXIÓN` y sube la versión. Devuelve las filas afectadas. */
export async function markOrderReconnected(client: Queryable, orderId: string, version: number): Promise<number | null> {
  const updatedOrder = await client.query("UPDATE orders SET status = 'RECONEXIÓN', physical_status = 'CONFIRMED', version = version + 1, updated_at = now() WHERE order_id = $1 AND status = 'EJECUTADO' AND physical_status = 'CONFIRMED' AND version = $2", [orderId, version]);
  return updatedOrder.rowCount;
}
