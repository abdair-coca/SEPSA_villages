import { describe, expect, it, vi } from "vitest";
import { EVIDENCE_MAX_BYTES, EVIDENCE_MAX_SIDE, fitEvidenceImage, type EvidenceEncoder } from "./evidence";
import { DomainError } from "../domain/errors";

function blobOf(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

/** Codificador falso: el tamaño depende de los píxeles, del formato y de la calidad. */
function fakeEncoder(bytesPerPixel: { png: number; jpeg: (quality: number) => number }): EvidenceEncoder {
  return vi.fn(async (width, height, mimeType, quality) => {
    const perPixel = mimeType === "image/png" ? bytesPerPixel.png : bytesPerPixel.jpeg(quality ?? 1);
    return blobOf(Math.ceil(width * height * perPixel), mimeType);
  });
}

describe("fitEvidenceImage", () => {
  it("keeps the photo target at 1 000 000 bytes, below the 2 MB body limit of the server (D018, RF-16)", () => {
    expect(EVIDENCE_MAX_BYTES).toBe(1_000_000);
  });

  it("keeps a photo that already meets size and resolution limits", async () => {
    const original = blobOf(400_000, "image/jpeg");
    const encode = fakeEncoder({ png: 1, jpeg: () => 1 });
    const fitted = await fitEvidenceImage(original, "image/jpeg", 2000, 1500, encode);
    expect(fitted).toEqual({ content: original, width: 2000, height: 1500, mimeType: "image/jpeg" });
    expect(encode).not.toHaveBeenCalled();
  });

  it("re-encodes a photo under 5 MP that weighs more than the target", async () => {
    // 4,32 MP: calidad 0,85 pesa 1,1 MB; 0,72 ya cabe sin bajar resolución.
    const encode = fakeEncoder({ png: 2, jpeg: (quality) => quality * 0.3 });
    const fitted = await fitEvidenceImage(blobOf(3_500_000, "image/jpeg"), "image/jpeg", 2400, 1800, encode);
    expect(fitted.content.size).toBeLessThanOrEqual(EVIDENCE_MAX_BYTES);
    expect(fitted).toMatchObject({ width: 2400, height: 1800, mimeType: "image/jpeg" });
  });

  it("downscales to at most 5 MP and the server side limit", async () => {
    const encode = fakeEncoder({ png: 2, jpeg: () => 0.1 });
    const large = await fitEvidenceImage(blobOf(6_000_000, "image/jpeg"), "image/jpeg", 4000, 3000, encode);
    expect(large.width * large.height).toBeLessThanOrEqual(5_000_000);
    const panorama = await fitEvidenceImage(blobOf(500_000, "image/jpeg"), "image/jpeg", 6000, 800, encode);
    expect(Math.max(panorama.width, panorama.height)).toBeLessThanOrEqual(EVIDENCE_MAX_SIDE);
    expect(panorama.content.size).toBeLessThanOrEqual(EVIDENCE_MAX_BYTES);
  });

  it("lowers resolution when the lowest JPEG quality is still too heavy", async () => {
    const encode = fakeEncoder({ png: 2, jpeg: () => 0.3 });
    const fitted = await fitEvidenceImage(blobOf(5_000_000, "image/jpeg"), "image/jpeg", 2500, 2000, encode);
    expect(fitted.width).toBeLessThan(2500);
    expect(fitted.content.size).toBeLessThanOrEqual(EVIDENCE_MAX_BYTES);
  });

  it("keeps a light PNG and converts a heavy PNG to JPEG", async () => {
    const light = blobOf(200_000, "image/png");
    expect((await fitEvidenceImage(light, "image/png", 938, 371, fakeEncoder({ png: 2, jpeg: () => 0.1 }))).content).toBe(light);
    const heavy = await fitEvidenceImage(blobOf(9_000_000, "image/png"), "image/png", 2000, 1500, fakeEncoder({ png: 3, jpeg: () => 0.2 }));
    expect(heavy.mimeType).toBe("image/jpeg");
    expect(heavy.content.type).toBe("image/jpeg");
    expect(heavy.content.size).toBeLessThanOrEqual(EVIDENCE_MAX_BYTES);
  });

  it("blocks the capture when no attempt fits instead of sending another photo", async () => {
    const encode = fakeEncoder({ png: 10, jpeg: () => 10 });
    const attempt = fitEvidenceImage(blobOf(9_000_000, "image/jpeg"), "image/jpeg", 2500, 2000, encode);
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: "EVIDENCE_TOO_LARGE" });
  });
});
