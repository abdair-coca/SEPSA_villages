/**
 * Subida de fotos de evidencia (`POST /v1/evidence/assets`, solo TECHNICIAN).
 * El servidor recalcula el SHA-256 de los bytes y lo compara con el declarado, valida la imagen y la guarda
 * `verified` ligada a orden, operación, técnico y dispositivo. Reenviar la misma foto es idempotente;
 * reutilizar el id con otro contenido o vínculo es `EVIDENCE_BINDING_CONFLICT`.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { withTransaction } from "../db.js";
import { HttpError, parseJsonBody, requiredString, sendJson } from "../http/responses.js";
import type { SessionUser } from "../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { insertAudit } from "../repositories/audit.repository.js";
import { requireRole } from "../shared/request-validation.js";
import { validateEvidenceImage } from "../services/evidence-verification.service.js";

type EvidenceMimeType = "image/jpeg" | "image/png";

interface EvidenceAssetRow {
  order_id: string;
  operation_id: string;
  technician_id: string;
  device_id: string;
  mime_type: string;
  content_hash: string;
}

export interface EvidenceHandlers {
  uploadEvidence(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
}

export function createEvidenceHandlers(context: ApplicationContext): EvidenceHandlers {
  async function uploadEvidence(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const evidenceId = requiredString(body.evidence_id, "evidence_id");
    const orderId = requiredString(body.order_id, "order_id");
    const operationId = requiredString(body.operation_id, "operation_id");
    const deviceId = requiredString(body.device_id, "device_id");
    if (body.technician_id !== undefined && requiredString(body.technician_id, "technician_id") !== user.userId) throw new HttpError(403, "TECHNICIAN_SCOPE", "Evidence technician does not match session.");
    if (body.mime_type !== "image/jpeg" && body.mime_type !== "image/png") throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "Evidence must be JPEG or PNG.");
    const mimeType: EvidenceMimeType = body.mime_type;
    const declaredHash = requiredString(body.content_hash, "content_hash").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(declaredHash)) throw new HttpError(400, "EVIDENCE_HASH_INVALID", "content_hash must be a SHA-256 hex digest.");
    const encoded = requiredString(body.content_base64, "content_base64");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "content_base64 is invalid.");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== encoded) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Evidence bytes are empty or malformed.");
    const computedHash = createHash("sha256").update(bytes).digest("hex");
    if (computedHash !== declaredHash) throw new HttpError(422, "EVIDENCE_HASH_MISMATCH", "Evidence content does not match declared SHA-256 hash.");
    const orderScope = await context.pool.query<{ assigned_technician_id: string | null }>("SELECT assigned_technician_id FROM orders WHERE order_id = $1 AND source = $2", [orderId, PROVISIONAL_SOURCE]);
    if (!orderScope.rows[0] || orderScope.rows[0].assigned_technician_id !== user.userId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "Order and assigned technician were not found.");
    await validateEvidenceImage(bytes, mimeType);
    const result = await withTransaction(context.pool, async (client) => {
      const orderResult = await client.query<{ assigned_technician_id: string | null }>("SELECT assigned_technician_id FROM orders WHERE order_id = $1 AND source = $2 FOR UPDATE", [orderId, PROVISIONAL_SOURCE]);
      if (!orderResult.rows[0] || orderResult.rows[0].assigned_technician_id !== user.userId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "Order and assigned technician were not found.");
      const existing = await client.query<EvidenceAssetRow>("SELECT order_id, operation_id, technician_id, device_id, mime_type, content_hash FROM evidence_assets WHERE evidence_id = $1 FOR UPDATE", [evidenceId]);
      let prior = existing.rows[0];
      if (prior && !sameEvidenceBinding(prior, orderId, operationId, user.userId, deviceId, mimeType, computedHash)) throw new HttpError(409, "EVIDENCE_BINDING_CONFLICT", "Evidence identifier is already bound to different content or operation.");
      if (!prior) {
        const inserted = await client.query(
          "INSERT INTO evidence_assets(evidence_id, order_id, operation_id, technician_id, device_id, mime_type, content_hash, content, status, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified',$9) ON CONFLICT (evidence_id) DO NOTHING",
          [evidenceId, orderId, operationId, user.userId, deviceId, mimeType, computedHash, bytes, PROVISIONAL_SOURCE],
        );
        if (inserted.rowCount !== 1) {
          const raced = await client.query<EvidenceAssetRow>("SELECT order_id, operation_id, technician_id, device_id, mime_type, content_hash FROM evidence_assets WHERE evidence_id = $1 FOR UPDATE", [evidenceId]);
          prior = raced.rows[0];
          if (!prior || !sameEvidenceBinding(prior, orderId, operationId, user.userId, deviceId, mimeType, computedHash)) throw new HttpError(409, "EVIDENCE_BINDING_CONFLICT", "Evidence identifier is already bound to different content or operation.");
        }
      }
      await insertAudit(client, {
        actorId: user.userId,
        actorRole: user.role,
        action: prior ? "EVIDENCE_UPLOAD_REPLAY" : "EVIDENCE_VERIFIED",
        result: "accepted",
        entityId: evidenceId,
        orderId,
        operationId,
        deviceId,
        metadata: { content_hash: computedHash, mime_type: mimeType, status: "verified", source: PROVISIONAL_SOURCE },
      });
      return { status: "verified", evidence_id: evidenceId, content_hash: computedHash, source: PROVISIONAL_SOURCE };
    });
    context.logEvent("evidence.upload", { requestId: String(response.getHeader("x-request-id")), result: "verified" });
    sendJson(response, 200, result);
  }

  return { uploadEvidence };
}

function sameEvidenceBinding(row: EvidenceAssetRow, orderId: string, operationId: string, technicianId: string, deviceId: string, mimeType: EvidenceMimeType, contentHash: string): boolean {
  return row.order_id === orderId &&
    row.operation_id === operationId &&
    row.technician_id === technicianId &&
    row.device_id === deviceId &&
    row.mime_type === mimeType &&
    row.content_hash.trim() === contentHash;
}
