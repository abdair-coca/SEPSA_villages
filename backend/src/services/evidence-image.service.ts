/**
 * Validación de la imagen de evidencia (`validateEvidenceImage`): la foto debe ser un JPEG/PNG completo, estático,
 * decodificable y dentro de los límites de tamaño (se decodifica entera; los metadatos solos no bastan).
 * No toca la base de datos; la verificación de fotos ligadas a una operación está en `evidence.service.ts`.
 */
import sharp from "sharp";
import { HttpError } from "../http/responses.js";

const MAX_EVIDENCE_DIMENSION = 4096;
const MAX_EVIDENCE_PIXELS = 16_000_000;
const EVIDENCE_DECODE_TIMEOUT_SECONDS = 5;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function validateEvidenceImage(bytes: Buffer, mimeType: "image/jpeg" | "image/png"): Promise<void> {
  const isPng = bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Los bytes de la evidencia deben contener una foto JPEG o PNG completa. Tome la foto otra vez o expórtela de nuevo.");
  if ((mimeType === "image/png") !== isPng) throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "El formato de la imagen no coincide con mime_type. Envíe el tipo MIME real: JPEG o PNG.");
  if (isPng) validateStaticPngChunks(bytes);
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_EVIDENCE_PIXELS, limitInputChannels: 4, sequentialRead: true, unlimited: false });
    const metadata = await image.metadata();
    if (metadata.format !== (mimeType === "image/jpeg" ? "jpeg" : "png")) throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "El formato decodificado de la evidencia no coincide con mime_type. Envíe el tipo MIME real: JPEG o PNG.");
    if ((metadata.pages ?? 1) !== 1) throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "La evidencia debe ser una sola foto fija JPEG o PNG. No se admiten imágenes animadas ni de varias páginas.");
    const { width, height } = metadata;
    if (!width || !height) throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Las dimensiones de la imagen de evidencia no son válidas. Tome la foto otra vez o expórtela de nuevo.");
    if (width > MAX_EVIDENCE_DIMENSION || height > MAX_EVIDENCE_DIMENSION || width * height > MAX_EVIDENCE_PIXELS) throw evidenceImageTooLarge();
    // Los metadatos no validan los píxeles: se decodifica la imagen completa y se guardan los bytes originales.
    await image.timeout({ seconds: EVIDENCE_DECODE_TIMEOUT_SECONDS }).toColourspace("srgb").removeAlpha().raw({ depth: "uchar" }).toBuffer();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.message.includes("pixel limit")) throw evidenceImageTooLarge();
    throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "La evidencia debe ser una foto JPEG o PNG completa y decodificable dentro del límite de procesamiento. Tome la foto otra vez o expórtela de nuevo.");
  }
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
    if (type === "acTL" || type === "fcTL" || type === "fdAT") throw new HttpError(400, "EVIDENCE_FORMAT_INVALID", "No se admiten evidencias PNG animadas. Exporte una sola foto fija JPEG o PNG.");
    if (type === "IEND") {
      if (length === 0 && end === bytes.length) return;
      break;
    }
    offset = end;
  }
  throw new HttpError(400, "EVIDENCE_CONTENT_INVALID", "Los bloques del PNG de la evidencia están incompletos o mal formados. Tome la foto otra vez o expórtela de nuevo.");
}
