/**
 * Inserción de eventos de auditoría. Se llama dentro de la misma transacción que el cambio que audita,
 * para que no exista un cambio sin su evento (ni un evento sin su cambio).
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Role } from "../../types.js";
import { PROVISIONAL_SOURCE } from "../application-context.js";

export interface AuditInput {
  actorId: string;
  actorRole: Role;
  action: string;
  result: "accepted" | "rejected";
  entityId?: string;
  orderId?: string;
  operationId?: string;
  deviceId?: string;
  reason?: string;
  transition?: { before: string | null; after: string; version: number };
  metadata?: unknown;
}

export function insertAudit(client: PoolClient, input: AuditInput): Promise<void> {
  return client.query(
    `INSERT INTO audit_events(audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, reason, device_id, transition, metadata, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      randomUUID(), input.actorId, input.actorRole, input.action,
      input.entityId ?? null, input.orderId ?? null, input.operationId ?? null,
      input.result, input.reason ?? null, input.deviceId ?? null,
      input.transition ?? null, input.metadata ?? null, PROVISIONAL_SOURCE,
    ],
  ).then(() => undefined);
}
