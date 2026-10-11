/**
 * Pasos y recuperación del asistente de captura (visita, corte, reconexión).
 * Un borrador que no se pudo leer bloquea el avance hasta reintentar, para no pisar datos guardados.
 */
import type { ActionKind } from "../domain/types";
import type { CaptureDraftContent } from "../ports/repository";

export type CaptureWizardStep = "reading" | "cutSettings" | "gps" | "gpsException" | "evidence" | "evidenceException" | "review";

export type CaptureDraftLoadResult = { status: "ready"; content: CaptureDraftContent } | { status: "error" };

export function captureWizardSteps(kind: ActionKind, gpsException: boolean, photoException: boolean): CaptureWizardStep[] {
  return (kind === "CUT"
    ? ["reading", "cutSettings", "gps", ...(gpsException ? ["gpsException"] : []), "evidence", ...(photoException ? ["evidenceException"] : []), "review"]
    : ["evidence", ...(photoException ? ["evidenceException"] : []), "review"]) as CaptureWizardStep[];
}

export async function loadCaptureDraftSafely(load: () => Promise<CaptureDraftContent | undefined>): Promise<CaptureDraftLoadResult> {
  try { return { status: "ready", content: await load() ?? {} }; }
  catch { return { status: "error" }; }
}

export function captureDraftCanAdvance(status: CaptureDraftLoadResult["status"] | "loading"): boolean {
  return status === "ready";
}

export function captureSubmitError(error: unknown): { message: string; verificationUncertain: boolean } {
  const verificationUncertain = error instanceof Error && error.message.includes("No pudimos verificar el guardado local");
  return {
    verificationUncertain,
    message: verificationUncertain
      ? "No pudimos confirmar si la operación quedó guardada en este dispositivo. Revisa las operaciones pendientes antes de reintentar."
      : "No pudimos guardar la operación. Revisa el estado de la orden y las operaciones pendientes antes de reintentar.",
  };
}

export function restoreEvidenceFile(value: File | Blob): File {
  if (value instanceof File) return value;
  const extension = value.type === "image/png" ? "png" : "jpg";
  return new File([value], `evidencia-recuperada.${extension}`, { type: value.type });
}
