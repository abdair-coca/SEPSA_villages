/**
 * Cliente del backend piloto (`PILOT_PROVISIONAL`, no API oficial de SEPSA). Implementa todos los puertos
 * remotos en un solo objeto: identidad, autoridad de operaciones, autorización de corte, habilitación de
 * reconexión, transporte de sincronización y subida de evidencia.
 *
 * Traducción de errores:
 * - Fallo de red, modo offline o timeout → error `NETWORK_UNKNOWN`: resultado desconocido, nunca éxito.
 * - Respuesta HTTP no OK → `HttpPilotError` con el `code` del backend.
 * - 409 en sync → `conflict` (se conserva); 409 en habilitación → `not_enabled`.
 * - Autorización de corte y reconexión: rechazo definitivo o 401 → `not_authorized` / `not_enabled` con su código; 5xx, replay o conflicto de identificador → `unknown` (se guarda para revisión).
 * La sesión vive solo en memoria y se envía por cookie (`credentials: "include"`).
 * Contrato HTTP: `docs/api/pilot-contract.md`.
 */
import { assertCan, permissionsForRole } from "../../domain/policies";
import type {
  AuditEvent,
  ConnectivityMode,
  CreateOrdersBatchResult,
  DataSource,
  DebtorQuery,
  DebtorRecord,
  DemoCredentials,
  KardexEntry,
  OperationRecord,
  Session,
  TechnicianRecord,
  VisitRecord,
  WorkOrder,
  WorkPackageEnvelope,
} from "../../domain/types";
import type { IdentityPort } from "../../ports/identity";
import type {
  OperationsAuthorityPort,
  TechnicalOrderAuthorizationInput,
  TechnicalOrderAuthorizationResult,
} from "../../ports/authority";
import type { AuthorizationAdapter, AuthRequest, AuthResponse, ConsumeRequest, ConsumeResponse, ConsumeEnablementRequest, CutAuthorizationLookupResult, ConsumeEnablementResponse, EnablementAdapter, EnablementLookupResult, EnablementRequest, EnablementResponse, RemoteResult } from "../../ports/authorization";
import type { EvidenceUploadPort, SyncPayload, SyncTransport, SyncTransportResponse } from "../../ports/sync";
import type { PilotAuditResponseDto, PilotAuthorizationResponseDto, PilotBatchOrderResponseDto, PilotCutAuthorizationLookupDto, PilotCutConsumeResponseDto, PilotDebtorsResponseDto, PilotEvidenceUploadResponseDto, PilotLookupResponseDto, PilotLoginResponseDto, PilotOrderResponseDto, PilotPackageResponseDto, PilotReconnectionConsumeResponseDto, PilotReconnectionEnablementLookupDto, PilotReconnectionEnablementResponseDto, PilotSyncResponseDto, PilotTechnicianResponseDto } from "./contracts";

/**
 * Rechazos del backend a `POST /v1/authorizations/cut` que ocurren antes de crear cualquier reserva: el corte no
 * queda autorizado y se registra como visita bloqueada con ese código. Los replays y conflictos de identificador
 * están en `AUTHORIZATION_REPLAY_CODES`: su resultado es incierto, no un rechazo.
 */
const CUT_AUTHORIZATION_REJECTIONS: ReadonlySet<string> = new Set([
  "ORDER_NOT_FOUND",
  "ORDER_NOT_ASSIGNED",
  "VERSION_CONFLICT",
  "ORDER_NOT_ELIGIBLE",
  "PHYSICAL_STATUS_NOT_ELIGIBLE",
]);

/**
 * Respuestas en las que el backend ya tiene una reserva o una operación ligada a ese identificador. No son rechazos:
 * el resultado es incierto y se guarda para revisión, como un timeout.
 */
const AUTHORIZATION_REPLAY_CODES: ReadonlySet<string> = new Set(["AUTHORIZATION_OPERATION_REPLAY", "ENABLEMENT_OPERATION_REPLAY", "IDEMPOTENCY_CONFLICT"]);
/** Tiempo límite de un consumo: agotado, el resultado es incierto y se reintenta con el mismo `operationId`. */
const CONSUME_TIMEOUT_MS = 15_000;

