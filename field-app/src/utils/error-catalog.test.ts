import { describe, expect, it } from "vitest";
import { errorGuidance } from "./error-catalog";
import { queueReviewMessage } from "./labels";

describe("error catalog", () => {
  it("explains a known code with what happened, what was saved and the next step", () => {
    expect(errorGuidance("RESPONSE_LOST")).toMatchObject({
      code: "RESPONSE_LOST",
      title: "Se perdió la respuesta del servidor",
      saved: "Los datos siguen guardados en este dispositivo.",
    });
    expect(errorGuidance("RESPONSE_LOST")?.nextStep).toContain("Verificar estado");
  });

  it("shows the technical code for an unclassified error instead of hiding it", () => {
    const guidance = errorGuidance("SOMETHING_NEW");
    expect(guidance).toMatchObject({ code: "SOMETHING_NEW", title: "Error de sincronización no clasificado" });
    expect(guidance?.nextStep).toContain("avise al administrador con este código");
  });

  it("never suggests retrying an unclassified error on an uncertain operation", () => {
    const guidance = errorGuidance("SOMETHING_NEW", { uncertain: true });
    expect(guidance?.nextStep).toContain("No repita la acción");
    expect(guidance?.nextStep).not.toContain("Reintentar");
  });

  it("returns nothing when there is no code", () => {
    expect(errorGuidance(undefined)).toBeUndefined();
  });

  it("uses the original cause for an uncertain queue message and never promises automatic continuation", () => {
    const message = queueReviewMessage({ uncertain: true, manualReview: false, errorCode: "LOOKUP_NOT_FOUND", uncertainCause: "RESPONSE_LOST" });
    expect(message).toContain("Se perdió la respuesta del servidor");
    expect(message).not.toContain("podría continuar");
    expect(queueReviewMessage({ uncertain: true, manualReview: false })).toBe("Resultado incierto. No repita la acción; use Verificar estado.");
  });

  it("keeps the manual review message for operations reviewed by an administrator", () => {
    expect(queueReviewMessage({ uncertain: true, manualReview: true, uncertainCause: "RESPONSE_LOST" })).toBe("Revisión humana · no reenviar");
  });
});
