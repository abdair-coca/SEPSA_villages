/**
 * HTTP de la sincronización:
 * - `POST /v1/sync/operations` (solo TECHNICIAN): valida el payload, fuerza el técnico al de la sesión y responde
 *   200 con el recibo completo si se aceptó, o 409 si quedó en conflicto.
 * - `GET /v1/sync/operations/:operation_id`: consulta el estado de una operación (TECHNICIAN o ADMIN).
 * - `POST /v1/sync/operations/:operation_id/review` (solo ADMIN): revisión humana.
 * Lee y valida la forma de la petición, emite el log de seguridad y delega las reglas en
 * `services/sync.service.ts`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../http/responses.js";
import { createSyncService } from "../services/sync.service.js";
import { parseSyncPayload, validateSyncPayload } from "../services/sync-payload-validation.service.js";
import { syncReceipt } from "../services/sync-support.service.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface SyncHandlers {
  syncOperation(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  lookupOperation(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void>;
  recordHumanReview(request: IncomingMessage, response: ServerResponse, user: SessionUser, operationId: string): Promise<void>;
}

export function createSyncHandlers(context: ApplicationContext): SyncHandlers {
  const service = createSyncService(context);

  async function syncOperation(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const payload = parseSyncPayload(body);
    validateSyncPayload(payload);
    if (payload.technician_id && payload.technician_id !== user.userId) throw new HttpError(403, "TECHNICIAN_SCOPE", "El técnico del envío no coincide con la sesión.");
    payload.technician_id = user.userId;
    const result = await service.syncOperation(user, payload);
    if (result.status === "conflict") {
      context.logEvent("sync.operation", { requestId: String(response.getHeader("x-request-id")), result: "conflict" });
      sendJson(response, 409, { code: "CONFLICT", message: result.message, operation_id: payload.operation_id });
      return;
    }
    context.logEvent("sync.operation", { requestId: String(response.getHeader("x-request-id")), result: "accepted" });
    sendJson(response, 200, { status: "acknowledged", ...syncReceipt(payload), source: PROVISIONAL_SOURCE });
  }

  async function lookupOperation(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void> {
    if (user.role !== "TECHNICIAN" && user.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "El rol no está permitido.");
    if (!operationId) throw new HttpError(400, "INVALID_REQUEST", "operation_id es obligatorio.");
    const result = await service.lookupOperation(user, operationId);
    sendJson(response, 200, result);
  }

  async function recordHumanReview(request: IncomingMessage, response: ServerResponse, user: SessionUser, operationId: string): Promise<void> {
    requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const orderId = requiredString(body.order_id, "order_id");
    const technicianId = requiredString(body.technician_id, "technician_id");
    const deviceId = requiredString(body.device_id, "device_id");
    const expectedVersion = requiredInteger(body.expected_version, "expected_version");
    const reason = requiredString(body.reason, "reason").trim();
    if (!reason || reason.length > 1000) throw new HttpError(400, "INVALID_REVIEW_REASON", "reason debe tener entre 1 y 1000 caracteres que no sean espacios.");
    const result = await service.recordHumanReview(user, { operationId, orderId, technicianId, deviceId, expectedVersion, reason });
    sendJson(response, 200, { ...result, source: PROVISIONAL_SOURCE });
  }

  return { syncOperation, lookupOperation, recordHumanReview };
}
