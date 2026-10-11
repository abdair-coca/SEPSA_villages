/**
 * Puertos de autorización online para acciones físicas: corte (`AuthorizationAdapter`) y habilitación de
 * reconexión (`EnablementAdapter`).
 *
 * Regla central: una autorización es online, concluyente, vigente, de un solo uso y está ligada a orden,
 * técnico, dispositivo, operación y versión. `unknown`, timeout o respuesta perdida **nunca** autorizan;
 * en esos casos se consulta el estado con el mismo `operationId` (`lookup`) en vez de pedir otra.
 */
export type AuthorizationStatus = "authorized" | "not_authorized" | "unknown";
export type ConsumeStatus =
  | "consumed"
  | "already_consumed"
  | "not_authorized"
  | "unknown";

export interface AuthRequest {
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  orderVersion?: number;
  technicianNameSnapshot?: string;
  signal?: AbortSignal;
}

/** Autorización de corte concedida. `token` es de un solo uso y vence en `expiresAt`. */
export interface AuthorizationGrant {
  authorizationId: string;
  token: string;
  orderId: string;
  technicianId: string;
  technicianNameSnapshot?: string;
  deviceId: string;
  operationId: string;
  version: number;
  issuedAt: string;
  expiresAt: string;
  /**
   * `immediate`: se consume (`consumeCut`) justo antes de registrar el corte. `deferred`: el backend piloto
   * la consume al aceptar la operación sincronizada.
   */
  consumption?: "immediate" | "deferred";
}

export interface AuthResponse {
  operationId: string;
  status: AuthorizationStatus;
  grant?: AuthorizationGrant;
  errorCode?: string;
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
}

/**
 * Resultado de consultar una operación en el servidor. Solo `confirmed` con recibo completo confirma;
 * `not_found` o `unknown` dejan la operación en revisión y no habilitan reenviarla.
 */
export type RemoteResult =
  | ({ status: "confirmed"; operationId?: string } & Partial<RemoteOperationReceipt>)
  | { status: "not_found"; operationId?: string }
  | { status: "unknown"; operationId?: string; errorCode?: string };

/** Recibo del servidor: debe coincidir con la operación local (orden, técnico, dispositivo, acción…) para confirmarla. */
export interface RemoteOperationReceipt {
  orderId: string;
  technicianId: string;
  deviceId: string;
  orderVersion?: number;
  action: "CUT" | "RECONNECTION" | "VISIT";
  recordedAt: string;
  effectiveAt?: string;
  technicianNameSnapshot?: string;
  demora?: string;
  evidenceRefs: string[];
  fieldCapture?: import("../domain/types").FieldCapture;
}

export interface AuthorizationAdapter {
  /** Pide autorización para cortar. Un rechazo explícito del backend (incluido 401) vuelve como `not_authorized`; una respuesta en duda (5xx, replay, conflicto de identificador) vuelve como `unknown`. Puede lanzar `TimeoutError` o `ResponseLostError`: ninguno autoriza. */
  requestCut(input: AuthRequest): Promise<AuthResponse>;
  /** Consume la autorización (un solo uso). `already_consumed` con la misma operación es un replay, no un segundo corte. */
  consumeCut(input: ConsumeRequest): Promise<ConsumeResponse>;
  /** Consulta el estado de una operación de corte por su id. */
  lookup(operationId: string): Promise<RemoteResult>;
}

export type EnablementStatus = "enabled" | "not_enabled" | "unknown";

export interface EnablementRequest {
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  orderVersion?: number;
  technicianNameSnapshot?: string;
  signal?: AbortSignal;
}

export interface EnablementGrant {
  enablementId: string;
  token: string;
  orderId: string;
  technicianId: string;
  technicianNameSnapshot?: string;
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

export interface EnablementLookupResult {
  status: "reserved" | "consumed" | "expired" | "not_found" | "unknown";
  operationId: string;
  errorCode?: string;
}

/**
 * Habilitación de reconexión (contrato provisional del piloto, no oficial de SEPSA). Mismo esquema que el
 * corte: reservar, consumir una vez y consultar por `operationId` si la respuesta se pierde.
 */
export interface EnablementAdapter {
  /** Pide habilitación de reconexión con el mismo criterio que `requestCut`: rechazo explícito → `not_enabled`; 5xx, replay o conflicto de identificador → `unknown`. */
  requestReconnection(input: EnablementRequest): Promise<EnablementResponse>;
  consumeReconnection(input: ConsumeEnablementRequest): Promise<ConsumeEnablementResponse>;
  lookupReconnection(operationId: string): Promise<EnablementLookupResult>;
  lookup(operationId: string): Promise<RemoteResult>;
}

/** La autorización no respondió a tiempo. Se trata como resultado desconocido, nunca como autorización. */
export class TimeoutError extends Error {
  readonly code = "TIMEOUT";

  constructor() {
    super("Authorization request timed out.");
    this.name = "TimeoutError";
  }
}

/** La petición pudo llegar pero la respuesta se perdió. Hay que consultar estado; no se reintenta a ciegas. */
export class ResponseLostError extends Error {
  readonly code = "RESPONSE_LOST";

  constructor() {
    super("Authorization response was lost.");
    this.name = "ResponseLostError";
  }
}
