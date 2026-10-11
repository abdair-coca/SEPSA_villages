/**
 * Validación de evidencia:
 * - `validateEvidenceImage`: la foto debe ser un JPEG/PNG completo, estático, decodificable y dentro de los
 *   límites de tamaño (se decodifica entera; los metadatos solos no bastan).
 * - `hasVerifiedEvidence`: todas las fotos referenciadas por una operación están verificadas y ligadas a ella.
 */
import sharp from "sharp";
import type { PoolClient } from "pg";
import { HttpError } from "../../http.js";
import type { SyncPayload } from "../../types.js";

const MAX_EVIDENCE_DIMENSION = 4096;
const MAX_EVIDENCE_PIXELS = 16_000_000;
const EVIDENCE_DECODE_TIMEOUT_SECONDS = 5;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function validateEvidenceImage(bytes: Buffer, mimeType: "image/jpeg" | "image/png"): Promise<void> {
  const isPng = bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Evidence bytes must contain a complete JPEG or PNG photo. Retake or re-export the photo.");
  if ((mimeType === "image/png") !== isPng) throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "Evidence image format does not match mime_type. Send the actual JPEG or PNG MIME type.");
  if (isPng) validateStaticPngChunks(bytes);
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_EVIDENCE_PIXELS, limitInputChannels: 4, sequentialRead: true, unlimited: false });
    const metadata = await image.metadata();
    if (metadata.format !== (mimeType === "image/jpeg" ? "jpeg" : "png")) throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "Evidence decoded format does not match mime_type. Send the actual JPEG or PNG MIME type.");
    if ((metadata.pages ?? 1) !== 1) throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "Evidence must be a single still JPEG or PNG photo. Animated or multi-page images are unsupported.");
    const { width, height } = metadata;
    if (!width || !height) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Evidence image dimensions are invalid. Retake or re-export the photo.");
    if (width > MAX_EVIDENCE_DIMENSION || height > MAX_EVIDENCE_DIMENSION || width * height > MAX_EVIDENCE_PIXELS) throw evidenceImageTooLarge();
    // Los metadatos no validan los píxeles: se decodifica la imagen completa y se guardan los bytes originales.
    await image.timeout({ seconds: EVIDENCE_DECODE_TIMEOUT_SECONDS }).toColourspace("srgb").removeAlpha().raw({ depth: "uchar" }).toBuffer();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.message.includes("pixel limit")) throw evidenceImageTooLarge();
    throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Evidence must be a complete, decodable JPEG or PNG photo within the processing limit. Retake or re-export the photo.");
  }
}

export async function hasVerifiedEvidence(client: PoolClient, payload: SyncPayload, technicianId: string): Promise<boolean> {
  const evidence = await client.query<{ evidence_id: string }>(
    "SELECT evidence_id FROM evidence_assets WHERE evidence_id = ANY($1::text[]) AND order_id = $2 AND operation_id = $3 AND technician_id = $4 AND device_id = $5 AND status = 'verified'",
    [payload.evidence_refs, payload.order_id, payload.operation_id, technicianId, payload.device_id],
  );
  return evidence.rows.length === new Set(payload.evidence_refs).size;
}

function evidenceImageTooLarge(): HttpError {
  return new HttpError(413, "EVIDENCE_IMAGE_TOO_LARGE", `Evidence must be at most ${MAX_EVIDENCE_DIMENSION} pixels per side and ${MAX_EVIDENCE_PIXELS} total pixels. Resize the photo before retrying.`);
}

function validateStaticPngChunks(bytes: Buffer): void {
  // libvips trata un APNG como PNG estático; se revisan los bloques para rechazar animaciones explícitamente.
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length || (offset === PNG_SIGNATURE.length && (type !== "IHDR" || length !== 13))) break;
    if (type === "acTL" || type === "fcTL" || type === "fdAT") throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "Animated PNG evidence is unsupported. Export a single still JPEG or PNG photo.");
    if (type === "IEND") {
      if (length === 0 && end === bytes.length) return;
      break;
    }
    offset = end;
  }
  throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Evidence PNG chunks are incomplete or malformed. Retake or re-export the photo.");
}