interface HttpClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/** Cliente HTTP del piloto; ver descripción al inicio del archivo. */
export class HttpPilotClient implements IdentityPort, OperationsAuthorityPort, AuthorizationAdapter, EnablementAdapter, SyncTransport, EvidenceUploadPort {
  readonly simulation = "PILOT_PROVISIONAL" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private mode: ConnectivityMode = "online";
  private activeSession?: Session;
  private readonly activeAdminReads = new Set<Promise<void>>();

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    if (!this.baseUrl) throw new Error("La URL del servicio de operaciones es obligatoria.");
    this.fetchImpl = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
  }

  setMode(mode: ConnectivityMode): void {
    this.mode = mode;
  }

  async authenticate(input: DemoCredentials): Promise<Session> {
    const response = await this.request<PilotLoginResponseDto>("/v1/auth/login", { method: "POST", body: input });
    return this.acceptSession(response);
  }

  async currentSession(session: Session): Promise<Session> {
    const response = await this.request<PilotLoginResponseDto>("/v1/auth/session", { method: "GET", timeoutMs: 15_000 }, this.requireSession(session));
    return this.acceptSession(response, session);
  }

  /** Cambia el rol activo de la sesión; espera a que terminen las lecturas de admin en curso para no mezclar respuestas. */
  async switchRole(session: Session, role: Session["role"]): Promise<Session> {
    await this.waitForAdminReads();
    const response = await this.request<PilotLoginResponseDto>("/v1/auth/role", { method: "POST", body: { role }, timeoutMs: 15_000 }, this.requireSession(session));
    return this.acceptSession(response, session);
  }

  /** Convierte la respuesta de sesión; si cambió la identidad respecto de la sesión previa, obliga a reingresar. */
  private acceptSession(response: PilotLoginResponseDto, previous?: Session): Session {
    if (previous && (response.session_id !== previous.sessionId || response.user.user_id !== previous.userId)) throw new Error("La identidad de sesión cambió. Ingrese nuevamente.");
    const session: Session = {
      sessionId: response.session_id,
      userId: response.user.user_id,
      username: response.user.username,
      displayName: response.user.display_name,
      role: response.user.role,
      roles: response.user.roles ?? [response.user.role],
      permissions: permissionsForRole(response.user.role),
      issuedAt: previous?.issuedAt ?? new Date().toISOString(),
      authenticity: "PILOT_PROVISIONAL",
      expiresAt: response.expires_at,
    };
    this.activeSession = session;
    return session;
  }

  restoreSession(session: Session): void {
    if (!isValidFutureDate(session.expiresAt)) return;
    this.activeSession = session;
  }

  async authorize(session: Session, action: Parameters<typeof assertCan>[1]): Promise<void> {
    assertCan(session, action);
    this.requireActiveSession(session);
  }

  async logout(session: Session): Promise<void> {
    await this.request<void>("/v1/auth/logout", { method: "POST" }, this.requireSession(session));
    if (this.activeSession?.sessionId === session.sessionId) this.activeSession = undefined;
  }

  async findDebtors(query: DebtorQuery): Promise<DebtorRecord[]> {
    const session = this.requireSession(query.session);
    return this.trackAdminRead(session, async () => {
      const all: DebtorRecord[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.findDebtorsPage(query, cursor);
        all.push(...page.debtors);
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      return all;
    });
  }

  async findDebtorsPage(query: DebtorQuery, cursor?: string): Promise<{ debtors: DebtorRecord[]; nextCursor?: string; total?: number }> {
    const session = this.requireSession(query.session);
    const params = new URLSearchParams();
    if (query.query?.trim()) params.set("query", query.query.trim());
    if ("area" in query && query.area?.trim()) params.set("area", query.area.trim());
    if ("locality" in query && query.locality?.trim()) params.set("locality", query.locality.trim());
    if ("route" in query && query.route?.trim()) params.set("route", query.route.trim());
    if (query.minMonthsPending !== undefined) params.set("min_months_pending", String(query.minMonthsPending));
    if (query.supplyStatus?.trim()) params.set("supply_status", query.supplyStatus.trim());
    params.set("limit", "100");
    if (cursor !== undefined) params.set("cursor", cursor);
    const response = await this.request<PilotDebtorsResponseDto>(`/v1/debtors?${params}`, { method: "GET" }, session);
    return { debtors: response.debtors.map(mapDebtor), nextCursor: response.next_cursor ?? undefined, total: response.total };
  }

  async listTechnicians(session: Session): Promise<TechnicianRecord[]> {
    const authorized = this.requireSession(session);
    return this.trackAdminRead(authorized, async () => {
      const response = await this.request<PilotTechnicianResponseDto>("/v1/technicians", { method: "GET" }, authorized);
      return response.technicians.map(mapTechnician);
    });
  }

  async createOrder(input: { operationId: string; debtorId: string; purpose: "CUT"; session?: Session }): Promise<WorkOrder> {
    const session = this.requireSession(input.session);
    const response = await this.request<PilotOrderResponseDto>("/v1/orders", { method: "POST", body: { operation_id: input.operationId, debtor_id: input.debtorId, purpose: input.purpose } }, session);
    return mapOrder("order" in asRecord(response) ? asRecord(response).order : response);
  }

  async createOrdersBatch(input: { batchId: string; debtorIds: string[]; purpose: "CUT"; session?: Session }): Promise<CreateOrdersBatchResult> {
    const session = this.requireSession(input.session);
    const response = await this.request<PilotBatchOrderResponseDto>("/v1/orders/batch", { method: "POST", body: { batch_id: input.batchId, debtor_ids: input.debtorIds, purpose: input.purpose } }, session);
    return { batchId: response.batch_id, requestedDebtorIds: response.requested_debtor_ids, created: response.created.map(mapOrder), skipped: response.skipped.map((item) => ({ debtorId: item.debtor_id, reason: item.reason, message: item.message })) };
  }

  async assignOrder(input: { operationId: string; orderId: string; technicianId: string; expectedOrderVersion: number; session?: Session }): Promise<WorkOrder> {
    const session = this.requireSession(input.session);
    const response = await this.request<PilotOrderResponseDto>(`/v1/orders/${encodeURIComponent(input.orderId)}/assignment`, { method: "POST", body: { operation_id: input.operationId, technician_id: input.technicianId, expected_version: input.expectedOrderVersion } }, session);
    return mapOrder(response);
  }

  async downloadAssigned(technicianId: string, deviceId: string, session?: Session, knownVersion?: number): Promise<WorkPackageEnvelope> {
    const authorized = this.requireSession(session);
    if (authorized.userId !== technicianId) throw new Error("La identidad del técnico no coincide con la sesión.");
    const params = new URLSearchParams({ device_id: deviceId });
    if (knownVersion !== undefined) params.set("known_version", String(knownVersion));
    const response = await this.request<PilotPackageResponseDto>(`/v1/technician/orders?${params}`, { method: "GET" }, authorized);
    if (response.checksum !== await digestJson(response.package)) throw new Error("La validación de integridad del paquete de trabajo del servidor falló.");
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
      await this.request<PilotAuthorizationResponseDto>("/v1/authorizations/cut", { method: "POST", body: { operation_id: input.operationId, order_id: input.orderId, device_id: input.deviceId, order_version: input.orderVersion } }, session);
      return { status: "authorized", order: { orderId: input.orderId, assignedTechnicianId: input.technicianId, status: "GENERADO", physicalStatus: "NONE", version: input.orderVersion, authoritativeVersion: input.orderVersion } };
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
    const authorized = this.requireSession(session);
    return this.trackAdminRead(authorized, async () => {
      const response = await this.request<{ orders: unknown[] }>("/v1/orders", { method: "GET" }, authorized);
      return response.orders.map(mapOrder);
    });
  }

  async listReconciliation(session?: Session): Promise<import("../../domain/types").ReconciliationItem[]> {
    const authorized = this.requireSession(session);
    return this.trackAdminRead(authorized, async () => {
      const response = await this.request<{ items: Array<{ kind: "SYNC_CONFLICT" | "CONSUMED_NOT_SYNCED" | "CLOSED_NOT_CONSUMED"; operation_id: string; order_id: string; action: string | null; technician_id: string; technician_name: string | null; account_id: string | null; customer_name: string | null; detail: string | null; since: string }> }>("/v1/admin/reconciliation", { method: "GET" }, authorized);
      return response.items.map((item) => ({ kind: item.kind, operationId: item.operation_id, orderId: item.order_id, action: item.action ?? undefined, technicianId: item.technician_id, technicianName: item.technician_name ?? undefined, accountId: item.account_id ?? undefined, customerName: item.customer_name ?? undefined, detail: item.detail ?? undefined, since: item.since }));
    });
  }

  async listAudit(query: { orderId?: string; session?: Session } = {}): Promise<AuditEvent[]> {
    const session = this.requireSession(query.session);
    return this.trackAdminRead(session, async () => {
      const params = new URLSearchParams();
      if (query.orderId) params.set("order_id", query.orderId);
      params.set("limit", "100");
      const all: AuditEvent[] = [];
      let cursor: string | undefined;
      do {
        if (cursor !== undefined) params.set("cursor", cursor);
        else params.delete("cursor");
        const response = await this.request<PilotAuditResponseDto>(`/v1/audit?${params}`, { method: "GET" }, session);
        all.push(...response.audit.map(mapAudit));
        cursor = response.next_cursor ?? undefined;
      } while (cursor !== undefined);
      return all;
    });
  }

  /**
   * Pide autorización de corte. El consumo es `immediate` (D020): `consumeCut` la consume al confirmar el corte.
   * Un rechazo definitivo (`CUT_AUTHORIZATION_REJECTIONS`) o un 401 vuelve como `not_authorized` con su código, para que
   * el caso de uso lo registre como visita bloqueada. Un 5xx o un replay vuelve como `unknown`. Cualquier otro error se relanza.
   */
  async requestCut(input: AuthRequest): Promise<AuthResponse> {
    const session = this.requireActiveSession();
    let response: PilotAuthorizationResponseDto;
    try {
      response = await this.request<PilotAuthorizationResponseDto>("/v1/authorizations/cut", { method: "POST", body: { operation_id: input.operationId, order_id: input.orderId, device_id: input.deviceId, order_version: input.orderVersion } }, session);
    } catch (error) {
      if (!(error instanceof HttpPilotError)) throw error;
      if (error.status === 401 || CUT_AUTHORIZATION_REJECTIONS.has(error.code)) return { operationId: input.operationId, status: "not_authorized", errorCode: error.code };
      if (error.status >= 500 || AUTHORIZATION_REPLAY_CODES.has(error.code)) return { operationId: input.operationId, status: "unknown", errorCode: error.code };
      throw error;
    }
    return { operationId: response.operation_id, status: "authorized", grant: { authorizationId: response.authorization_id, token: response.token, orderId: response.order_id, technicianId: response.technician_id, technicianNameSnapshot: response.technician_name_snapshot, deviceId: response.device_id, operationId: response.operation_id, version: response.version, issuedAt: response.issued_at, expiresAt: response.expires_at, consumption: "immediate" } };
  }

  /** Consume la autorización de corte al confirmar (D020). Mismo tratamiento de errores que `consumeReconnection`. */
  async consumeCut(input: ConsumeRequest): Promise<ConsumeResponse> {
    const session = this.requireActiveSession();
    try {
      const response = await this.request<PilotCutConsumeResponseDto>("/v1/authorizations/cut/consume", { method: "POST", body: {
        authorization_id: input.authorizationId,
        token: input.token,
        order_id: input.orderId,
        technician_id: input.technicianId,
        device_id: input.deviceId,
        operation_id: input.operationId,
        version: input.version,
      }, timeoutMs: CONSUME_TIMEOUT_MS }, session);
      return { operationId: response.operation_id, status: response.status };
    } catch (error) {
      if (error instanceof HttpPilotError && error.status === 409) return { operationId: input.operationId, status: "not_authorized", errorCode: error.code };
      if (error instanceof HttpPilotError && (error.status >= 500 || error.status === 401)) return { operationId: input.operationId, status: "unknown", errorCode: error.code };
      throw error;
    }
  }

  async lookupCutAuthorization(operationId: string): Promise<CutAuthorizationLookupResult> {
    const response = await this.request<PilotCutAuthorizationLookupDto>(`/v1/authorizations/cut/${encodeURIComponent(operationId)}`, { method: "GET" }, this.requireActiveSession());
    return { status: response.status, operationId: response.operation_id };
  }

  async requestReconnection(input: EnablementRequest): Promise<EnablementResponse> {
    const session = this.requireActiveSession();
    try {
      const response = await this.request<PilotReconnectionEnablementResponseDto>("/v1/authorizations/reconnection", { method: "POST", body: {
        operation_id: input.operationId,
        order_id: input.orderId,
        device_id: input.deviceId,
        order_version: input.orderVersion,
      } }, session);
      return {
        operationId: response.operation_id,
        status: "enabled",
        grant: {
          enablementId: response.enablement_id,
          token: response.token,
          orderId: response.order_id,
          technicianId: response.technician_id,
          technicianNameSnapshot: response.technician_name_snapshot,
          deviceId: response.device_id,
          operationId: response.operation_id,
          version: response.version,
          issuedAt: response.issued_at,
          expiresAt: response.expires_at,
        },
      };
    } catch (error) {
      if (error instanceof HttpPilotError && (error.status === 401 || (error.status === 409 && !AUTHORIZATION_REPLAY_CODES.has(error.code)))) return { operationId: input.operationId, status: "not_enabled", errorCode: error.code };
      if (error instanceof HttpPilotError && (error.status >= 500 || AUTHORIZATION_REPLAY_CODES.has(error.code))) return { operationId: input.operationId, status: "unknown", errorCode: error.code };
      throw error;
    }
  }

  async consumeReconnection(input: ConsumeEnablementRequest): Promise<ConsumeEnablementResponse> {
    const session = this.requireActiveSession();
    try {
      const response = await this.request<PilotReconnectionConsumeResponseDto>("/v1/authorizations/reconnection/consume", { method: "POST", body: {
        enablement_id: input.enablementId,
        token: input.token,
        order_id: input.orderId,
        technician_id: input.technicianId,
        device_id: input.deviceId,
        operation_id: input.operationId,
        version: input.version,
      }, timeoutMs: CONSUME_TIMEOUT_MS }, session);
      return { operationId: response.operation_id, status: response.status };
    } catch (error) {
      if (error instanceof HttpPilotError && error.status === 409) return { operationId: input.operationId, status: "not_enabled", errorCode: error.code };
      // 5xx (p. ej. Render despertando detrás de Vercel) no prueba nada; 401 no llegó al consumo. Ambos se verifican después.
      if (error instanceof HttpPilotError && (error.status >= 500 || error.status === 401)) return { operationId: input.operationId, status: "unknown", errorCode: error.code };
      throw error;
    }
  }

  async lookupReconnection(operationId: string): Promise<EnablementLookupResult> {
    const response = await this.request<PilotReconnectionEnablementLookupDto>(`/v1/authorizations/reconnection/${encodeURIComponent(operationId)}`, { method: "GET" }, this.requireActiveSession());
    return { status: response.status, operationId: response.operation_id, errorCode: response.error_code };
  }

  /** Envía una operación; un 409 se devuelve como `conflict` con el cuerpo remoto para conservarlo. */
  async send(payload: SyncPayload, session = this.requireActiveSession()): Promise<SyncTransportResponse> {
    try {
      const response = await this.request<PilotSyncResponseDto>("/v1/sync/operations", { method: "POST", body: toWirePayload(payload) }, session);
      return { status: "acknowledged", operationId: response.operation_id, orderId: response.order_id, technicianId: response.technician_id, technicianNameSnapshot: response.technician_name_snapshot, deviceId: response.device_id, orderVersion: response.order_version, action: response.action, recordedAt: response.recorded_at, effectiveAt: response.effective_at, demora: response.demora, evidenceRefs: response.evidence_refs, fieldCapture: response.field_capture };
    } catch (error) {
      if (error instanceof HttpPilotError && error.status === 409) return { status: "conflict", operationId: payload.operationId, remote: error.body, reason: error.code };
      throw error;
    }
  }

  /** Sube los bytes de una foto (base64) y exige que el recibo devuelva el mismo id y SHA-256. */
  async uploadEvidence(evidence: import("../../domain/types").EvidenceReference): Promise<"verified"> {
    if (!evidence.content || !evidence.contentHash) throw new Error("Se requieren los bytes de la evidencia y su hash SHA-256.");
    const bytes = new Uint8Array(await evidence.content.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const response = await this.request<PilotEvidenceUploadResponseDto>("/v1/evidence/assets", { method: "POST", body: {
      evidence_id: evidence.evidenceId, order_id: evidence.orderId, operation_id: evidence.operationId,
      technician_id: evidence.technicianId, device_id: evidence.deviceId, mime_type: evidence.mimeType,
      content_hash: evidence.contentHash, content_base64: btoa(binary),
    } }, this.requireActiveSession());
    if (response.status !== "verified" || response.evidence_id !== evidence.evidenceId || response.content_hash !== evidence.contentHash) throw new Error("El acuse de la carga de evidencia no coincide con la evidencia local.");
    return "verified";
  }

  /** Consulta una operación. Un `confirmed` con recibo incompleto se degrada a `unknown`: no confirma. */
  async lookup(operationId: string): Promise<RemoteResult> {
    const response = await this.request<PilotLookupResponseDto>(`/v1/sync/operations/${encodeURIComponent(operationId)}`, { method: "GET" }, this.requireActiveSession());
    if (response.status !== "confirmed") return { status: response.status, operationId: response.operation_id, errorCode: response.error_code };
    if (!response.order_id || !response.technician_id || !response.device_id || !response.action || !response.recorded_at || !Array.isArray(response.evidence_refs)) {
      return { status: "unknown", operationId: response.operation_id, errorCode: "LOOKUP_RECEIPT_INCOMPLETE" };
    }
    if (response.action === "RECONNECTION" && (!response.effective_at || !response.technician_name_snapshot || typeof response.demora !== "string")) return { status: "unknown", operationId: response.operation_id, errorCode: "LOOKUP_RECEIPT_INCOMPLETE" };
    return { status: "confirmed", operationId: response.operation_id, orderId: response.order_id, technicianId: response.technician_id, technicianNameSnapshot: response.technician_name_snapshot, deviceId: response.device_id, orderVersion: response.order_version, action: response.action, recordedAt: response.recorded_at, effectiveAt: response.effective_at, demora: response.demora, evidenceRefs: response.evidence_refs, fieldCapture: response.field_capture };
  }

  private requireSession(session?: Session): Session {
    if (!session) throw new Error("Se requiere una sesión autenticada.");
    this.requireActiveSession(session);
    return session;
  }

  /** Registra lecturas de admin en curso para que `switchRole` espere a que terminen. */
  private trackAdminRead<T>(session: Session, read: () => Promise<T>): Promise<T> {
    const operation = read();
    if (session.role !== "ADMIN") return operation;
    const settled = operation.then(() => undefined, () => undefined);
    this.activeAdminReads.add(settled);
    void settled.then(() => this.activeAdminReads.delete(settled));
    return operation;
  }

  private async waitForAdminReads(): Promise<void> {
    while (this.activeAdminReads.size > 0) {
      await Promise.all([...this.activeAdminReads]);
    }
  }

  private requireActiveSession(session = this.activeSession): Session {
    if (!session) throw new Error("La sesión no está disponible.");
    if (!isValidFutureDate(session.expiresAt)) throw new Error("La sesión expiró. Ingrese nuevamente.");
    if (this.activeSession && session.sessionId !== this.activeSession.sessionId) throw new Error("La sesión no está activa en este cliente.");
    return session;
  }

  /** Hace la petición HTTP y traduce fallos de red y respuestas de error (ver descripción del archivo). */
  private async request<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number }, session?: Session): Promise<T> {
    if (this.mode === "offline") throw networkUnknown();
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl + path, { method: init.method, headers, credentials: "include", signal: init.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : undefined, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    } catch {
      throw networkUnknown();
    }
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => undefined) as unknown;
    if (!response.ok) {
      const error = asRecord(body);
      throw new HttpPilotError(response.status, stringOr(error.code, "HTTP_ERROR"), stringOr(error.message, "La solicitud no pudo completarse."), body);
    }
    return body as T;
  }
}

