import type { ConnectivityMode } from "../../domain";
import type { RemoteResult, SyncPayload, SyncTransport, SyncTransportResponse } from "../../ports";
import { NetworkUnknownError, type RetryPolicy, withRetries } from "./retry";

export class MockSyncTransport implements SyncTransport {
  readonly simulation = "DEMO_ONLY_NO_SEPSA_ENDPOINT" as const;
  readonly sent: SyncPayload[] = [];
  readonly lookups: string[] = [];
  sendAttempts = 0;
  lookupAttempts = 0;
  response: SyncTransportResponse = { status: "acknowledged", operationId: "" };
  lookupResponse: RemoteResult = { status: "not_found" };
  weakFailures = 1;
  private weakAttempts = 0;
  private mode: ConnectivityMode;
  private readonly retryPolicy: RetryPolicy;

  constructor(options: { mode?: ConnectivityMode; retryPolicy?: RetryPolicy } = {}) {
    this.mode = options.mode ?? "online";
    this.retryPolicy = { ...options.retryPolicy, sleep: options.retryPolicy?.sleep ?? (async () => undefined) };
  }

  setMode(mode: ConnectivityMode): void {
    this.mode = mode;
  }

  send(payload: SyncPayload): Promise<SyncTransportResponse> {
    this.sent.push(payload);
    return withRetries(() => {
      this.sendAttempts += 1;
      return this.networkCall(() => ({ ...structuredClone(this.response), operationId: this.response.operationId || payload.operationId }));
    }, this.retryPolicy);
  }

  lookup(operationId: string): Promise<RemoteResult> {
    this.lookups.push(operationId);
    return withRetries(() => {
      this.lookupAttempts += 1;
       return this.networkCall(() => ({ ...structuredClone(this.lookupResponse), operationId: this.lookupResponse.operationId ?? operationId }));
    }, this.retryPolicy);
  }

  private async networkCall<T>(response: () => T): Promise<T> {
    if (this.mode === "offline") throw new NetworkUnknownError();
    if (this.mode === "weak" && this.weakAttempts++ < this.weakFailures) throw new NetworkUnknownError();
    return response();
  }
}
