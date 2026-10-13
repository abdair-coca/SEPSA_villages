/**
 * Preparación de la foto de evidencia: la optimiza (≤ 5 MP, JPEG/PNG), calcula su SHA-256 y la liga a
 * orden, operación, técnico y dispositivo. Si recibe una foto ya preparada, recalcula el hash y lo compara.
 */
import { DomainError } from "../domain/errors";
import { generateOperationId, type EvidenceReference, type WorkOrder } from "../domain/types";

export interface EvidenceDraft {
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  optimized?: boolean;
  evidenceId?: string;
  content?: Blob;
  contentHash?: string;
}

export interface EvidenceInput {
  evidence?: EvidenceDraft;
  file?: File;
}

export async function prepareEvidence(
  input: EvidenceInput,
  order: WorkOrder,
  operationId: string,
  technicianId: string,
  deviceId: string,
): Promise<EvidenceReference | undefined> {
  if (input.file) {
    const prepared = await prepareImageFile(input.file);
    return {
      evidenceId: generateOperationId("evidence"),
      orderId: order.orderId,
      operationId,
      technicianId,
      deviceId,
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      optimized: true,
      content: prepared.content,
      contentHash: await sha256(prepared.content),
    };
  }
  if (!input.evidence) return undefined;
  if (!input.evidence.content || !input.evidence.contentHash || input.evidence.width * input.evidence.height > 5_000_000) {
    throw new DomainError("La evidencia debe incluir contenido preparado y hash SHA-256.", "EVIDENCE_CONTENT_REQUIRED");
  }
  const hash = await sha256(input.evidence.content);
  if (hash !== input.evidence.contentHash.toLowerCase()) throw new DomainError("El hash de evidencia no coincide con su contenido.", "EVIDENCE_HASH_MISMATCH");
  return {
    evidenceId: input.evidence.evidenceId ?? generateOperationId("evidence"),
    orderId: order.orderId,
    operationId,
    technicianId,
    deviceId,
    mimeType: input.evidence.mimeType,
    width: Math.floor(input.evidence.width),
    height: Math.floor(input.evidence.height),
    optimized: input.evidence.optimized === true,
    content: input.evidence.content,
    contentHash: hash,
  };
}

export function metadataOnlyEvidence(evidence: EvidenceReference): EvidenceReference {
  const { content: _content, ...metadata } = evidence;
  return metadata;
}

function imageMime(file: File): "image/jpeg" | "image/png" {
  if (file.type === "image/jpeg" || file.type === "image/png") return file.type;
  throw new DomainError("La evidencia debe ser JPEG o PNG.", "EVIDENCE_FORMAT_INVALID");
}

/** Bytes máximos de la foto preparada: en base64 cabe con margen en el límite del cuerpo del backend (D018). */
export const EVIDENCE_MAX_BYTES = 1_000_000;
/** Lado máximo que acepta el backend (`evidence-image.service.ts`). */
export const EVIDENCE_MAX_SIDE = 4096;
const JPEG_QUALITIES = [0.85, 0.72, 0.6];
const RESOLUTION_STEPS = [1, 0.75, 0.55, 0.4];

type EvidenceMime = "image/jpeg" | "image/png";
export type EvidenceEncoder = (width: number, height: number, mimeType: EvidenceMime, quality?: number) => Promise<Blob>;
export interface FittedEvidence { content: Blob; width: number; height: number; mimeType: EvidenceMime }

/**
 * Ajusta la foto a ≤ 5 MP, ≤ 4096 px por lado y ≤ `EVIDENCE_MAX_BYTES`. Conserva el original si ya cumple; si no,
 * prueba el mismo formato a la resolución permitida y luego JPEG bajando calidad y, si no basta, resolución.
 * Un PNG pesado sale como JPEG. Si nada cabe, bloquea la captura: nunca envía otra foto ni la omite.
 */
export async function fitEvidenceImage(original: Blob, mimeType: EvidenceMime, width: number, height: number, encode: EvidenceEncoder): Promise<FittedEvidence> {
  const base = limitEvidenceDimensions(width, height);
  const unchanged = base.width === Math.floor(width) && base.height === Math.floor(height);
  if (unchanged && original.size <= EVIDENCE_MAX_BYTES) return { content: original, width: base.width, height: base.height, mimeType };
  if (!unchanged && mimeType === "image/png") {
    const png = await encode(base.width, base.height, "image/png");
    if (png.size <= EVIDENCE_MAX_BYTES) return { content: png, ...base, mimeType: "image/png" };
  }
  for (const step of RESOLUTION_STEPS) {
    const size = { width: Math.max(1, Math.floor(base.width * step)), height: Math.max(1, Math.floor(base.height * step)) };
    for (const quality of JPEG_QUALITIES) {
      const jpeg = await encode(size.width, size.height, "image/jpeg", quality);
      if (jpeg.size <= EVIDENCE_MAX_BYTES) return { content: jpeg, ...size, mimeType: "image/jpeg" };
    }
  }
  throw new DomainError("No pudimos reducir la foto lo suficiente. Tome otra foto con menos resolución.", "EVIDENCE_TOO_LARGE");
}

async function prepareImageFile(file: File): Promise<FittedEvidence> {
  const mimeType = imageMime(file);
  const decoded = await decodeImage(file);
  try {
    return await fitEvidenceImage(file, mimeType, decoded.width, decoded.height, (width, height, targetMime, quality) => {
      if (typeof document === "undefined") throw new Error("No pudimos redimensionar la evidencia en este dispositivo.");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No pudimos preparar la evidencia localmente.");
      // JPEG no tiene transparencia: fondo blanco en lugar de negro para un PNG convertido.
      if (targetMime === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(decoded.source, 0, 0, width, height);
      return canvasBlob(canvas, targetMime, quality);
    });
  } finally {
    decoded.dispose();
  }
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; dispose: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
  }
  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") throw new Error("No pudimos preparar dimensiones de evidencia en este dispositivo.");
  const source = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(source) });
    image.onerror = () => reject(new Error("No pudimos leer la imagen seleccionada."));
    image.src = source;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: EvidenceMime, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No pudimos guardar la evidencia preparada.")), mimeType, mimeType === "image/jpeg" ? quality : undefined));
}

async function sha256(content: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 no está disponible en este dispositivo.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await content.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Escala proporcional para quedar en ≤ 5 MP y ≤ `EVIDENCE_MAX_SIDE` px por lado. */
function limitEvidenceDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new DomainError("Las dimensiones de evidencia no son válidas.", "EVIDENCE_DIMENSIONS_INVALID");
  const scale = Math.min(1, Math.sqrt(5_000_000 / (width * height)), EVIDENCE_MAX_SIDE / Math.max(width, height));
  if (scale === 1) return { width: Math.floor(width), height: Math.floor(height) };
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
