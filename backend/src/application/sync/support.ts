import type { PoolClient } from "pg";
import { insertAudit } from "../audit/record.js";
import { digestJson } from "../shared/json-digest.js";
import type { SessionUser, SyncPayload } from "../../types.js";

export interface StoredOperationRow {
  operation_id: string;
  technician_id: string;
  device_id: string;
  status: string;
  payload_hash: string;
  conflict_reason: string | null;
}

export type SyncResult = { status: "acknowledged" } | { status: "conflict"; message: string };

export async function rejectSync(client: PoolClient, user: SessionUser, payload: SyncPayload, message: string): Promise<{ status: "conflict"; message: string }> {
  await client.query("UPDATE sync_operations SET status = 'conflict', conflict_reason = $2 WHERE operation_id = $1", [payload.operation_id, message]);
  await insertAudit(client, {
    actorId: user.userId,
    actorRole: user.role,
    action: "SYNC_OPERATION",
    result: "rejected",
    entityId: payload.operation_id,
    orderId: payload.order_id,
    operationId: payload.operation_id,
    deviceId: payload.device_id,
    reason: message,
    metadata: safeSyncPayload(payload),
  });
  return { status: "conflict", message };
}

export function syncReplay(row: StoredOperationRow, technicianId: string, payload: SyncPayload): SyncResult | undefined {
  if (row.technician_id !== technicianId || row.device_id !== payload.device_id || row.payload_hash !== digestJson(payload)) {
    return { status: "conflict", message: "Operation identifier is bound to another payload or device." };
  }
  if (row.status === "acknowledged") return { status: "acknowledged" };
  return { status: "conflict", message: "Operation remains unresolved and requires review." };
}

export function safeSyncPayload(payload: SyncPayload): Record<string, unknown> {
  const { authorization_token: _authorizationToken, ...safe } = payload;
  return safe;
}

export function syncReceipt(payload: SyncPayload): Record<string, unknown> {
  return {
    operation_id: payload.operation_id,
    order_id: payload.order_id,
    technician_id: payload.technician_id,
    device_id: payload.device_id,
    order_version: payload.order_version,
    action: payload.action,
    recorded_at: payload.recorded_at,
    effective_at: payload.effective_at,
    technician_name_snapshot: payload.technician_name_snapshot,
    demora: payload.demora,
    evidence_refs: payload.evidence_refs,
    field_capture: payload.field_capture,
  };
}
