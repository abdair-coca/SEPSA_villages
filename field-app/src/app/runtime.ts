import { IndexedDbAuthorityRepository, IndexedDbLocalRepository } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockEnablementAdapter, MockSyncTransport } from "../adapters/mock";
import type { ActionKind, AppStore, PrepareExternalValidation } from "./store";
import { createAppStore, DEMO_DEVICE_ID, DEMO_PACKAGE_ID, DEMO_TECHNICIAN_ID } from "./store";
import type { AuthorizationAdapter, AuthorizationGrant, AuthRequest, AuthResponse, ConsumeEnablementRequest, ConsumeEnablementResponse, ConsumeRequest, ConsumeResponse, EnablementAdapter, EnablementGrant, EnablementRequest, EnablementResponse, RemoteResult, OperationsAuthorityPort } from "../ports";
import type { WorkOrder, WorkPackage } from "../domain";
import type { Session } from "../domain";
import type { SyncPayload, SyncTransport, SyncTransportResponse } from "../ports";
import { NetworkUnknownError, withRetries } from "../adapters/mock/retry";

export interface DemoValidationAdapters {
  authorization: MockAuthorizationAdapter;
  enablement: MockEnablementAdapter;
}

export function prepareDemoExternalValidation(
  action: Exclude<ActionKind, "VISIT">,
  order: WorkOrder,
  operationId: string,
  now: string,
  adapters: DemoValidationAdapters,
  technicianId = DEMO_TECHNICIAN_ID,
  deviceId = DEMO_DEVICE_ID,
): void {
  const expiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString();
  if (action === "CUT") {
    const grant: AuthorizationGrant = {
      authorizationId: `grant-${operationId}`,
      token: `demo-token-${operationId}`,
      orderId: order.orderId,
      technicianId,
      deviceId,
      operationId,
      version: order.version ?? 0,
      issuedAt: now,
      expiresAt,
    };
    adapters.authorization.requestResponse = { status: "authorized", grant };
  } else {
    const grant: EnablementGrant = {
      enablementId: `enablement-${operationId}`,
      token: `demo-token-${operationId}`,
      orderId: order.orderId,
      technicianId,
      deviceId,
      operationId,
      version: order.version ?? 0,
      issuedAt: now,
      expiresAt,
    };
    adapters.enablement.requestResponse = { status: "enabled", grant };
  }
}

export function createDemoPackage(now = new Date().toISOString()): WorkPackage {
  return createDemoPackageFor(now, DEMO_TECHNICIAN_ID, DEMO_DEVICE_ID);
}

export function createDemoPackageFor(now: string, technicianId: string, deviceId: string): WorkPackage {
  return {
    packageId: `${DEMO_PACKAGE_ID}-${technicianId}`,
    technicianId,
    deviceId,
    version: 1,
    downloadedAt: now,
    orders: [
      demoOrder("ORD-24017", technicianId, "GENERADO", "NONE", 1, "CTA-1001", "SUM-1001", "María Flores", "Villa Esperanza", "MED-1001", 24050, 3),
      demoOrder("ORD-24018", technicianId, "GENERADO", "NONE", 1, "CTA-1002", "SUM-1002", "José Quispe", "San Pedro", "MED-1002", 11800, 2),
      demoOrder("ORD-24019", technicianId, "EJECUTADO", "CONFIRMED", 3, "CTA-1001", "SUM-1001", "María Flores", "Villa Esperanza", "MED-1001", 24050, 3),
      demoOrder("ORD-24020", technicianId, "RECONEXIÓN", "CONFIRMED", 5, "CTA-1002", "SUM-1002", "José Quispe", "San Pedro", "MED-1002", 11800, 2),
    ],
  };
}

export function createDemoAppStore(): AppStore {
  return createDemoAppStoreFor(DEMO_TECHNICIAN_ID, DEMO_DEVICE_ID);
}

