/**
 * Reintento del consumo de una autorización de un solo uso con el mismo `operationId` y token (D019).
 * El backend devuelve `consumed` en un replay del mismo `operationId` y `not_enabled` si no se consumió, también
 * después del vencimiento: toda respuesta concluyente es verdadera, así que reintentar nunca consume dos veces.
 * Solo se reintenta un resultado incierto (red, tiempo agotado, 5xx). Una sesión vencida no se reintenta.
 */
import { isUncertainError } from "../ports/authorization";

export const CONSUME_RETRY_DELAYS_MS = [1000, 3000];
export type Sleep = (milliseconds: number) => Promise<void>;
export const realSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const NOT_RETRYABLE = new Set(["UNAUTHENTICATED"]);

export type ConsumeAttemptResult<T> = { kind: "response"; response: T } | { kind: "uncertain"; errorCode: string };

export async function consumeWithRetries<T extends { status: string; errorCode?: string }>(
  consume: () => Promise<T>,
  sleep: Sleep = realSleep,
  delaysMs: readonly number[] = CONSUME_RETRY_DELAYS_MS,
): Promise<ConsumeAttemptResult<T>> {
  for (let attempt = 0; ; attempt += 1) {
    let errorCode: string;
    try {
      const response = await consume();
      if (response.status !== "unknown") return { kind: "response", response };
      errorCode = response.errorCode ?? "RESPONSE_UNKNOWN";
      if (NOT_RETRYABLE.has(errorCode)) return { kind: "uncertain", errorCode };
    } catch (error) {
      if (!isUncertainError(error)) throw error;
      errorCode = error instanceof Error && "code" in error ? String(error.code) : "RESPONSE_UNKNOWN";
    }
    const delay = delaysMs[attempt];
    if (delay === undefined) return { kind: "uncertain", errorCode };
    await sleep(delay);
  }
}