class HttpPilotError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly body: unknown) { super(message); }
}

/** Payload de sync en el formato snake_case del backend. */
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
    effective_at: payload.effectiveAt,
    technician_name_snapshot: payload.technicianNameSnapshot,
    demora: payload.demora,
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
    effectiveAt: record.kind === "VISIT" ? undefined : record.effectiveAt,
    technicianNameSnapshot: record.kind === "VISIT" ? undefined : record.technicianNameSnapshot,
    demora: record.kind === "VISIT" ? undefined : record.demora,
    evidenceRefs: [...record.evidenceRefs],
    orderVersion: visit ? undefined : record.authorizationVersion,
    authorizationId: visit ? undefined : record.authorizationId,
    authorizationToken: visit || record.kind !== "VISIT" && record.action === "RECONNECTION" ? undefined : record.authorizationToken,
    reason: visit ? record.reason : undefined,
    exceptionReason: record.exceptionReason,
    fieldCapture: record.fieldCapture,
  };
}

/** Mapeadores de respuestas del backend a tipos del dominio; campos ausentes quedan ausentes. */
function mapDebtor(value: unknown): DebtorRecord {
  const raw = asRecord(value);
  const debtCents = requiredNonNegativeInteger(raw.debt_cents, "debt_cents");
  const monthsPending = requiredNonNegativeInteger(raw.months_pending, "months_pending");
  return {
    debtorId: stringOr(raw.debtor_id), accountId: stringOr(raw.account_id), supplyId: stringOr(raw.supply_id), customerName: stringOr(raw.customer_name), address: stringOr(raw.address), references: stringOr(raw.references), meterId: stringOr(raw.meter_id), area: stringOr(raw.area), areaName: optionalString(raw.area_name), locality: stringOr(raw.locality), route: stringOr(raw.route), routeName: optionalString(raw.route_name), debtCents, monthsPending, updatedAt: stringOr(raw.updated_at), kardex: mapKardex(raw.kardex), source: dataSource(raw.source), circuit: stringOr(raw.circuit), customerCi: optionalString(raw.customer_ci), contactPhone: optionalString(raw.contact_phone), tariff: optionalString(raw.tariff), supplyStatus: optionalString(raw.supply_status), enablingTitle: optionalString(raw.enabling_title), routeOrder: optionalNumber(raw.route_order), cadastralLatitude: optionalNumber(raw.cadastral_latitude), cadastralLongitude: optionalNumber(raw.cadastral_longitude), meterBrand: optionalString(raw.meter_brand), meterIndex: optionalString(raw.meter_index), meterMultiplier: optionalNumber(raw.meter_multiplier), claims: optionalBoolean(raw.claims), suspensionDate: optionalString(raw.suspension_date), reconnectionManual: optionalBoolean(raw.reconnection_manual), reconnectionDate: optionalString(raw.reconnection_date), reconnectionTechnician: optionalString(raw.reconnection_technician),
  };
}

