import { assertCan, permissionsForRole, type AuditEvent, type ConnectivityMode, type DebtorRecord, type DemoCredentials, type OperationRecord, type Session, type VisitRecord, type WorkOrder, type WorkPackageEnvelope } from "../../domain";
import type { IdentityPort, OperationsAuthorityPort, TechnicalOrderAuthorizationInput, TechnicalOrderAuthorizationResult } from "../../ports";
import type { AuthorizationAdapter, AuthRequest, AuthResponse, ConsumeRequest, ConsumeResponse, RemoteResult } from "../../ports/authorization";
import type { SyncPayload, SyncTransport, SyncTransportResponse } from "../../ports/sync";

interface HttpClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

interface ApiErrorBody { code?: string; message?: string; }
interface LoginResponse { session_id: string; session_token: string; expires_at: string; user: { user_id: string; username: string; display_name: string; role: "ADMIN" | "TECHNICIAN" }; }
interface AuthorizationResponse { authorization_id: string; token: string; order_id: string; technician_id: string; device_id: string; operation_id: string; version: number; issued_at: string; expires_at: string; }
interface PackageResponse { package: { package_id: string; technician_id: string; device_id: string; version: number; downloaded_at: string; orders: unknown[] }; checksum: string; }

export class HttpPilotClient implements IdentityPort, OperationsAuthorityPort, AuthorizationAdapter, SyncTransport {
  readonly simulation = "PILOT_PROVISIONAL" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private mode: ConnectivityMode = "online";
  private activeSession?: Session;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    if (!this.baseUrl) throw new Error("PILOT_PROVISIONAL backend URL is required.");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  setMode(mode: ConnectivityMode): void {
    this.mode = mode;
  }

  async authenticate(input: DemoCredentials): Promise<Session> {
    const response = await this.request<LoginResponse>("/v1/auth/login", { method: "POST", body: input });
    const session: Session = {
      sessionId: response.session_id,
      userId: response.user.user_id,
      username: response.user.username,
      role: response.user.role,
      permissions: permissionsForRole(response.user.role),
      issuedAt: new Date().toISOString(),
      authenticity: "PILOT_PROVISIONAL",
      sessionToken: response.session_token,
      expiresAt: response.expires_at,
    };
    this.activeSession = session;
    return session;
  }

  async authorize(session: Session, action: Parameters<typeof assertCan>[1]): Promise<void> {
    assertCan(session, action);
    this.requireActiveSession(session);
  }

  async logout(session: Session): Promise<void> {
    await this.request<void>("/v1/auth/logout", { method: "POST" }, this.requireSession(session));
    if (this.activeSession?.sessionId === session.sessionId) this.activeSession = undefined;
  }

  async findDebtors(query: { query?: string; session?: Session }): Promise<DebtorRecord[]> {
    const session = this.requireSession(query.session);
    const params = new URLSearchParams();
    if (query.query?.trim()) params.set("query", query.query.trim());
    const response = await this.request<{ debtors: unknown[] }>(`/v1/debtors?${params}`, { method: "GET" }, session);
    return response.debtors.map(mapDebtor);
  }

  async createOrder(input: { operationId: string; debtorId: string; purpose: "CUT"; session?: Session }): Promise<WorkOrder> {
    const session = this.requireSession(input.session);
    const response = await this.request<{ order: unknown } | unknown>("/v1/orders", { method: "POST", body: { operation_id: input.operationId, debtor_id: input.debtorId, purpose: input.purpose } }, session);
    return mapOrder("order" in asRecord(response) ? asRecord(response).order : response);
  }

  async assignOrder(input: { operationId: string; orderId: string; technicianId: string; expectedOrderVersion: number; session?: Session }): Promise<WorkOrder> {
    const session = this.requireSession(input.session);
    const response = await this.request<unknown>(`/v1/orders/${encodeURIComponent(input.orderId)}/assignment`, { method: "POST", body: { operation_id: input.operationId, technician_id: input.technicianId, expected_version: input.expectedOrderVersion } }, session);
    return mapOrder(response);
  }

  async downloadAssigned(technicianId: string, deviceId: string, session?: Session): Promise<WorkPackageEnvelope> {
    const authorized = this.requireSession(session);
    if (authorized.userId !== technicianId) throw new Error("Technician identity does not match session.");
    const response = await this.request<PackageResponse>(`/v1/technician/orders?device_id=${encodeURIComponent(deviceId)}`, { method: "GET" }, authorized);
    if (response.checksum !== await digestJson(response.package)) throw new Error("Server work package integrity validation failed.");
    const workPackage = {
      packageId: response.package.package_id,
      technicianId: response.package.technician_id,
      deviceId: response.package.device_id,
      version: response.package.version,
      downloadedAt: response.package.downloaded_at,
      orders: response.package.orders.map(mapOrder),
    };
    // Local persistence validates its own envelope; server checksum remains available in transport response.
    return { packageId: workPackage.packageId, package: workPackage, authenticity: "SIMULATED", integrity: "SIMULATED", validation: "SIMULATED_VALID", checksum: provisionalPackageChecksum(workPackage) };
  }

