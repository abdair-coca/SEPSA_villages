/**
 * SQL de la auditoría (`audit_events`): inserción y consulta paginada.
 * `insertAudit` se llama dentro de la misma transacción que el cambio que audita, para que no exista un cambio
 * sin su evento (ni un evento sin su cambio).
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Queryable } from "../db.js";
import type { Role } from "../types.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";
import type { PageRequest } from "../shared/pagination.js";

export interface AuditRow {
  audit_id: string;
  actor_id: string;
  actor_role: Role | null;
  action: string;
  entity_id: string | null;
  order_id: string | null;
  operation_id: string | null;
  result: string;
  reason: string | null;
  device_id: string | null;
  occurred_at: string;
  transition: unknown;
  metadata: unknown;
}

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

/** Página de auditoría visible para el ADMIN: oculta pagos y limpia motivos y metadatos de pago. */
export async function listAuditEvents(db: Queryable, orderId: string | null, page: PageRequest): Promise<AuditRow[]> {
  const result = await db.query<AuditRow>(
    `SELECT audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, CASE WHEN reason ~* '(^|[^[:alpha:]])(payment|pago)([^[:alpha:]]|$)' THEN NULL ELSE reason END AS reason, device_id, occurred_at, transition, metadata - 'payment_authority' - 'payment_plan' - 'paid_at' AS metadata
       FROM audit_events WHERE source = $1 AND action <> 'PAYMENT_CONFIRMED_OBSERVED' AND ($2::uuid IS NULL OR order_id = $2::uuid) ORDER BY occurred_at ASC, audit_id ASC LIMIT $3 OFFSET $4`,
    [PROVISIONAL_SOURCE, orderId, page.limit, page.offset],
  );
  return result.rows;
}

export async function countAuditEvents(db: Queryable, orderId: string | null): Promise<number> {
  const count = await db.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM audit_events WHERE source = $1 AND action <> 'PAYMENT_CONFIRMED_OBSERVED' AND ($2::uuid IS NULL OR order_id = $2::uuid)", [PROVISIONAL_SOURCE, orderId]);
  return Number(count.rows[0]?.total ?? 0);
}
