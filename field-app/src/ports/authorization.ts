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
}

export interface ConsumeResponse {
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
