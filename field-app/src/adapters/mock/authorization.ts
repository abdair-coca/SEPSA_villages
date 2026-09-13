import type {
  AuthorizationAdapter,
  AuthRequest,
  AuthResponse,
  ConsumeEnablementRequest,
  ConsumeEnablementResponse,
  ConsumeRequest,
  ConsumeResponse,
  EnablementAdapter,
  EnablementGrant,
  EnablementRequest,
  EnablementResponse,
  AuthorizationGrant,
  RemoteResult,
} from "../../ports";
import { ResponseLostError } from "../../ports/authorization";
import { NetworkUnknownError, type RetryPolicy, withRetries } from "./retry";
import type { ConnectivityMode } from "../../domain";

export interface MockAdapterOptions {
  mode?: ConnectivityMode;
  retryPolicy?: RetryPolicy;
}

type ConfiguredAuthResponse = Omit<AuthResponse, "operationId"> & { operationId?: string };
type ConfiguredConsumeResponse = Omit<ConsumeResponse, "operationId"> & { operationId?: string };
type ConfiguredEnablementResponse = Omit<EnablementResponse, "operationId"> & { operationId?: string };
type ConfiguredConsumeEnablementResponse = Omit<ConsumeEnablementResponse, "operationId"> & { operationId?: string };

/** Demonstration adapter. No endpoint, credential, or SEPSA contract is represented. */
export class MockAuthorizationAdapter implements AuthorizationAdapter {
  readonly simulation = "DEMO_ONLY_NO_SEPSA_ENDPOINT" as const;
  readonly requestCalls: AuthRequest[] = [];
  readonly consumeCalls: ConsumeRequest[] = [];
  readonly lookupCalls: string[] = [];
  readonly issuedGrants = new Map<string, AuthorizationGrant>();
  readonly consumedGrantIds = new Set<string>();
  requestAttempts = 0;
  consumeAttempts = 0;
  lookupAttempts = 0;
  requestResponse: ConfiguredAuthResponse = { status: "authorized" };
  consumeResponse: ConfiguredConsumeResponse = { status: "consumed" };
  lookupResponse: RemoteResult = { status: "not_found" };
  requestError: unknown;
  consumeError: unknown;
  lookupError: unknown;
  weakFailures = 1;
  private weakAttempts = 0;
  private readonly retryPolicy: RetryPolicy;
  private mode: ConnectivityMode;

  constructor(options: MockAdapterOptions = {}) {
    this.mode = options.mode ?? "online";
    this.retryPolicy = { ...options.retryPolicy, sleep: options.retryPolicy?.sleep ?? (async () => undefined) };
  }

  setMode(mode: ConnectivityMode): void {
    this.mode = mode;
  }

  requestCut(input: AuthRequest): Promise<AuthResponse> {
    this.requestCalls.push(input);
    return withRetries((_attempt, signal) => {
      this.requestAttempts += 1;
      return this.networkCall(signal, () => {
        if (this.requestError) throw this.requestError;
        const response = { ...clone(this.requestResponse), operationId: this.requestResponse.operationId ?? input.operationId };
        if (response.status === "authorized" && response.grant) this.issuedGrants.set(response.grant.authorizationId, response.grant);
        return response;
      });
    }, this.retryPolicy);
  }

  consumeCut(input: ConsumeRequest): Promise<ConsumeResponse> {
    this.consumeCalls.push(input);
    return withRetries((_attempt, signal) => {
      this.consumeAttempts += 1;
      return this.networkCall(signal, () => {
        if (this.consumeError) throw this.consumeError;
        const grant = this.issuedGrants.get(input.authorizationId);
         if (!grant || !matchesGrant(grant, input)) return { operationId: input.operationId, status: "not_authorized", errorCode: "GRANT_BINDING_MISMATCH" };
         if (this.consumedGrantIds.has(grant.authorizationId)) return { operationId: input.operationId, status: "already_consumed", errorCode: "AUTHORIZATION_ALREADY_CONSUMED" };
         const response = { ...clone(this.consumeResponse), operationId: this.consumeResponse.operationId ?? input.operationId };
        if (response.status === "consumed" || response.status === "already_consumed") this.consumedGrantIds.add(grant.authorizationId);
        return response;
      });
    }, { ...this.retryPolicy, attempts: 1 });
  }

  lookup(operationId: string): Promise<RemoteResult> {
    this.lookupCalls.push(operationId);
    return withRetries((_attempt, signal) => {
      this.lookupAttempts += 1;
      return this.networkCall(signal, () => {
        if (this.lookupError) throw this.lookupError;
        return { ...clone(this.lookupResponse), operationId: this.lookupResponse.operationId ?? operationId };
      });
    }, this.retryPolicy);
  }

