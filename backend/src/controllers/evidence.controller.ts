/**
 * HTTP de la subida de fotos de evidencia (`POST /v1/evidence/assets`, solo TECHNICIAN): valida la forma del
 * cuerpo (campos, formato, hash hexadecimal, base64), decodifica los bytes, llama a
 * `services/evidence.service.ts` y emite el log de seguridad. La verificación del contenido y su guardado
 * están en el servicio.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, parseJsonBody, requiredString, sendJson } from "../http/responses.js";
import { createEvidenceService, type EvidenceMimeType } from "../services/evidence.service.js";
import type { ApplicationContext } from "../shared/application-context.js";
import { requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface EvidenceHandlers {
  uploadEvidence(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
}

export function createEvidenceHandlers(context: ApplicationContext): EvidenceHandlers {
  const service = createEvidenceService(context);

  async function uploadEvidence(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const evidenceId = requiredString(body.evidence_id, "evidence_id");
    const orderId = requiredString(body.order_id, "order_id");
    const operationId = requiredString(body.operation_id, "operation_id");
    const deviceId = requiredString(body.device_id, "device_id");
    if (body.technician_id !== undefined && requiredString(body.technician_id, "technician_id") !== user.userId) throw new HttpError(403, "TECHNICIAN_SCOPE", "El técnico de la evidencia no coincide con la sesión.");
    if (body.mime_type !== "image/jpeg" && body.mime_type !== "image/png") throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "La evidencia debe ser JPEG o PNG.");
    const mimeType: EvidenceMimeType = body.mime_type;
    const declaredHash = requiredString(body.content_hash, "content_hash").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(declaredHash)) throw new HttpError(400, "EVIDENCE_HASH_INVALID", "content_hash debe ser un resumen SHA-256 en hexadecimal.");
    const encoded = requiredString(body.content_base64, "content_base64");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "content_base64 no es válido.");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== encoded) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Los bytes de la evidencia están vacíos o mal formados.");
    const result = await service.uploadEvidence(user, { evidenceId, orderId, operationId, deviceId, mimeType, declaredHash, bytes });
    context.logEvent("evidence.upload", { requestId: String(response.getHeader("x-request-id")), result: "verified" });
    sendJson(response, 200, result);
  }

  return { uploadEvidence };
}
