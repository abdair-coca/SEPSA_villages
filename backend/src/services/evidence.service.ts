/**
 * Reglas de la evidencia fotográfica. No conoce HTTP ni escribe SQL (`repositories/evidence.repository.ts`).
 * - `uploadEvidence`: el servidor recalcula el SHA-256 de los bytes y lo compara con el declarado, valida la
 *   imagen y la guarda `verified` ligada a orden, operación, técnico y dispositivo. Reenviar la misma foto es
 *   idempotente; reutilizar el id con otro contenido o vínculo es `EVIDENCE_BINDING_CONFLICT`.
 * - `hasVerifiedEvidence`: todas las fotos referenciadas por una operación están verificadas y ligadas a ella.
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../db.js";
import { HttpError } from "../http/responses.js";
import { insertAudit } from "../repositories/audit.repository.js";
import { findEvidenceAssetForUpdate, insertEvidenceAsset, listVerifiedEvidenceIds, type EvidenceAssetRow } from "../repositories/evidence.repository.js";
import { findOrderAssignment, findOrderAssignmentForUpdate } from "../repositories/orders.repository.js";
import { PROVISIONAL_SOURCE, type ServiceContext } from "../shared/application-context.js";
import type { SessionUser, SyncPayload } from "../types.js";
import { validateEvidenceImage } from "./evidence-image.service.js";

export type EvidenceMimeType = "image/jpeg" | "image/png";

export interface UploadEvidenceInput {
  evidenceId: string;
  orderId: string;
  operationId: string;
  deviceId: string;
  mimeType: EvidenceMimeType;
  declaredHash: string;
  bytes: Buffer;
}

export interface UploadEvidenceResult {
  status: "verified";
  evidence_id: string;
  content_hash: string;
  source: string;
}

export interface EvidenceService {
  uploadEvidence(user: SessionUser, input: UploadEvidenceInput): Promise<UploadEvidenceResult>;
}

export function createEvidenceService(context: ServiceContext): EvidenceService {
  async function uploadEvidence(user: SessionUser, input: UploadEvidenceInput): Promise<UploadEvidenceResult> {
    const { evidenceId, orderId, operationId, deviceId, mimeType, declaredHash, bytes } = input;
    const computedHash = createHash("sha256").update(bytes).digest("hex");
    if (computedHash !== declaredHash) throw new HttpError(422, "EVIDENCE_HASH_MISMATCH", "Evidence content does not match declared SHA-256 hash.");
    const orderScope = await findOrderAssignment(context.pool, orderId);
    if (!orderScope || orderScope.assigned_technician_id !== user.userId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "Order and assigned technician were not found.");
    await validateEvidenceImage(bytes, mimeType);
    return withTransaction(context.pool, async (client) => {
      const order = await findOrderAssignmentForUpdate(client, orderId);
      if (!order || order.assigned_technician_id !== user.userId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "Order and assigned technician were not found.");
      let prior = await findEvidenceAssetForUpdate(client, evidenceId);
      if (prior && !sameEvidenceBinding(prior, orderId, operationId, user.userId, deviceId, mimeType, computedHash)) throw new HttpError(409, "EVIDENCE_BINDING_CONFLICT", "Evidence identifier is already bound to different content or operation.");
      if (!prior) {
        const insertedCount = await insertEvidenceAsset(client, { evidenceId, orderId, operationId, technicianId: user.userId, deviceId, mimeType, contentHash: computedHash, content: bytes });
        if (insertedCount !== 1) {
          prior = await findEvidenceAssetForUpdate(client, evidenceId);
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
      return { status: "verified" as const, evidence_id: evidenceId, content_hash: computedHash, source: PROVISIONAL_SOURCE };
    });
  }

  return { uploadEvidence };
}

export async function hasVerifiedEvidence(client: PoolClient, payload: SyncPayload, technicianId: string): Promise<boolean> {
  const verifiedIds = await listVerifiedEvidenceIds(client, payload.evidence_refs, payload.order_id, payload.operation_id, technicianId, payload.device_id);
  return verifiedIds.length === new Set(payload.evidence_refs).size;
}

function sameEvidenceBinding(row: EvidenceAssetRow, orderId: string, operationId: string, technicianId: string, deviceId: string, mimeType: EvidenceMimeType, contentHash: string): boolean {
  return row.order_id === orderId &&
    row.operation_id === operationId &&
    row.technician_id === technicianId &&
    row.device_id === deviceId &&
    row.mime_type === mimeType &&
    row.content_hash.trim() === contentHash;
}
