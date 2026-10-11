/**
 * Consulta de la auditoría (solo ADMIN), paginada y filtrable por orden.
 */
import type { ServerResponse } from "node:http";
import { sendJson, HttpError } from "../../http.js";
import type { Role, SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { isUuid, requireRole } from "../shared/request-validation.js";
import { pageRequest, pageResponse } from "../shared/pagination.js";

interface AuditRow {
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

export interface AuditHandlers {
  listAudit(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
}

export function createAuditHandlers(context: ApplicationContext): AuditHandlers {
  async function listAudit(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    requireRole(user, "ADMIN");
    const orderId = url.searchParams.get("order_id");
    if (orderId && !isUuid(orderId)) throw new HttpError(400, "INVALID_REQUEST", "order_id must be a UUID.");
    const page = pageRequest(url);
    const result = await context.pool.query<AuditRow>(
      `SELECT audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, CASE WHEN reason ~* '(^|[^[:alpha:]])(payment|pago)([^[:alpha:]]|$)' THEN NULL ELSE reason END AS reason, device_id, occurred_at, transition, metadata - 'payment_authority' - 'payment_plan' - 'paid_at' AS metadata
       FROM audit_events WHERE source = $1 AND action <> 'PAYMENT_CONFIRMED_OBSERVED' AND ($2::uuid IS NULL OR order_id = $2::uuid) ORDER BY occurred_at ASC, audit_id ASC LIMIT $3 OFFSET $4`,
      [PROVISIONAL_SOURCE, orderId, page.limit, page.offset],
    );
    const count = await context.pool.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM audit_events WHERE source = $1 AND action <> 'PAYMENT_CONFIRMED_OBSERVED' AND ($2::uuid IS NULL OR order_id = $2::uuid)", [PROVISIONAL_SOURCE, orderId]);
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, audit: result.rows, ...pageResponse(page, Number(count.rows[0]?.total ?? 0), result.rows.length) });
  }

  return { listAudit };
}
