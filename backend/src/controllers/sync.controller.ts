/**
 * Endpoint de sincronización (`POST /v1/sync/operations`, solo TECHNICIAN). El técnico del payload se fuerza
 * al de la sesión. Responde 200 con el recibo completo si se aceptó, o 409 si quedó en conflicto.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { withTransaction } from "../db.js";
import { HttpError, parseJsonBody, sendJson } from "../http/responses.js";
import type { SessionUser } from "../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { requireRole } from "../shared/request-validation.js";
import { applySync } from "../services/sync-apply.service.js";
import { createLookupReviewHandlers } from "./sync-lookup-review.controller.js";
import { parseSyncPayload, validateSyncPayload } from "../services/sync-payload-validation.service.js";
import { syncReceipt } from "../services/sync-support.service.js";

export interface SyncHandlers {
  syncOperation(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  lookupOperation(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void>;
  recordHumanReview(request: IncomingMessage, response: ServerResponse, user: SessionUser, operationId: string): Promise<void>;
}

export function createSyncHandlers(context: ApplicationContext): SyncHandlers {
  const lookupReview = createLookupReviewHandlers(context);

  async function syncOperation(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const payload = parseSyncPayload(body);
    validateSyncPayload(payload);
    if (payload.technician_id && payload.technician_id !== user.userId) throw new HttpError(403, "TECHNICIAN_SCOPE", "Payload technician does not match session.");
    payload.technician_id = user.userId;
    const result = await withTransaction(context.pool, async (client) => applySync(client, user, payload));
    if (result.status === "conflict") {
      context.logEvent("sync.operation", { requestId: String(response.getHeader("x-request-id")), result: "conflict" });
      sendJson(response, 409, { code: "CONFLICT", message: result.message, operation_id: payload.operation_id });
      return;
    }
    context.logEvent("sync.operation", { requestId: String(response.getHeader("x-request-id")), result: "accepted" });
    sendJson(response, 200, { status: "acknowledged", ...syncReceipt(payload), source: PROVISIONAL_SOURCE });
  }

  return { syncOperation, lookupOperation: lookupReview.lookupOperation, recordHumanReview: lookupReview.recordHumanReview };
}