function mapOrder(value: unknown): WorkOrder {
  const raw = asRecord(value);
  const context = raw.context === undefined ? undefined : mapDebtor(raw.context);
  const orderId = requiredString(raw.order_id, "order_id");
  const status = raw.status === "GENERADO" || raw.status === "EJECUTADO" || raw.status === "RECONEXIÓN" || raw.status === "ANULADO" ? raw.status : undefined;
  const physicalStatus = raw.physical_status === "NONE" || raw.physical_status === "CLAIMED" || raw.physical_status === "CONFIRMED" || raw.physical_status === "PHYSICAL_UNKNOWN" ? raw.physical_status : undefined;
  const version = requiredPositiveInteger(raw.version, "version");
  if (!status || !physicalStatus) throw new Error("REMOTE_ORDER_INVALID");
  return { orderId, assignedTechnicianId: optionalString(raw.assigned_technician_id) ?? "", assignedTechnicianName: optionalString(raw.assigned_technician_name), status, physicalStatus, version, authoritativeVersion: version, purpose: "CUT", debtorId: requiredString(raw.debtor_id, "debtor_id"), accountId: optionalString(raw.account_id), supplyId: optionalString(raw.supply_id), createdBy: requiredString(raw.created_by, "created_by"), createdAt: requiredString(raw.created_at, "created_at"), origin: "SIMULATED", cuc: optionalString(raw.cuc), context };
}

