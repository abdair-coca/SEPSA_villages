import { ResponseLostError, TimeoutError } from "../../ports/authorization";

export interface RetryPolicy {
  attempts?: number;
  timeoutMs?: number;
  delaysMs?: number[];
  sleep?: (milliseconds: number) => Promise<void>;
  timer?: {
    setTimeout(handler: () => void, milliseconds: number): unknown;
    clearTimeout(handle: unknown): void;
  };
}

export const DEMO_RETRY_POLICY: Required<Omit<RetryPolicy, "timer">> = {
  attempts: 3,
  timeoutMs: 5_000,
  delaysMs: [1_000, 2_000],
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function withRetries<T>(operation: (attempt: number, signal: AbortSignal) => Promise<T>, policy: RetryPolicy = {}): Promise<T> {
  const resolved = { ...DEMO_RETRY_POLICY, ...policy };
  let lastError: unknown;
  for (let attempt = 0; attempt < resolved.attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const attemptPromise = operation(attempt + 1, controller.signal);
      return await withTimeout(attemptPromise, resolved.timeoutMs, resolved.timer, controller);
    } catch (error) {
      lastError = error;
      if (attempt === resolved.attempts - 1) break;
      await resolved.sleep(resolved.delaysMs[attempt] ?? 0);
    }
  }
  throw lastError ?? new TimeoutError();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timer: NonNullable<RetryPolicy["timer"]> = globalTimer, controller?: AbortController): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timeoutHandle: unknown;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = timer.setTimeout(() => {
      controller?.abort();
      reject(new TimeoutError());
    }, timeoutMs);
  });
  void promise.catch(() => undefined);
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutHandle !== undefined) timer.clearTimeout(timeoutHandle);
  });
}

const globalTimer: NonNullable<RetryPolicy["timer"]> = {
  setTimeout: (handler: () => void, milliseconds: number) => setTimeout(handler, milliseconds),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class NetworkUnknownError extends Error {
  readonly code = "NETWORK_UNKNOWN";

  constructor() {
    super("Connectivity did not produce a conclusive response.");
    this.name = "NetworkUnknownError";
  }
}

export { ResponseLostError };
