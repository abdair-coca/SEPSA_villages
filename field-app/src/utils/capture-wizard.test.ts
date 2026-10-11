import { describe, expect, it } from "vitest";
import { captureDraftCanAdvance, captureSubmitError, captureWizardSteps, loadCaptureDraftSafely } from "./capture-wizard";

describe("capture wizard QA recovery", () => {
  it("keeps advancement blocked after draft load failure until retry succeeds", async () => {
    let attempts = 0;
    const load = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("IndexedDB transaction failed");
      return { reading: { value: 42 } };
    };

    const failed = await loadCaptureDraftSafely(load);
    expect(failed.status).toBe("error");
    expect(captureDraftCanAdvance(failed.status)).toBe(false);

    const retried = await loadCaptureDraftSafely(load);
    expect(retried.status).toBe("ready");
    expect(captureDraftCanAdvance(retried.status)).toBe(true);
    if (retried.status === "ready") expect(retried.content.reading?.value).toBe(42);
  });

  it("keeps cut reading separate from reachable cut settings", () => {
    expect(captureWizardSteps("CUT", false, false)).toEqual(["reading", "cutSettings", "gps", "evidence", "review"]);
    expect(captureWizardSteps("CUT", true, true)).toEqual(["reading", "cutSettings", "gps", "gpsException", "evidence", "evidenceException", "review"]);
  });

  it("replaces technical submit errors with actionable Spanish while preserving uncertain-write warning", () => {
    const generic = captureSubmitError(new Error("QuotaExceededError: transaction aborted"));
    expect(generic.message).toBe("No pudimos guardar la operación. Revisa el estado de la orden y las operaciones pendientes antes de reintentar.");
    expect(generic.message).not.toContain("QuotaExceededError");
    expect(generic.verificationUncertain).toBe(false);

    const uncertain = captureSubmitError(new Error("No pudimos verificar el guardado local"));
    expect(uncertain.message).toContain("No pudimos confirmar si la operación quedó guardada");
    expect(uncertain.message).toContain("Revisa las operaciones pendientes");
    expect(uncertain.verificationUncertain).toBe(true);
  });
});