  private async networkCall<T>(signal: AbortSignal | undefined, response: () => T): Promise<T> {
    if (signal?.aborted) throw new NetworkUnknownError();
    if (this.mode === "offline") throw new NetworkUnknownError();
    if (this.mode === "weak" && this.weakAttempts++ < this.weakFailures) throw new NetworkUnknownError();
    return response();
  }
}

export class MockEnablementAdapter implements EnablementAdapter {
  readonly simulation = "DEMO_ONLY_NO_SEPSA_ENDPOINT" as const;
  readonly requestCalls: EnablementRequest[] = [];
  readonly consumeCalls: ConsumeEnablementRequest[] = [];
  readonly lookupCalls: string[] = [];
  readonly issuedGrants = new Map<string, EnablementGrant>();
  readonly consumedGrantIds = new Set<string>();
  requestAttempts = 0;
  consumeAttempts = 0;
  lookupAttempts = 0;
  requestResponse: ConfiguredEnablementResponse = { status: "enabled" };
  consumeResponse: ConfiguredConsumeEnablementResponse = { status: "consumed" };
  lookupResponse: RemoteResult = { status: "not_found" };
  requestError: unknown;
  consumeError: unknown;
  lookupError: unknown;
  weakFailures = 1;
  private weakAttempts = 0;
  private mode: ConnectivityMode;
  private readonly retryPolicy: RetryPolicy;

  constructor(options: MockAdapterOptions = {}) {
    this.mode = options.mode ?? "online";
    this.retryPolicy = { ...options.retryPolicy, sleep: options.retryPolicy?.sleep ?? (async () => undefined) };
  }

  setMode(mode: ConnectivityMode): void {
    this.mode = mode;
  }

  requestReconnection(input: EnablementRequest): Promise<EnablementResponse> {
    this.requestCalls.push(input);
    return withRetries((_attempt, signal) => {
      this.requestAttempts += 1;
      return this.networkCall(signal, () => {
        if (this.requestError) throw this.requestError;
        const response = { ...clone(this.requestResponse), operationId: this.requestResponse.operationId ?? input.operationId };
        if (response.status === "enabled" && response.grant) this.issuedGrants.set(response.grant.enablementId, response.grant);
        return response;
      });
    }, this.retryPolicy);
  }

  consumeReconnection(input: ConsumeEnablementRequest): Promise<ConsumeEnablementResponse> {
    this.consumeCalls.push(input);
    return withRetries((_attempt, signal) => {
      this.consumeAttempts += 1;
      return this.networkCall(signal, () => {
        if (this.consumeError) throw this.consumeError;
        const grant = this.issuedGrants.get(input.enablementId);
         if (!grant || !matchesGrant(grant, input)) return { operationId: input.operationId, status: "not_enabled", errorCode: "GRANT_BINDING_MISMATCH" };
         if (this.consumedGrantIds.has(grant.enablementId)) return { operationId: input.operationId, status: "already_consumed", errorCode: "ENABLEMENT_ALREADY_CONSUMED" };
         const response = { ...clone(this.consumeResponse), operationId: this.consumeResponse.operationId ?? input.operationId };
        if (response.status === "consumed" || response.status === "already_consumed") this.consumedGrantIds.add(grant.enablementId);
        return response;
      });
    }, { ...this.retryPolicy, attempts: 1 });
  }

  lookup(operationId: string): Promise<RemoteResult> {
    this.lookupCalls.push(operationId);
    return withRetries((_attempt, signal) => {
      this.lookupAttempts += 1;
      return this.networkCall(signal, () => {
        if (this.lookupError) throw this.lookupError;
        return { ...clone(this.lookupResponse), operationId: this.lookupResponse.operationId ?? operationId };
      });
    }, this.retryPolicy);
  }

  private async networkCall<T>(signal: AbortSignal | undefined, response: () => T): Promise<T> {
    if (signal?.aborted) throw new NetworkUnknownError();
    if (this.mode === "offline") throw new NetworkUnknownError();
    if (this.mode === "weak" && this.weakAttempts++ < this.weakFailures) throw new NetworkUnknownError();
    return response();
  }
}

function matchesGrant(grant: AuthorizationGrant | EnablementGrant, input: ConsumeRequest | ConsumeEnablementRequest): boolean {
  return grant.token === input.token && grant.orderId === input.orderId && grant.technicianId === input.technicianId && grant.deviceId === input.deviceId && grant.operationId === input.operationId && grant.version === input.version;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export { ResponseLostError };
