/**
 * SQL de las operaciones sincronizadas (`sync_operations`). Solo ejecuta consultas y devuelve filas; las
 * reglas de idempotencia, conflicto, aceptación y revisión viven en los servicios (`services/sync*.service.ts`,
 * `services/authorizations.service.ts`). Los bloqueos `FOR UPDATE` / `FOR SHARE` se conservan tal cual.
 */
import type { Queryable } from "../db.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";

export interface StoredOperationRow {
  operation_id: string;
  technician_id: string;
  device_id: string;
  status: string;
  payload_hash: string;
  conflict_reason: string | null;
}

export interface SyncOperationLookupRow {
  operation_id: string;
  status: string;
  order_id: string;
  technician_id: string;
  device_id: string;
  action: "CUT" | "RECONNECTION" | "VISIT";
  payload: Record<string, unknown>;
}

export interface HumanReviewOperationRow {
  order_id: string;
  technician_id: string;
  device_id: string;
  status: string;
}

export async function findSyncOperationForUpdate(client: Queryable, operationId: string): Promise<StoredOperationRow | undefined> {
  const existing = await client.query<StoredOperationRow>("SELECT operation_id, technician_id, device_id, status, payload_hash, conflict_reason FROM sync_operations WHERE operation_id = $1 FOR UPDATE", [operationId]);
  return existing.rows[0];
}

export interface InsertPendingSyncOperationInput {
  operationId: string;
  technicianId: string;
  deviceId: string;
  orderId: string;
  action: string;
  safePayload: Record<string, unknown>;
  payloadHash: string;
}

/** Reserva la operación como `pending`; devuelve las filas insertadas (0 si otra petición ya la había creado). */
export async function insertPendingSyncOperation(client: Queryable, input: InsertPendingSyncOperationInput): Promise<number | null> {
  const inserted = await client.query(
    "INSERT INTO sync_operations(operation_id, technician_id, device_id, order_id, action, payload, payload_hash, status, source) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) ON CONFLICT (operation_id) DO NOTHING",
    [input.operationId, input.technicianId, input.deviceId, input.orderId, input.action, input.safePayload, input.payloadHash, PROVISIONAL_SOURCE],
  );
  return inserted.rowCount;
}

export async function markSyncOperationAcknowledged(client: Queryable, operationId: string): Promise<void> {
  await client.query("UPDATE sync_operations SET status = 'acknowledged', conflict_reason = NULL, acknowledged_at = now() WHERE operation_id = $1", [operationId]);
}

export async function markSyncOperationConflict(client: Queryable, operationId: string, reason: string): Promise<void> {
  await client.query("UPDATE sync_operations SET status = 'conflict', conflict_reason = $2 WHERE operation_id = $1", [operationId, reason]);
}

/** Operaciones CUT confirmadas de la orden, bloqueadas en modo compartido: un ciclo de corte válido tiene exactamente una. */
export async function listAcknowledgedCutOperationsShared(client: Queryable, orderId: string): Promise<string[]> {
  const cuts = await client.query<{ operation_id: string }>("SELECT operation_id FROM sync_operations WHERE order_id = $1 AND action = 'CUT' AND status = 'acknowledged' FOR SHARE", [orderId]);
  return cuts.rows.map((row) => row.operation_id);
}

/** Consulta de una operación: el ADMIN ve cualquiera y el técnico solo las suyas. */
export async function findSyncOperationForLookup(db: Queryable, operationId: string, role: string, userId: string): Promise<SyncOperationLookupRow | undefined> {
  const result = await db.query<SyncOperationLookupRow>(
    `SELECT operation_id, status, order_id, technician_id, device_id, action, payload
       FROM sync_operations WHERE operation_id = $1 AND ($2::text = 'ADMIN' OR technician_id = $3)`,
    [operationId, role, userId],
  );
  return result.rows[0];
}

export async function findSyncOperationForReview(client: Queryable, operationId: string): Promise<HumanReviewOperationRow | undefined> {
  const operationResult = await client.query<HumanReviewOperationRow>(
    "SELECT order_id, technician_id, device_id, status FROM sync_operations WHERE operation_id = $1 FOR UPDATE",
    [operationId],
  );
  return operationResult.rows[0];
}
