/**
 * HTTP del registro sincronizado del técnico (`GET /v1/technician/record`, solo TECHNICIAN, solo lectura).
 * Valida el rol, `order_id` (UUID opcional) y la paginación, y delega en `services/technician-record.service.ts`.
 */
import type { ServerResponse } from "node:http";
import { HttpError, sendJson } from "../http/responses.js";
import { createTechnicianRecordService } from "../services/technician-record.service.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { pageRequest, pageResponse } from "../shared/pagination.js";
import { isUuid, requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface TechnicianRecordHandlers {
  listRecord(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
}

export function createTechnicianRecordHandlers(context: ApplicationContext): TechnicianRecordHandlers {
  const service = createTechnicianRecordService(context);

  async function listRecord(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const orderId = url.searchParams.get("order_id");
    if (orderId !== null && !isUuid(orderId)) throw new HttpError(400, "INVALID_REQUEST", "order_id debe ser un UUID.");
    const page = pageRequest(url);
    const result = await service.listRecord(user, { orderId, page });
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, operations: result.operations, ...pageResponse(page, result.total, result.operations.length) });
  }

  return { listRecord };
}
