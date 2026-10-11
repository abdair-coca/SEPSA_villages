/**
 * Aplica una operación sincronizada dentro de una transacción.
 * - Idempotencia: el mismo `operation_id` con el mismo payload devuelve el mismo recibo; con otro payload o
 *   dispositivo, conflicto. Una operación que quedó en conflicto no se reprocesa: requiere revisión.
 * - La orden debe estar asignada al técnico. Las visitas se aceptan sin tocar la orden.
 * - Cortes y reconexiones se delegan en `sync-physical-operations.service.ts`.
 * El SQL está en `repositories/`; el orden de las consultas es el original.
 */
import type { PoolClient } from "pg";
import { insertAudit } from "../repositories/audit.repository.js";
import { findOrderForUpdate } from "../repositories/orders.repository.js";
import { findSyncOperationForUpdate, insertPendingSyncOperation, markSyncOperationAcknowledged } from "../repositories/sync.repository.js";
import { digestJson } from "../shared/json-digest.js";
import type { SessionUser, SyncPayload } from "../types.js";
import { validateCaptureMeter } from "./sync-payload-validation.service.js";
import { applyPhysicalOperation } from "./sync-physical-operations.service.js";
import { rejectSync, safeSyncPayload, syncReplay, type SyncResult } from "./sync-support.service.js";

export async function applySync(client: PoolClient, user: SessionUser, payload: SyncPayload): Promise<SyncResult> {
  const existing = await findSyncOperationForUpdate(client, payload.operation_id);
  const replay = existing ? syncReplay(existing, user.userId, payload) : undefined;
  if (replay) return replay;
  if (!existing) {
    const insertedCount = await insertPendingSyncOperation(client, {
      operationId: payload.operation_id,
      technicianId: user.userId,
      deviceId: payload.device_id,
      orderId: payload.order_id,
      action: payload.action,
      safePayload: safeSyncPayload(payload),
      payloadHash: digestJson(payload),
    });
    if (insertedCount !== 1) {
      const concurrent = await findSyncOperationForUpdate(client, payload.operation_id);
      return concurrent ? syncReplay(concurrent, user.userId, payload) ?? { status: "conflict", message: "La operación ya está en curso." } : { status: "conflict", message: "La operación ya está en curso." };
    }
  } else {
    // Existe pero no es un replay aceptado: quedó en conflicto y solo se resuelve por revisión.
    return { status: "conflict", message: "La operación sigue sin resolverse y requiere revisión." };
  }

  const order = await findOrderForUpdate(client, payload.order_id);
  if (!order) return rejectSync(client, user, payload, "No se encontró la orden.");
  if (order.assigned_technician_id !== user.userId) return rejectSync(client, user, payload, "La orden no está asignada al técnico actual.");
  if (payload.action === "CUT") validateCaptureMeter(payload.field_capture, order.context);
  if (payload.action === "VISIT") {
    await markSyncOperationAcknowledged(client, payload.operation_id);
    await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_VISIT", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload) });
    return { status: "acknowledged" };
  }
  return applyPhysicalOperation(client, user, payload, order);
}