function mapTechnician(value: unknown): TechnicianRecord {
  const raw = asRecord(value);
  if (raw.role !== "TECHNICIAN" || raw.enabled !== true) throw new Error("REMOTE_TECHNICIAN_INVALID");
  return { userId: requiredString(raw.user_id, "user_id"), username: requiredString(raw.username, "username"), displayName: requiredString(raw.display_name, "display_name"), role: "TECHNICIAN", enabled: true, source: dataSource(raw.source) };
}

function mapAudit(value: unknown): AuditEvent {
  const raw = asRecord(value);
  return { auditId: stringOr(raw.audit_id), actorId: stringOr(raw.actor_id), actorRole: raw.actor_role === "ADMIN" || raw.actor_role === "TECHNICIAN" ? raw.actor_role : undefined, action: stringOr(raw.action), entityId: optionalString(raw.entity_id), orderId: optionalString(raw.order_id), operationId: optionalString(raw.operation_id), result: raw.result === "rejected" ? "rejected" : "accepted", reason: optionalString(raw.reason), deviceId: optionalString(raw.device_id), occurredAt: stringOr(raw.occurred_at), transition: asTransition(raw.transition), source: dataSource(raw.source) };
}

function mapKardex(value: unknown): KardexEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const raw = asRecord(entry);
    const entryId = optionalString(raw.entry_id) ?? optionalString(raw.entryId);
    const period = optionalString(raw.period);
    const amountCents = requiredNonNegativeInteger(raw.amount_cents ?? raw.amountCents, "kardex.amount_cents");
    if (!entryId?.trim() || !period?.trim()) throw new Error("REMOTE_FINANCIAL_DATA_INVALID");
    return { entryId, period, amountCents, billingDate: optionalString(raw.billing_date), invoiceOrigin: optionalString(raw.invoice_origin), daysLate: optionalNumber(raw.days_late) };
  });
}

