/**
 * HTTP de la consulta de auditoría (`GET /v1/audit`, solo ADMIN), paginada y filtrable por orden. No tiene
 * servicio propio: no hay reglas más allá del rol y de validar el UUID, así que llama directo a
 * `repositories/audit.repository.ts`.
 */
import type { ServerResponse } from "node:http";
import { HttpError, sendJson } from "../http/responses.js";
import { countAuditEvents, listAuditEvents } from "../repositories/audit.repository.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { pageRequest, pageResponse } from "../shared/pagination.js";
import { isUuid, requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface AuditHandlers {
  listAudit(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
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

  return { listAudit };
}
