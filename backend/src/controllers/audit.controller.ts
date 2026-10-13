/**
 * HTTP de las consultas del administrador (solo ADMIN, solo lectura): auditoría (`GET /v1/audit`), paginada y
 * filtrable por orden, y operaciones por conciliar (`GET /v1/admin/reconciliation`, D024). No tienen servicio propio:
 * no hay reglas más allá del rol y de validar el UUID, así que llaman directo a los repositorios.
 */
import type { ServerResponse } from "node:http";
import { HttpError, sendJson } from "../http/responses.js";
import { countAuditEvents, listAuditEvents } from "../repositories/audit.repository.js";
import { listReconciliation } from "../repositories/reconciliation.repository.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { pageRequest, pageResponse } from "../shared/pagination.js";
import { isUuid, requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface AuditHandlers {
  listAudit(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
  listReconciliation(response: ServerResponse, user: SessionUser): Promise<void>;
}

export function createAuditHandlers(context: ApplicationContext): AuditHandlers {
  async function listAudit(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    requireRole(user, "ADMIN");
    const orderId = url.searchParams.get("order_id");
    if (orderId && !isUuid(orderId)) throw new HttpError(400, "INVALID_REQUEST", "order_id debe ser un UUID.");
    const page = pageRequest(url);
    const audit = await listAuditEvents(context.pool, orderId, page);
    const total = await countAuditEvents(context.pool, orderId);
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, audit, ...pageResponse(page, total, audit.length) });
  }

  async function listReconciliationItems(response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, items: await listReconciliation(context.pool) });
  }

  return { listAudit, listReconciliation: listReconciliationItems };
}