export function createDemoAppStoreFor(technicianId: string, deviceId: string): AppStore {
  const connectivity = new MockConnectivity("online");
  const authorization = new MockAuthorizationAdapter({ mode: "online" });
  const enablement = new MockEnablementAdapter({ mode: "online" });
  const transport = new MockSyncTransport({ mode: "online" });
  const repository = new IndexedDbLocalRepository({ technicianId, deviceId });
  const prepareExternalValidation: PrepareExternalValidation = (action, order, operationId, now) => {
    prepareDemoExternalValidation(action, order, operationId, now, { authorization, enablement }, technicianId, deviceId);
  };
  return createAppStore({ repository, authorization, enablement, connectivity, transport, technicianId, deviceId, seedPackage: createDemoPackageFor(new Date().toISOString(), technicianId, deviceId), prepareExternalValidation });
}

export interface AuthenticatedStoreOptions {
  repository?: IndexedDbLocalRepository;
  seedPackage?: WorkPackage;
  transport?: SyncTransport;
  authorization?: AuthorizationAdapter;
}

export function createAuthenticatedTechnicianStore(technicianId: string, deviceId: string, options: AuthenticatedStoreOptions = {}): AppStore {
  const connectivity = new MockConnectivity("online");
  const authorizationDelegate = new MockAuthorizationAdapter({ mode: "online" });
  const enablementDelegate = new MockEnablementAdapter({ mode: "online" });
  const transport = options.transport ?? new MockSyncTransport({ mode: "online" });
  const repository = options.repository ?? new IndexedDbLocalRepository({ technicianId, deviceId });
  const authorityContext = transport instanceof SimulatedAuthoritySyncTransport ? transport.technicalContext() : undefined;
  const authorization: AuthorizationAdapter = options.authorization ?? (authorityContext
    ? new AuthorityBackedAuthorizationAdapter(authorizationDelegate, authorityContext.authority, authorityContext.session)
    : authorizationDelegate);
  const enablement: EnablementAdapter = authorityContext
    ? new AuthorityBackedEnablementAdapter(enablementDelegate, authorityContext.authority, authorityContext.session)
    : enablementDelegate;
  const prepareExternalValidation: PrepareExternalValidation | undefined = authorityContext
    ? (action, order, operationId, now) => prepareDemoExternalValidation(action, order, operationId, now, { authorization: authorizationDelegate, enablement: enablementDelegate }, technicianId, deviceId)
    : undefined;
  return createAppStore({ repository, authorization, enablement, connectivity, transport, technicianId, deviceId, seedPackage: options.seedPackage, prepareExternalValidation });
}

export class SimulatedAuthoritySyncTransport implements SyncTransport {
  private readonly transport = new MockSyncTransport({ mode: "online" });
  private mode: Parameters<MockSyncTransport["setMode"]>[0] = "online";
  private weakAttempts = 0;

  constructor(
    private readonly authority: IndexedDbAuthorityRepository,
    private readonly session: Session,
    private readonly repository: IndexedDbLocalRepository,
  ) {}

  technicalContext(): { authority: OperationsAuthorityPort; session: Session } {
    return { authority: this.authority, session: this.session };
  }

  setMode(mode: Parameters<MockSyncTransport["setMode"]>[0]): void {
    this.mode = mode;
    this.transport.setMode(mode);
  }

  async send(payload: SyncPayload): Promise<SyncTransportResponse> {
    const response = await this.transport.send(payload);
    if (response.status !== "acknowledged") return response;
    if (response.operationId !== payload.operationId) return response;
    try {
      const record = await this.repository.getRecord(payload.operationId);
      if (!record) return authorityConflict(payload.operationId, "LOCAL_RECORD_MISSING", "Authority could not verify local operation.");
      await this.authority.recordSyncedOperation(record, this.session);
    } catch (error) {
      return authorityConflict(payload.operationId, errorCode(error, "AUTHORITY_REJECTED"), error instanceof Error ? error.message : "Authority rejected operation.");
    }
    return response;
  }

  async lookup(operationId: string): Promise<RemoteResult> {
    return withRetries(() => this.lookupAuthority(operationId), { delaysMs: [0, 0], sleep: async () => undefined });
  }