  async recordSyncedOperation(operation: OperationRecord | VisitRecord, session: Session): Promise<void> {
    const result = await this.send(toSyncPayload(operation), session);
    if (result.status === "conflict") throw new Error(result.reason);
    if (result.status === "unknown") throw new Error(result.errorCode ?? "REMOTE_OPERATION_UNKNOWN");
  }

  async authorizeTechnicalOrder(input: TechnicalOrderAuthorizationInput): Promise<TechnicalOrderAuthorizationResult> {
    const session = this.requireSession(input.session);
    try {
      await this.request<AuthorizationResponse>("/v1/authorizations/cut", { method: "POST", body: { operation_id: input.operationId, order_id: input.orderId, device_id: input.deviceId, order_version: input.orderVersion } }, session);
      return { status: "authorized", order: { orderId: input.orderId, assignedTechnicianId: input.technicianId, status: "GENERADO", physicalStatus: "NONE", version: input.orderVersion } };
    } catch (error) {
      return { status: "not_authorized", errorCode: errorCode(error, "AUTHORIZATION_UNKNOWN") };
    }
  }

  async lookupSyncedOperation(operationId: string, session: Session, technicianId: string, deviceId: string): Promise<RemoteResult> {
    const authorized = this.requireSession(session);
    if (authorized.userId !== technicianId || !deviceId.trim()) return { status: "unknown", operationId, errorCode: "TECHNICIAN_SCOPE" };
    return this.lookup(operationId);
  }

  async listOrders(session: Session): Promise<WorkOrder[]> {
    const response = await this.request<{ orders: unknown[] }>("/v1/orders", { method: "GET" }, this.requireSession(session));
    return response.orders.map(mapOrder);
  }

  async listAudit(query: { orderId?: string; session?: Session } = {}): Promise<AuditEvent[]> {
    const session = this.requireSession(query.session);
    const params = query.orderId ? `?order_id=${encodeURIComponent(query.orderId)}` : "";
    const response = await this.request<{ audit: unknown[] }>(`/v1/audit${params}`, { method: "GET" }, session);
    return response.audit.map(mapAudit);
  }

  async requestCut(input: AuthRequest): Promise<AuthResponse> {
    const session = this.requireActiveSession();
    const response = await this.request<AuthorizationResponse>("/v1/authorizations/cut", { method: "POST", body: { operation_id: input.operationId, order_id: input.orderId, device_id: input.deviceId, order_version: input.orderVersion } }, session);
    return { operationId: response.operation_id, status: "authorized", grant: { authorizationId: response.authorization_id, token: response.token, orderId: response.order_id, technicianId: response.technician_id, deviceId: response.device_id, operationId: response.operation_id, version: response.version, issuedAt: response.issued_at, expiresAt: response.expires_at, consumption: "deferred" } };
  }

  async consumeCut(input: ConsumeRequest): Promise<ConsumeResponse> {
    return { operationId: input.operationId, status: "unknown", errorCode: "SERVER_SIDE_CONSUMPTION_REQUIRED" };
  }

  async send(payload: SyncPayload, session = this.requireActiveSession()): Promise<SyncTransportResponse> {
    try {
      await this.request<unknown>("/v1/sync/operations", { method: "POST", body: toWirePayload(payload) }, session);
      return { status: "acknowledged", operationId: payload.operationId };
    } catch (error) {
      if (error instanceof HttpPilotError && error.status === 409) return { status: "conflict", operationId: payload.operationId, remote: error.body, reason: error.code };
      throw error;
    }
  }

  async lookup(operationId: string): Promise<RemoteResult> {
    const response = await this.request<{ status: "confirmed" | "not_found" | "unknown"; operation_id: string; error_code?: string }>(`/v1/sync/operations/${encodeURIComponent(operationId)}`, { method: "GET" }, this.requireActiveSession());
    return { status: response.status, operationId: response.operation_id, errorCode: response.error_code };
  }

  private requireSession(session?: Session): Session {
    if (!session) throw new Error("PILOT_PROVISIONAL session is required.");
    this.requireActiveSession(session);
    return session;
  }

  private requireActiveSession(session = this.activeSession): Session {
    if (!session?.sessionToken) throw new Error("PILOT_PROVISIONAL session is unavailable.");
    if (this.activeSession && session.sessionId !== this.activeSession.sessionId) throw new Error("Session is not active in this client.");
    return session;
  }

