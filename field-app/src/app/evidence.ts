import { DomainError, generateOperationId, type EvidenceReference, type WorkOrder } from "../domain";

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

async function prepareImageFile(file: File): Promise<{ content: Blob; width: number; height: number; mimeType: "image/jpeg" | "image/png" }> {
  const mimeType = imageMime(file);
  const decoded = await decodeImage(file);
  const resized = resizeToFiveMegapixels(decoded.width, decoded.height);
  if (resized.width === Math.floor(decoded.width) && resized.height === Math.floor(decoded.height)) {
    decoded.dispose();
    return { content: file, width: resized.width, height: resized.height, mimeType };
  }
  if (typeof document === "undefined") {
    decoded.dispose();
    throw new Error("No pudimos redimensionar la evidencia en este dispositivo.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = resized.width;
  canvas.height = resized.height;
  const context = canvas.getContext("2d");
  if (!context) {
    decoded.dispose();
    throw new Error("No pudimos preparar la evidencia localmente.");
  }
  context.drawImage(decoded.source, 0, 0, resized.width, resized.height);
  decoded.dispose();
  const content = await canvasBlob(canvas, mimeType);
  return { content, width: resized.width, height: resized.height, mimeType };
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

function canvasBlob(canvas: HTMLCanvasElement, mimeType: "image/jpeg" | "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No pudimos guardar la evidencia preparada.")), mimeType, mimeType === "image/jpeg" ? 0.9 : undefined));
}

async function sha256(content: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 no está disponible en este dispositivo.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await content.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function resizeToFiveMegapixels(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new DomainError("Las dimensiones de evidencia no son válidas.", "EVIDENCE_DIMENSIONS_INVALID");
  const area = width * height;
  if (area <= 5_000_000) return { width: Math.floor(width), height: Math.floor(height) };
  const scale = Math.sqrt(5_000_000 / area);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
