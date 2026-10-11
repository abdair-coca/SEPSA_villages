/**
 * Aplica una operación sincronizada dentro de una transacción.
 * - Idempotencia: el mismo `operation_id` con el mismo payload devuelve el mismo recibo; con otro payload o
 *   dispositivo, conflicto. Una operación que quedó en conflicto no se reprocesa: requiere revisión.
 * - La orden debe estar asignada al técnico. Las visitas se aceptan sin tocar la orden.
 * - Cortes y reconexiones se delegan en `physical-operations.ts`.
 */
import type { PoolClient } from "pg";
import type { SessionUser, SyncPayload } from "../types.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";
import { insertAudit } from "../repositories/audit.repository.js";
import { orderSelect, type OrderRow } from "../mappers/order.mapper.js";
import { digestJson } from "../shared/json-digest.js";
import { applyPhysicalOperation } from "./sync-physical-operations.service.js";
import { validateCaptureMeter } from "./sync-payload-validation.service.js";
import { rejectSync, safeSyncPayload, syncReplay, type StoredOperationRow, type SyncResult } from "./sync-support.service.js";

export async function applySync(client: PoolClient, user: SessionUser, payload: SyncPayload): Promise<SyncResult> {
  const existing = await client.query<StoredOperationRow>("SELECT operation_id, technician_id, device_id, status, payload_hash, conflict_reason FROM sync_operations WHERE operation_id = $1 FOR UPDATE", [payload.operation_id]);
  const replay = existing.rows[0] ? syncReplay(existing.rows[0], user.userId, payload) : undefined;
  if (replay) return replay;
  if (!existing.rows[0]) {
    const inserted = await client.query(
      "INSERT INTO sync_operations(operation_id, technician_id, device_id, order_id, action, payload, payload_hash, status, source) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) ON CONFLICT (operation_id) DO NOTHING",
      [payload.operation_id, user.userId, payload.device_id, payload.order_id, payload.action, safeSyncPayload(payload), digestJson(payload), PROVISIONAL_SOURCE],
    );
    if (inserted.rowCount !== 1) {
      const concurrent = await client.query<StoredOperationRow>("SELECT operation_id, technician_id, device_id, status, payload_hash, conflict_reason FROM sync_operations WHERE operation_id = $1 FOR UPDATE", [payload.operation_id]);
      return concurrent.rows[0] ? syncReplay(concurrent.rows[0], user.userId, payload) ?? { status: "conflict", message: "Operation is already in progress." } : { status: "conflict", message: "Operation is already in progress." };
    }
  } else {
    // Existe pero no es un replay aceptado: quedó en conflicto y solo se resuelve por revisión.
    return { status: "conflict", message: "Operation remains unresolved and requires review." };
  }

  const orderResult = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [payload.order_id, PROVISIONAL_SOURCE]);
  const order = orderResult.rows[0];
  if (!order) return rejectSync(client, user, payload, "Order was not found.");
  if (order.assigned_technician_id !== user.userId) return rejectSync(client, user, payload, "Order is not assigned to current technician.");
  if (payload.action === "CUT") validateCaptureMeter(payload.field_capture, order.context);
  if (payload.action === "VISIT") {
    await client.query("UPDATE sync_operations SET status = 'acknowledged', conflict_reason = NULL, acknowledged_at = now() WHERE operation_id = $1", [payload.operation_id]);
    await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_VISIT", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload) });
    return { status: "acknowledged" };
  }
  return applyPhysicalOperation(client, user, payload, order);
}