  private async request<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }, session?: Session): Promise<T> {
    if (this.mode === "offline") throw networkUnknown();
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (session?.sessionToken) headers.authorization = `Bearer ${session.sessionToken}`;
    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl + path, { method: init.method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    } catch {
      throw networkUnknown();
    }
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => undefined) as unknown;
    if (!response.ok) {
      const error = asRecord(body);
      throw new HttpPilotError(response.status, stringOr(error.code, "HTTP_ERROR"), stringOr(error.message, "PILOT_PROVISIONAL request failed."), body);
    }
    return body as T;
  }
}

class HttpPilotError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly body: unknown) { super(message); }
}

function toWirePayload(payload: SyncPayload): Record<string, unknown> {
  return {
    operation_id: payload.operationId,
    action: payload.action,
    order_id: payload.orderId,
    technician_id: payload.technicianId,
    device_id: payload.deviceId,
    recorded_at: payload.recordedAt,
    evidence_refs: payload.evidenceRefs,
    attempted_action: payload.attemptedAction,
    order_version: payload.orderVersion,
    authorization_id: payload.authorizationId,
    authorization_token: payload.authorizationToken,
    reason: payload.reason,
    exception_reason: payload.exceptionReason,
    field_capture: payload.fieldCapture,
  };
}

function toSyncPayload(record: OperationRecord | VisitRecord): SyncPayload {
  const visit = record.kind === "VISIT" && "attemptedAction" in record;
  return {
    operationId: record.operationId,
    action: visit ? "VISIT" : record.action,
    attemptedAction: visit ? record.attemptedAction : undefined,
    orderId: record.orderId,
    technicianId: record.technicianId,
    deviceId: record.deviceId,
    recordedAt: record.recordedAt,
    evidenceRefs: [...record.evidenceRefs],
    orderVersion: visit ? undefined : record.authorizationVersion,
    authorizationId: visit ? undefined : record.authorizationId,
    authorizationToken: visit ? undefined : record.authorizationToken,
    reason: visit ? record.reason : undefined,
    exceptionReason: record.exceptionReason,
    fieldCapture: record.fieldCapture,
  };
}

function mapDebtor(value: unknown): DebtorRecord {
  const raw = asRecord(value);
  return {
    debtorId: stringOr(raw.debtor_id), accountId: stringOr(raw.account_id), supplyId: stringOr(raw.supply_id), customerName: stringOr(raw.customer_name), address: stringOr(raw.address), references: stringOr(raw.references), meterId: stringOr(raw.meter_id), area: stringOr(raw.area), locality: stringOr(raw.locality), route: stringOr(raw.route), debtCents: numberOr(raw.debt_cents), monthsPending: numberOr(raw.months_pending), updatedAt: stringOr(raw.updated_at), kardex: Array.isArray(raw.kardex) ? raw.kardex as DebtorRecord["kardex"] : [], source: "SIMULATED",
  };
}

function mapOrder(value: unknown): WorkOrder {
  const raw = asRecord(value);
  const context = raw.context === undefined ? undefined : mapDebtor(raw.context);
  return { orderId: stringOr(raw.order_id), assignedTechnicianId: stringOr(raw.assigned_technician_id), status: stringOr(raw.status) as WorkOrder["status"], physicalStatus: stringOr(raw.physical_status) as WorkOrder["physicalStatus"], version: numberOr(raw.version), purpose: "CUT", debtorId: stringOr(raw.debtor_id), accountId: stringOr(raw.account_id), supplyId: stringOr(raw.supply_id), createdBy: stringOr(raw.created_by), createdAt: stringOr(raw.created_at), origin: "SIMULATED", context };
}

function mapAudit(value: unknown): AuditEvent {
  const raw = asRecord(value);
  return { auditId: stringOr(raw.audit_id), actorId: stringOr(raw.actor_id), actorRole: raw.actor_role === "ADMIN" || raw.actor_role === "TECHNICIAN" ? raw.actor_role : undefined, action: stringOr(raw.action), entityId: optionalString(raw.entity_id), orderId: optionalString(raw.order_id), operationId: optionalString(raw.operation_id), result: raw.result === "rejected" ? "rejected" : "accepted", reason: optionalString(raw.reason), deviceId: optionalString(raw.device_id), occurredAt: stringOr(raw.occurred_at), source: "SIMULATED" };
}

function provisionalPackageChecksum(workPackage: { packageId: string; technicianId: string; deviceId: string; version: number; downloadedAt: string; orders: WorkOrder[] }): string {
  const canonical = JSON.stringify(workPackage);
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) hash = Math.imul(hash ^ canonical.charCodeAt(index), 16777619);
  return `SIMULATED-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function digestJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOr(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function optionalString(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function numberOr(value: unknown, fallback = 0): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function errorCode(error: unknown, fallback: string): string { return error instanceof HttpPilotError ? error.code : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : fallback; }
function networkUnknown(): Error { const error = new Error("Network availability is unknown."); error.name = "NetworkUnknownError"; Object.defineProperty(error, "code", { value: "NETWORK_UNKNOWN" }); return error; }
