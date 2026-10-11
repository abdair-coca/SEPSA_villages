/**
 * SQL de las fotos de evidencia (`evidence_assets`). Solo ejecuta consultas y devuelve filas; las reglas de
 * vínculo (orden, operación, técnico, dispositivo, contenido) y de verificación viven en
 * `services/evidence.service.ts`.
 */
import type { Queryable } from "../db.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";

export interface EvidenceAssetRow {
  order_id: string;
  operation_id: string;
  technician_id: string;
  device_id: string;
  mime_type: string;
  content_hash: string;
}

export async function findEvidenceAssetForUpdate(client: Queryable, evidenceId: string): Promise<EvidenceAssetRow | undefined> {
  const existing = await client.query<EvidenceAssetRow>("SELECT order_id, operation_id, technician_id, device_id, mime_type, content_hash FROM evidence_assets WHERE evidence_id = $1 FOR UPDATE", [evidenceId]);
  return existing.rows[0];
}

export interface InsertEvidenceAssetInput {
  evidenceId: string;
  orderId: string;
  operationId: string;
  technicianId: string;
  deviceId: string;
  mimeType: string;
  contentHash: string;
  content: Buffer;
}

/** Inserta la foto como `verified`; devuelve las filas insertadas (0 si otro envío ganó la carrera). */
export async function insertEvidenceAsset(client: Queryable, input: InsertEvidenceAssetInput): Promise<number | null> {
  const inserted = await client.query(
    "INSERT INTO evidence_assets(evidence_id, order_id, operation_id, technician_id, device_id, mime_type, content_hash, content, status, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified',$9) ON CONFLICT (evidence_id) DO NOTHING",
    [input.evidenceId, input.orderId, input.operationId, input.technicianId, input.deviceId, input.mimeType, input.contentHash, input.content, PROVISIONAL_SOURCE],
  );
  return inserted.rowCount;
}

/** Ids de las fotos de la lista que están verificadas y ligadas a esa orden, operación, técnico y dispositivo. */
export async function listVerifiedEvidenceIds(client: Queryable, evidenceRefs: string[], orderId: string, operationId: string, technicianId: string, deviceId: string): Promise<string[]> {
  const evidence = await client.query<{ evidence_id: string }>(
    "SELECT evidence_id FROM evidence_assets WHERE evidence_id = ANY($1::text[]) AND order_id = $2 AND operation_id = $3 AND technician_id = $4 AND device_id = $5 AND status = 'verified'",
    [evidenceRefs, orderId, operationId, technicianId, deviceId],
  );
  return evidence.rows.map((row) => row.evidence_id);
}