function dataSource(value: unknown): DataSource { return value === "PILOT_PROVISIONAL" ? "PILOT_PROVISIONAL" : "SIMULATED"; }
function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
  return undefined;
}
function optionalBoolean(value: unknown): boolean | undefined { return typeof value === "boolean" ? value : undefined; }
function asTransition(value: unknown): AuditEvent["transition"] { return typeof value === "object" && value !== null ? value as AuditEvent["transition"] : undefined; }

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
function requiredNonNegativeInteger(value: unknown, field: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < 0) throw new Error(`REMOTE_FINANCIAL_DATA_INVALID:${field}`);
  return parsed;
}
function requiredPositiveInteger(value: unknown, field: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < 1) throw new Error(`REMOTE_ORDER_INVALID:${field}`);
  return parsed;
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`REMOTE_ORDER_INVALID:${field}`);
  return value;
}
function isValidFutureDate(value?: string): boolean { const timestamp = value ? Date.parse(value) : Number.NaN; return Number.isFinite(timestamp) && timestamp > Date.now(); }
function errorCode(error: unknown, fallback: string): string { return error instanceof HttpPilotError ? error.code : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : fallback; }
function networkUnknown(): Error { const error = new Error("No se sabe si hay conexión de red."); error.name = "NetworkUnknownError"; Object.defineProperty(error, "code", { value: "NETWORK_UNKNOWN" }); return error; }
