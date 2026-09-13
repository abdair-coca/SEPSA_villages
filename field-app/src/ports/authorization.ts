export type AuthorizationStatus = "authorized" | "payment_detected" | "not_authorized" | "unknown";
export type ConsumeStatus =
  | "consumed"
  | "already_consumed"
  | "payment_detected"
  | "not_authorized"
  | "unknown";

export interface AuthRequest {
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  orderVersion?: number;
  signal?: AbortSignal;
}

export interface AuthorizationGrant {
  authorizationId: string;
  token: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  version: number;
  issuedAt: string;
  expiresAt: string;
}

export interface PaymentDetection {
  reason: string;
  detectedAt: string;
}

export interface AuthResponse {
  operationId: string;
  status: AuthorizationStatus;
  grant?: AuthorizationGrant;
  errorCode?: string;
  payment?: PaymentDetection;
}

export interface ConsumeRequest {
  authorizationId: string;
  token: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  version: number;
  signal?: AbortSignal;
}

export interface ConsumeResponse {
  operationId: string;
  status: ConsumeStatus;
  errorCode?: string;
  payment?: PaymentDetection;
}

export type RemoteResult =
  | { status: "confirmed"; operationId?: string }
  | { status: "not_found"; operationId?: string }
  | { status: "unknown"; operationId?: string; errorCode?: string };

export interface AuthorizationAdapter {
  requestCut(input: AuthRequest): Promise<AuthResponse>;
  consumeCut(input: ConsumeRequest): Promise<ConsumeResponse>;
  lookup(operationId: string): Promise<RemoteResult>;
}

export type EnablementStatus = "enabled" | "not_enabled" | "unknown";

export interface EnablementRequest {
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  orderVersion?: number;
  signal?: AbortSignal;
}

export interface EnablementGrant {
  enablementId: string;
  token: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  version: number;
  issuedAt: string;
  expiresAt: string;
}

export interface EnablementResponse {
  operationId: string;
  status: EnablementStatus;
  grant?: EnablementGrant;
  errorCode?: string;
}

export interface ConsumeEnablementRequest {
  enablementId: string;
  token: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  version: number;
  signal?: AbortSignal;
}

export type ConsumeEnablementStatus =
  | "consumed"
  | "already_consumed"
  | "not_enabled"
  | "unknown";

export interface ConsumeEnablementResponse {
  operationId: string;
  status: ConsumeEnablementStatus;
  errorCode?: string;
}

/** Provisional seam for external reconnection habilitation. */
export interface EnablementAdapter {
  requestReconnection(input: EnablementRequest): Promise<EnablementResponse>;
  consumeReconnection(input: ConsumeEnablementRequest): Promise<ConsumeEnablementResponse>;
  lookup(operationId: string): Promise<RemoteResult>;
}

export class TimeoutError extends Error {
  readonly code = "TIMEOUT";

  constructor() {
    super("Authorization request timed out.");
    this.name = "TimeoutError";
  }
}

export class ResponseLostError extends Error {
  readonly code = "RESPONSE_LOST";

  constructor() {
    super("Authorization response was lost.");
    this.name = "ResponseLostError";
  }
}