  private async lookupAuthority(operationId: string): Promise<RemoteResult> {
    if (this.mode === "offline" || (this.mode === "weak" && this.weakAttempts++ < 1)) throw new NetworkUnknownError();
    let deviceId: string | undefined;
    try {
      deviceId = (await this.repository.getRecord(operationId))?.deviceId;
      if (!deviceId) deviceId = (await this.repository.loadAssignedPackage()).deviceId;
    } catch {
      return { status: "unknown", operationId, errorCode: "AUTHORITY_LOOKUP_UNKNOWN" };
    }
    if (!deviceId) return { status: "unknown", operationId, errorCode: "DEVICE_ID_REQUIRED" };
    return this.authority.lookupSyncedOperation(operationId, this.session, this.session.userId, deviceId);
  }
}

class AuthorityBackedAuthorizationAdapter implements AuthorizationAdapter {
  constructor(private readonly delegate: MockAuthorizationAdapter, private readonly authority: OperationsAuthorityPort, private readonly session: Session) {}

  setMode(mode: Parameters<MockAuthorizationAdapter["setMode"]>[0]): void {
    this.delegate.setMode(mode);
  }

  async requestCut(input: AuthRequest): Promise<AuthResponse> {
    const check = await this.authorize(input);
    if (check.status !== "authorized") return { operationId: input.operationId, status: check.status, errorCode: check.errorCode };
    return this.delegate.requestCut(input);
  }

  consumeCut(input: ConsumeRequest): Promise<ConsumeResponse> {
    return this.delegate.consumeCut(input);
  }

  lookup(operationId: string): Promise<RemoteResult> {
    return this.delegate.lookup(operationId);
  }

  private authorize(input: AuthRequest) {
    return this.authority.authorizeTechnicalOrder({ operationId: input.operationId, action: "CUT", orderId: input.orderId, technicianId: input.technicianId, deviceId: input.deviceId, orderVersion: input.orderVersion ?? Number.NaN, session: this.session });
  }
}

class AuthorityBackedEnablementAdapter implements EnablementAdapter {
  constructor(private readonly delegate: MockEnablementAdapter, private readonly authority: OperationsAuthorityPort, private readonly session: Session) {}

  setMode(mode: Parameters<MockEnablementAdapter["setMode"]>[0]): void {
    this.delegate.setMode(mode);
  }

  async requestReconnection(input: EnablementRequest): Promise<EnablementResponse> {
    const check = await this.authority.authorizeTechnicalOrder({ operationId: input.operationId, action: "RECONNECTION", orderId: input.orderId, technicianId: input.technicianId, deviceId: input.deviceId, orderVersion: input.orderVersion ?? Number.NaN, session: this.session });
    if (check.status !== "authorized") return { operationId: input.operationId, status: check.status === "not_authorized" ? "not_enabled" : "unknown", errorCode: check.errorCode };
    return this.delegate.requestReconnection(input);
  }

  consumeReconnection(input: ConsumeEnablementRequest): Promise<ConsumeEnablementResponse> {
    return this.delegate.consumeReconnection(input);
  }

  lookup(operationId: string): Promise<RemoteResult> {
    return this.delegate.lookup(operationId);
  }
}

function authorityConflict(operationId: string, code: string, reason: string): SyncTransportResponse {
  return { status: "conflict", operationId, remote: { source: "SIMULATED_AUTHORITY", status: "rejected", errorCode: code }, reason };
}

function errorCode(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : fallback;
}

function demoOrder(orderId: string, technicianId: string, status: WorkOrder["status"], physicalStatus: WorkOrder["physicalStatus"], version: number, accountId: string, supplyId: string, customerName: string, locality: string, meterId: string, debtCents: number, monthsPending: number): WorkOrder {
  return { orderId, assignedTechnicianId: technicianId, status, physicalStatus, version, accountId, supplyId, referenceBalanceCents: debtCents, context: { debtorId: `debtor-${accountId.slice(-4)}`, accountId, supplyId, customerName, address: `${locality}, dirección simulada`, references: "TODO: VALIDAR CON SEPSA", meterId, area: "Valle", locality, route: "TODO: VALIDAR CON SEPSA", debtCents, monthsPending, updatedAt: "2026-09-10T12:00:00.000Z", source: "SIMULATED", kardex: [] } };
}
