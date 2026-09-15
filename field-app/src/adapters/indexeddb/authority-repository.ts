import { DomainError, assertCan, permissionsForRole, type AssignOrderCommand, type AuditEvent, type BatchOrderSkip, type CreateOrderCommand, type CreateOrdersBatchCommand, type CreateOrdersBatchResult, type DebtorQuery, type DebtorRecord, type DemoCredentials, type OperationRecord, type Session, type SimulatedUser, type TechnicianRecord, type VisitRecord, type WorkOrder, type WorkPackage, type WorkPackageEnvelope } from "../../domain";
import type { IdentityPort, OperationsAuthorityPort, TechnicalOrderAuthorizationInput, TechnicalOrderAuthorizationResult } from "../../ports";
import type { RemoteResult } from "../../ports/authorization";
import { createSimulatedPackageEnvelope } from "./package-validation";
import { deleteAuthorityDatabase, openAuthorityDatabase } from "./authority-database";
import { requestResult, transactionComplete } from "./database";

interface StoredUser extends SimulatedUser {
  credentialHash: string;
}

interface StoredOperation {
  operationId: string;
  commandHash: string;
  action: "CREATE_ORDER" | "CREATE_ORDER_BATCH" | "ASSIGN_ORDER" | "SYNC_OPERATION" | "AUTHORIZATION_RESERVATION";
  result?: WorkOrder | CreateOrdersBatchResult;
  operation?: OperationRecord | VisitRecord;
  authorization?: TechnicalAuthorizationReservation;
}

interface TechnicalAuthorizationReservation {
  state: "RESERVED" | "CONSUMED";
  operationId: string;
  action: "CUT" | "RECONNECTION";
  orderId: string;
  technicianId: string;
  deviceId: string;
  orderVersion: number;
}

interface DeviceBinding {
  technicianId: string;
  deviceId: string;
  packageId: string;
  packageVersion?: number;
  boundAt: string;
  ownershipStatus?: "ACTIVE" | "CONFLICT";
  owners?: string[];
  legacyBindings?: Array<{ bindingId?: string; technicianId?: string; deviceId?: string; packageId?: string; boundAt?: string }>;
}

interface AuthorityRepositoryOptions {
  dbName?: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const SIMULATED_CREDENTIALS = {
  admin: { username: "admin.simulated", password: "SIMULATED-admin-003" },
  camila: { username: "camila.simulated", password: "SIMULATED-camila-003" },
  diego: { username: "diego.simulated", password: "SIMULATED-diego-003" },
} as const satisfies Record<string, DemoCredentials>;

export class IndexedDbAuthorityRepository implements IdentityPort, OperationsAuthorityPort {
  readonly dbName: string;
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(options: AuthorityRepositoryOptions = {}) {
    this.dbName = options.dbName ?? "sepsa-demo-authority";
    this.dbPromise = openAuthorityDatabase(this.dbName);
  }

  async close(): Promise<void> {
    (await this.dbPromise).close();
  }

  async deleteDatabase(): Promise<void> {
    await this.close();
    await deleteAuthorityDatabase(this.dbName);
  }

  async seedSimulatedData(additionalDebtors: DebtorRecord[] = []): Promise<void> {
    const db = await this.dbPromise;
    const usersToSeed = await simulatedUsers();
    const transaction = db.transaction(["users", "debtors"], "readwrite");
    const users = transaction.objectStore("users");
    for (const user of usersToSeed) users.put(user);
    const debtors = transaction.objectStore("debtors");
    for (const debtor of [...simulatedDebtors(), ...additionalDebtors]) debtors.put(debtor);
    await transactionComplete(transaction);
  }

  async seedE2eData(): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction("debtors", "readwrite");
    const debtors = transaction.objectStore("debtors");
    for (const debtor of EXTRA_SIMULATED_DEBTORS.map(createExtraSimulatedDebtor)) debtors.put(debtor);
    await transactionComplete(transaction);
  }

  async authenticate(input: DemoCredentials): Promise<Session> {
    await this.ensureSeeded();
    const suppliedHash = await hashCredential(input.password);
    const db = await this.dbPromise;
    const transaction = db.transaction(["users", "sessions", "audit"], "readwrite");
    const users = transaction.objectStore("users");
    const matches = (await requestResult(users.getAll())) as StoredUser[];
    const user = matches.find((candidate) => candidate.username === input.username && candidate.credentialHash === suppliedHash && candidate.enabled);
    const now = new Date().toISOString();
    if (!user) {
      transaction.objectStore("audit").put(auditEvent({ actorId: "anonymous", action: "LOGIN", result: "rejected", reason: "Invalid simulated credentials.", occurredAt: now }));
      await transactionComplete(transaction);
      throw new DomainError("Invalid simulated credentials.", "AUTHENTICATION_FAILED");
    }
    const session: Session = {
      sessionId: secureUuid("session"),
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: permissionsForRole(user.role),
      issuedAt: now,
      authenticity: "SIMULATED",
      expiresAt: new Date(Date.parse(now) + SESSION_TTL_MS).toISOString(),
    };
    transaction.objectStore("sessions").put(session);
    transaction.objectStore("audit").put(auditEvent({ actorId: user.userId, actorRole: user.role, action: "LOGIN", result: "accepted", occurredAt: now }));
    await transactionComplete(transaction);
    return session;
  }

  async authorize(session: Session, action: Parameters<typeof assertCan>[1]): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["sessions", "audit"], "readwrite");
    const stored = await requestResult(transaction.objectStore("sessions").get(session.sessionId)) as Session | undefined;
    try {
      if (!stored || !sameSession(stored, session)) throw new DomainError("Session is not valid.", "AUTHENTICATION_FAILED");
      if (!stored.expiresAt || Date.parse(stored.expiresAt) <= Date.now()) throw new DomainError("La sesión expiró. Ingrese nuevamente.", "AUTHENTICATION_EXPIRED");
      assertCan(stored, action);
    } catch (error) {
      transaction.objectStore("audit").put(auditEvent({ actorId: session.userId || "anonymous", actorRole: session.role, action, result: "rejected", reason: error instanceof Error ? error.message : "Access denied.", occurredAt: new Date().toISOString() }));
      await transactionComplete(transaction);
      throw error;
    }
    await transactionComplete(transaction);
  }

  async findDebtors(query: DebtorQuery): Promise<DebtorRecord[]> {
    const session = await this.requireAction(query.session, "FIND_DEBTORS");
    const db = await this.dbPromise;
    const transaction = db.transaction(["debtors", "audit"], "readwrite");
    const records = (await requestResult(transaction.objectStore("debtors").getAll())) as DebtorRecord[];
    const normalized = normalizeSearchValue(query.query);
    const result = records.filter((debtor) => {
      const textMatch = !normalized || searchableDebtorValues(debtor).some((value) => normalizeSearchValue(value).includes(normalized));
      return textMatch && matchesOptional(debtor.area, query.area) && matchesOptional(debtor.locality, query.locality) && matchesOptional(debtor.route, query.route)
        && (query.minMonthsPending === undefined || debtor.monthsPending >= query.minMonthsPending)
        && matchesOptional(debtor.supplyStatus ?? "", query.supplyStatus);
    }).map((debtor) => structuredClone(debtor));
    transaction.objectStore("audit").put(auditEvent({ actorId: session.userId, actorRole: session.role, action: "FIND_DEBTORS", result: "accepted", occurredAt: new Date().toISOString() }));
    await transactionComplete(transaction);
    return result;
  }

  async listTechnicians(session: Session): Promise<TechnicianRecord[]> {
    const authorized = await this.requireAction(session, "VIEW_TECHNICIANS");
    const db = await this.dbPromise;
    const transaction = db.transaction(["users", "audit"], "readwrite");
    const users = (await requestResult(transaction.objectStore("users").getAll())) as StoredUser[];
    const technicians = users
      .filter((user) => user.role === "TECHNICIAN" && user.enabled)
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "es") || left.username.localeCompare(right.username, "es"))
      .map(({ userId, username, displayName, enabled, source }) => ({ userId, username, displayName, role: "TECHNICIAN" as const, enabled, source }));
    transaction.objectStore("audit").put(auditEvent({ actorId: authorized.userId, actorRole: authorized.role, action: "VIEW_TECHNICIANS", result: "accepted", occurredAt: new Date().toISOString() }));
    await transactionComplete(transaction);
    return technicians.map((technician) => structuredClone(technician));
  }

  async createOrder(input: CreateOrderCommand): Promise<WorkOrder> {
    const session = await this.requireAction(input.session, "CREATE_ORDER");
    const db = await this.dbPromise;
    const transaction = db.transaction(["debtors", "orders", "operations", "audit"], "readwrite");
    const operationStore = transaction.objectStore("operations");
    const hash = commandHash({ operationId: input.operationId, debtorId: input.debtorId, purpose: input.purpose });
    const prior = await requestResult(operationStore.get(input.operationId)) as StoredOperation | undefined;
    if (prior) {
      transaction.abort();
      if (prior.action !== "CREATE_ORDER" || prior.commandHash !== hash) throw new DomainError("Operation identifier was reused with different data.", "IDEMPOTENCY_CONFLICT");
      if (!prior.result || !isWorkOrderResult(prior.result)) throw new DomainError("Stored create result is invalid.", "IDEMPOTENCY_CONFLICT");
      return structuredClone(prior.result);
    }
    const debtor = await requestResult(transaction.objectStore("debtors").get(input.debtorId)) as DebtorRecord | undefined;
    if (!debtor || !debtor.supplyId.trim()) {
      transaction.abort();
      throw new DomainError("A confirmed supply identifier is required.", "SUPPLY_ID_REQUIRED");
    }
    const orders = (await requestResult(transaction.objectStore("orders").getAll())) as WorkOrder[];
    const existing = orders.find((order) => order.accountId === debtor.accountId && order.purpose === input.purpose && order.status !== "ANULADO");
    if (existing) {
      transaction.abort();
      throw new DomainError(`An active order already exists: ${existing.orderId}.`, "ACTIVE_ORDER_EXISTS");
    }
    const now = new Date().toISOString();
    const order: WorkOrder = {
      orderId: secureUuid("order"),
      cuc: secureUuid("cuc"),
      assignedTechnicianId: "",
      status: "GENERADO",
      physicalStatus: "NONE",
      version: 1,
      purpose: input.purpose,
      debtorId: debtor.debtorId,
      accountId: debtor.accountId,
      supplyId: debtor.supplyId,
      referenceBalanceCents: debtor.debtCents,
      createdBy: session.userId,
      createdAt: now,
      origin: "SIMULATED",
      context: structuredClone(debtor),
    };
    transaction.objectStore("orders").put(order);
    operationStore.put({ operationId: input.operationId, commandHash: hash, action: "CREATE_ORDER", result: order } satisfies StoredOperation);
    transaction.objectStore("audit").put(auditEvent({ actorId: session.userId, actorRole: session.role, action: "CREATE_ORDER", entityId: order.orderId, orderId: order.orderId, operationId: input.operationId, result: "accepted", occurredAt: now }));
    await transactionComplete(transaction);
    return structuredClone(order);
  }

  async createOrdersBatch(input: CreateOrdersBatchCommand): Promise<CreateOrdersBatchResult> {
    const session = await this.requireAction(input.session, "CREATE_ORDER");
    const debtorIds = [...new Set(input.debtorIds.map((debtorId) => debtorId.trim()).filter(Boolean))];
    if (!input.batchId.trim() || !debtorIds.length) throw new DomainError("A batch identifier and at least one debtor are required.", "BATCH_REQUEST_INVALID");
    const db = await this.dbPromise;
    const transaction = db.transaction(["debtors", "orders", "operations", "audit"], "readwrite");
    const operationStore = transaction.objectStore("operations");
    const hash = commandHash({ batchId: input.batchId, debtorIds, purpose: input.purpose });
    const prior = await requestResult(operationStore.get(input.batchId)) as StoredOperation | undefined;
    if (prior) {
      transaction.abort();
      if (prior.action !== "CREATE_ORDER_BATCH" || prior.commandHash !== hash || !prior.result || !isBatchResult(prior.result)) throw new DomainError("Operation identifier was reused with different data.", "IDEMPOTENCY_CONFLICT");
      return structuredClone(prior.result);
    }
    const debtors = (await requestResult(transaction.objectStore("debtors").getAll())) as DebtorRecord[];
    const orders = (await requestResult(transaction.objectStore("orders").getAll())) as WorkOrder[];
    const debtorById = new Map(debtors.map((debtor) => [debtor.debtorId, debtor]));
    const created: WorkOrder[] = [];
    const skipped: BatchOrderSkip[] = [];
    const now = new Date().toISOString();
    for (const debtorId of debtorIds) {
      const debtor = debtorById.get(debtorId);
      if (!debtor) { skipped.push({ debtorId, reason: "DEBTOR_NOT_FOUND", message: "Suministro no encontrado." }); continue; }
      if (!debtor.supplyId.trim()) { skipped.push({ debtorId, reason: "SUPPLY_ID_REQUIRED", message: "Suministro sin identificador confirmado." }); continue; }
      if (orders.some((order) => order.accountId === debtor.accountId && order.purpose === input.purpose && order.status !== "ANULADO")) {
        skipped.push({ debtorId, reason: "ACTIVE_ORDER_EXISTS", message: "Ya existe una orden activa para esta cuenta." });
        continue;
      }
      const order: WorkOrder = { orderId: secureUuid("order"), cuc: secureUuid("cuc"), assignedTechnicianId: "", status: "GENERADO", physicalStatus: "NONE", version: 1, purpose: input.purpose, debtorId: debtor.debtorId, accountId: debtor.accountId, supplyId: debtor.supplyId, referenceBalanceCents: debtor.debtCents, createdBy: session.userId, createdAt: now, origin: "SIMULATED", context: structuredClone(debtor) };
      orders.push(order);
      created.push(order);
      transaction.objectStore("orders").put(order);
      transaction.objectStore("audit").put(auditEvent({ actorId: session.userId, actorRole: session.role, action: "CREATE_ORDER", entityId: order.orderId, orderId: order.orderId, operationId: `${input.batchId}:${debtorId}`, result: "accepted", occurredAt: now }));
    }
    const result: CreateOrdersBatchResult = { batchId: input.batchId, requestedDebtorIds: debtorIds, created, skipped };
    operationStore.put({ operationId: input.batchId, commandHash: hash, action: "CREATE_ORDER_BATCH", result } satisfies StoredOperation);
    transaction.objectStore("audit").put(auditEvent({ actorId: session.userId, actorRole: session.role, action: "CREATE_ORDER_BATCH", entityId: input.batchId, operationId: input.batchId, result: "accepted", occurredAt: now }));
    await transactionComplete(transaction);
    return structuredClone(result);
  }

  async assignOrder(input: AssignOrderCommand): Promise<WorkOrder> {
    const session = await this.requireAction(input.session, "ASSIGN_ORDER");
    if (!Number.isFinite(input.expectedOrderVersion)) throw new DomainError("Expected order version is required.", "ORDER_VERSION_REQUIRED");
    const db = await this.dbPromise;
    const transaction = db.transaction(["users", "orders", "operations", "audit"], "readwrite");
    const operationStore = transaction.objectStore("operations");
    const hash = commandHash({ operationId: input.operationId, orderId: input.orderId, technicianId: input.technicianId, expectedOrderVersion: input.expectedOrderVersion });
    const prior = await requestResult(operationStore.get(input.operationId)) as StoredOperation | undefined;
    if (prior) {
      transaction.abort();
      if (prior.action !== "ASSIGN_ORDER" || prior.commandHash !== hash) throw new DomainError("Operation identifier was reused with different data.", "IDEMPOTENCY_CONFLICT");
      if (!prior.result || !isWorkOrderResult(prior.result)) throw new DomainError("Stored assignment result is invalid.", "IDEMPOTENCY_CONFLICT");
      return structuredClone(prior.result);
    }
    const technician = await requestResult(transaction.objectStore("users").get(input.technicianId)) as StoredUser | undefined;
    if (!technician || technician.role !== "TECHNICIAN" || !technician.enabled) {
      transaction.abort();
      throw new DomainError("A habilitated technician is required.", "TECHNICIAN_REQUIRED");
    }
    const current = await requestResult(transaction.objectStore("orders").get(input.orderId)) as WorkOrder | undefined;
    if (!current) {
      transaction.abort();
      throw new DomainError("Order does not exist.", "ORDER_NOT_FOUND");
    }
    if (current.version !== input.expectedOrderVersion) {
      transaction.abort();
      throw new DomainError("Order version is obsolete.", "ORDER_VERSION_CONFLICT");
    }
    if (current.status !== "GENERADO") {
      transaction.abort();
      throw new DomainError("Only generated orders can be assigned.", "ORDER_STATUS_INVALID");
    }
    if (current.assignedTechnicianId === technician.userId) {
      transaction.abort();
      throw new DomainError("Order is already assigned to this technician.", "ORDER_ALREADY_ASSIGNED");
    }
    const now = new Date().toISOString();
    const assigned: WorkOrder = { ...current, assignedTechnicianId: technician.userId, assignedTechnicianName: technician.displayName, version: input.expectedOrderVersion + 1 };
    transaction.objectStore("orders").put(assigned);
    operationStore.put({ operationId: input.operationId, commandHash: hash, action: "ASSIGN_ORDER", result: assigned } satisfies StoredOperation);
    transaction.objectStore("audit").put(auditEvent({ actorId: session.userId, actorRole: session.role, action: "ASSIGN_ORDER", entityId: assigned.orderId, orderId: assigned.orderId, operationId: input.operationId, result: "accepted", occurredAt: now, transition: { before: { assignedTechnicianId: current.assignedTechnicianId, version: input.expectedOrderVersion }, after: { assignedTechnicianId: assigned.assignedTechnicianId, version: assigned.version ?? input.expectedOrderVersion + 1 } } }));
    await transactionComplete(transaction);
    return structuredClone(assigned);
  }

  async listOrders(session: Session): Promise<WorkOrder[]> {
    const authorized = await this.requireAction(session, "VIEW_ORDERS");
    const db = await this.dbPromise;
    const transaction = db.transaction(["orders", "audit"], "readwrite");
    const orders = (await requestResult(transaction.objectStore("orders").getAll())) as WorkOrder[];
    transaction.objectStore("audit").put(auditEvent({
      actorId: authorized.userId,
      actorRole: authorized.role,
      action: "VIEW_ORDERS",
      result: "accepted",
      occurredAt: new Date().toISOString(),
    }));
    await transactionComplete(transaction);
    return orders.map((order) => structuredClone(order));
  }

  async downloadAssigned(technicianId: string, deviceId: string, session?: Session): Promise<WorkPackageEnvelope> {
    const authorized = await this.requireAction(session, "DOWNLOAD_ASSIGNED");
    if (authorized.userId !== technicianId) throw new DomainError("Technician identity does not match session.", "ORDER_NOT_ASSIGNED");
    if (!deviceId.trim()) throw new DomainError("Device identifier is required.", "DEVICE_ID_REQUIRED");
    const db = await this.dbPromise;
    const transaction = db.transaction(["orders", "debtors", "audit", "device-bindings"], "readwrite");
    const bindingStore = transaction.objectStore("device-bindings");
    const currentBinding = await requestResult(bindingStore.get(deviceId)) as DeviceBinding | undefined;
    if (currentBinding && (currentBinding.ownershipStatus === "CONFLICT" || currentBinding.technicianId !== technicianId)) {
      const error = new DomainError("Device is already owned by another technician.", "DEVICE_OWNERSHIP_CONFLICT");
      transaction.objectStore("audit").put(auditEvent({ actorId: authorized.userId, actorRole: authorized.role, action: "DOWNLOAD_ASSIGNED", deviceId, result: "rejected", reason: error.message, occurredAt: new Date().toISOString() }));
      await transactionComplete(transaction);
      throw error;
    }
    const orders = (await requestResult(transaction.objectStore("orders").getAll())) as WorkOrder[];
    const debtors = (await requestResult(transaction.objectStore("debtors").getAll())) as DebtorRecord[];
    const debtorById = new Map(debtors.map((debtor) => [debtor.debtorId, debtor]));
    const assignedOrders = orders.filter((order) => order.assignedTechnicianId === technicianId).map((order) => ({
      ...structuredClone(order),
      context: order.debtorId ? structuredClone(debtorById.get(order.debtorId)) : order.context,
    }));
    const previousPackageVersion = currentBinding?.packageVersion;
    const version = typeof previousPackageVersion === "number" && Number.isFinite(previousPackageVersion) ? Math.max(0, previousPackageVersion) + 1 : 1;
    const workPackage: WorkPackage = { packageId: `package-${technicianId}-${deviceId}`, technicianId, deviceId, version, downloadedAt: new Date().toISOString(), orders: assignedOrders };
    const envelope = createSimulatedPackageEnvelope(workPackage);
    bindingStore.put({ technicianId, deviceId, packageId: workPackage.packageId, packageVersion: workPackage.version, boundAt: workPackage.downloadedAt, ownershipStatus: "ACTIVE", owners: [technicianId], legacyBindings: [{ technicianId, deviceId, packageId: workPackage.packageId, boundAt: workPackage.downloadedAt }] } satisfies DeviceBinding);
    transaction.objectStore("audit").put(auditEvent({ actorId: authorized.userId, actorRole: authorized.role, action: "DOWNLOAD_ASSIGNED", deviceId, result: "accepted", occurredAt: workPackage.downloadedAt }));
    await transactionComplete(transaction);
    return envelope;
  }

  async recordSyncedOperation(operation: OperationRecord | VisitRecord, session: Session): Promise<void> {
    const authorized = await this.requireAction(session, "SYNC_OPERATION");
    if (operation.technicianId !== authorized.userId || !operation.deviceId.trim()) {
      const error = new DomainError("Operation identity does not match technician session.", "ORDER_NOT_ASSIGNED");
      await this.recordRejectedAudit(authorized, operation, error);
      throw error;
    }
    const db = await this.dbPromise;
    const transaction = db.transaction(["orders", "operations", "audit", "device-bindings"], "readwrite");
    const operationStore = transaction.objectStore("operations");
    const hash = commandHash(operation);
    const prior = await requestResult(operationStore.get(operation.operationId)) as StoredOperation | undefined;
    if (prior) {
      if (prior.action === "SYNC_OPERATION" && prior.commandHash === hash) {
        transaction.abort();
        return;
      }
      const canConsumeReservation = prior.action === "AUTHORIZATION_RESERVATION" && operation.kind !== "VISIT" && operation.status === "CONFIRMED" && operation.physicalStatus === "CONFIRMED";
      if (!canConsumeReservation) {
        transaction.abort();
        const error = new DomainError("Operation identifier was reused with different data.", "IDEMPOTENCY_CONFLICT");
        await transactionComplete(transaction).catch(() => undefined);
        await this.recordRejectedAudit(authorized, operation, error);
        throw error;
      }
    }
    const order = await requestResult(transaction.objectStore("orders").get(operation.orderId)) as WorkOrder | undefined;
    if (!order || order.assignedTechnicianId !== authorized.userId) {
      transaction.abort();
      const error = new DomainError("Operation order is not assigned to this technician.", "ORDER_NOT_ASSIGNED");
      await transactionComplete(transaction).catch(() => undefined);
      await this.recordRejectedAudit(authorized, operation, error);
      throw error;
    }
    const binding = await requestResult(transaction.objectStore("device-bindings").get(operation.deviceId)) as DeviceBinding | undefined;
    if (!binding || binding.ownershipStatus === "CONFLICT" || binding.technicianId !== authorized.userId) {
      transaction.abort();
      const error = new DomainError(
        binding ? "Device ownership is blocked pending online reprovisioning." : "Device has no valid technical package binding.",
        binding ? "DEVICE_OWNERSHIP_CONFLICT" : "DEVICE_NOT_PROVISIONED",
      );
      await transactionComplete(transaction).catch(() => undefined);
      await this.recordRejectedAudit(authorized, operation, error);
      throw error;
    }
    const requiresAuthorization = operation.kind !== "VISIT" && operation.status === "CONFIRMED" && operation.physicalStatus === "CONFIRMED";
    const reservation = requiresAuthorization ? prior?.authorization : undefined;
    if (requiresAuthorization && (!reservation || reservation.state !== "RESERVED" || reservation.action !== operation.action || reservation.operationId !== operation.operationId || reservation.orderId !== operation.orderId || reservation.technicianId !== authorized.userId || reservation.deviceId !== operation.deviceId)) {
      transaction.abort();
      const error = new DomainError("A current technical authorization is required for confirmed physical operations.", "AUTHORIZATION_REQUIRED");
      await transactionComplete(transaction).catch(() => undefined);
      await this.recordRejectedAudit(authorized, operation, error);
      throw error;
    }
    if (requiresAuthorization && reservation && order.version !== reservation.orderVersion) {
      transaction.abort();
      const error = new DomainError("Order version is obsolete for this technical authorization.", "ORDER_VERSION_CONFLICT");
      await transactionComplete(transaction).catch(() => undefined);
      await this.recordRejectedAudit(authorized, operation, error);
      throw error;
    }
    if (requiresAuthorization && (order.status !== "GENERADO" || order.physicalStatus !== "NONE")) {
      transaction.abort();
      const error = new DomainError("Order is no longer eligible for this technical authorization.", "ORDER_STATE_INVALID");
      await transactionComplete(transaction).catch(() => undefined);
      await this.recordRejectedAudit(authorized, operation, error);
      throw error;
    }
    operationStore.put({
      operationId: operation.operationId,
      commandHash: hash,
      action: "SYNC_OPERATION",
      operation: structuredClone(operation),
      authorization: reservation ? { ...reservation, state: "CONSUMED" } : undefined,
    } satisfies StoredOperation);
    if (operation.kind !== "VISIT") {
      const nextStatus = operation.status === "CONFIRMED"
        ? operation.action === "CUT" ? "EJECUTADO" : "RECONEXIÓN"
        : order.status;
      const changed = order.status !== nextStatus || order.physicalStatus !== operation.physicalStatus;
      if (changed) {
        transaction.objectStore("orders").put({
          ...order,
          status: nextStatus,
          physicalStatus: operation.physicalStatus,
          version: (order.version ?? 0) + 1,
        } satisfies WorkOrder);
      }
    }
    transaction.objectStore("audit").put(auditEvent({ actorId: authorized.userId, actorRole: authorized.role, action: "SYNC_OPERATION", orderId: operation.orderId, operationId: operation.operationId, deviceId: operation.deviceId, result: "accepted", occurredAt: "updatedAt" in operation ? operation.updatedAt : operation.recordedAt }));
    await transactionComplete(transaction);
  }

  async authorizeTechnicalOrder(input: TechnicalOrderAuthorizationInput): Promise<TechnicalOrderAuthorizationResult> {
    if (!Number.isFinite(input.orderVersion)) return { status: "not_authorized", errorCode: "ORDER_VERSION_REQUIRED" };
    if (!input.deviceId.trim()) return { status: "not_authorized", errorCode: "DEVICE_ID_REQUIRED" };
    if (input.session.userId !== input.technicianId) return { status: "not_authorized", errorCode: "ORDER_NOT_ASSIGNED" };
      const operationId = input.operationId.trim();
    if (!operationId) return { status: "not_authorized", errorCode: "OPERATION_ID_REQUIRED" };

    try {
      await this.authorize(input.session, "DOWNLOAD_ASSIGNED");
    } catch (error) {
      return { status: "not_authorized", errorCode: errorCode(error, "AUTHENTICATION_FAILED") };
    }

    try {
      const db = await this.dbPromise;
      const transaction = db.transaction(["orders", "operations", "device-bindings", "audit"], "readwrite");
      const order = await requestResult(transaction.objectStore("orders").get(input.orderId)) as WorkOrder | undefined;
      const prior = await requestResult(transaction.objectStore("operations").get(operationId)) as StoredOperation | undefined;
      const binding = await requestResult(transaction.objectStore("device-bindings").get(input.deviceId)) as DeviceBinding | undefined;
      const action = input.action ?? "CUT";
      const reason = !order
        ? { errorCode: "ORDER_NOT_FOUND", message: "Order does not exist." }
        : order.assignedTechnicianId !== input.technicianId
          ? { errorCode: "ORDER_NOT_ASSIGNED", message: "Order is not assigned to this technician." }
          : order.version !== input.orderVersion
            ? { errorCode: "ORDER_VERSION_CONFLICT", message: "Order version is obsolete." }
          : !binding || binding.ownershipStatus === "CONFLICT" || binding.technicianId !== input.technicianId
               ? { errorCode: "DEVICE_OWNERSHIP_CONFLICT", message: "Device is not currently bound to this technician." }
               : action === "CUT" && (order.status !== "GENERADO" || order.physicalStatus !== "NONE")
                 ? { errorCode: "ORDER_STATE_INVALID", message: "Order is not eligible for a cut authorization." }
                 : action === "RECONNECTION" && (order.status !== "EJECUTADO" || order.physicalStatus !== "CONFIRMED")
                   ? { errorCode: "ORDER_STATE_INVALID", message: "Order is not eligible for a reconnection authorization." }
               : undefined;

      if (reason) {
        transaction.objectStore("audit").put(auditEvent({ actorId: input.session.userId, actorRole: input.session.role, action: "TECHNICAL_AUTHORIZATION", orderId: input.orderId, deviceId: input.deviceId, result: "rejected", reason: reason.message, occurredAt: new Date().toISOString() }));
        await transactionComplete(transaction);
         return { status: "not_authorized", errorCode: reason.errorCode, order };
       }

       if (prior) {
         const existing = prior.authorization;
          if (prior.action !== "AUTHORIZATION_RESERVATION" || !existing || existing.state !== "RESERVED" || existing.action !== action || existing.operationId !== operationId || existing.orderId !== input.orderId || existing.technicianId !== input.technicianId || existing.deviceId !== input.deviceId || existing.orderVersion !== input.orderVersion) {
           transaction.abort();
           const error = new DomainError("Operation identifier was reused with different authorization data.", "IDEMPOTENCY_CONFLICT");
           await transactionComplete(transaction).catch(() => undefined);
           return { status: "not_authorized", errorCode: error.code, order };
         }
       } else {
         transaction.objectStore("operations").put({
           operationId,
            commandHash: commandHash({ operationId, action, orderId: input.orderId, technicianId: input.technicianId, deviceId: input.deviceId, orderVersion: input.orderVersion }),
           action: "AUTHORIZATION_RESERVATION",
            authorization: { state: "RESERVED", operationId, action, orderId: input.orderId, technicianId: input.technicianId, deviceId: input.deviceId, orderVersion: input.orderVersion },
         } satisfies StoredOperation);
       }

       transaction.objectStore("audit").put(auditEvent({ actorId: input.session.userId, actorRole: input.session.role, action: "TECHNICAL_AUTHORIZATION", orderId: input.orderId, deviceId: input.deviceId, result: "accepted", occurredAt: new Date().toISOString() }));
      await transactionComplete(transaction);
      return { status: "authorized", order: structuredClone(order as WorkOrder) };
    } catch (error) {
      return { status: "unknown", errorCode: errorCode(error, "AUTHORITY_LOOKUP_UNKNOWN") };
    }
  }

  async lookupSyncedOperation(operationId: string, session: Session, technicianId: string, deviceId: string): Promise<RemoteResult> {
    const preserved = { operationId };
    if (!operationId.trim() || !deviceId.trim() || session.userId !== technicianId) return { status: "unknown", ...preserved, errorCode: "AUTHENTICATION_FAILED" };
    try {
      await this.authorize(session, "SYNC_OPERATION");
      const db = await this.dbPromise;
      const transaction = db.transaction("operations", "readonly");
      const stored = await requestResult(transaction.objectStore("operations").get(operationId)) as StoredOperation | undefined;
      await transactionComplete(transaction);
      if (!stored || stored.action !== "SYNC_OPERATION" || !stored.operation || stored.operation.technicianId !== technicianId || stored.operation.deviceId !== deviceId) {
        return { status: "not_found", ...preserved };
      }
      return { status: "confirmed", ...preserved };
    } catch (error) {
      return { status: "unknown", ...preserved, errorCode: errorCode(error, "AUTHORITY_LOOKUP_UNKNOWN") };
    }
  }

  async listAudit(query: { orderId?: string; includeRejected?: boolean; session?: Session } = {}): Promise<AuditEvent[]> {
    const session = await this.requireAction(query.session, "VIEW_AUDIT");
    const db = await this.dbPromise;
    const transaction = db.transaction("audit", "readonly");
    const events = (await requestResult(transaction.objectStore("audit").getAll())) as AuditEvent[];
    await transactionComplete(transaction);
    return events.filter((event) => (!query.orderId || event.orderId === query.orderId) && (query.includeRejected !== false || event.result === "accepted")).map((event) => structuredClone(event));
  }

  private async recordRejectedAudit(session: Session, operation: OperationRecord | VisitRecord, error: DomainError): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction("audit", "readwrite");
    transaction.objectStore("audit").put(auditEvent({ actorId: session.userId, actorRole: session.role, action: "SYNC_OPERATION", orderId: operation.orderId, operationId: operation.operationId, deviceId: operation.deviceId, result: "rejected", reason: error.message, occurredAt: "updatedAt" in operation ? operation.updatedAt : operation.recordedAt }));
    await transactionComplete(transaction);
  }

  private async requireAction(session: Session | undefined, action: Parameters<typeof assertCan>[1]): Promise<Session> {
    if (!session) throw new DomainError("An authenticated session is required.", "AUTHENTICATION_REQUIRED");
    await this.authorize(session, action);
    return session;
  }

  private async ensureSeeded(): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction("users", "readonly");
    const users = await requestResult(transaction.objectStore("users").getAll());
    await transactionComplete(transaction);
    const records = users as Array<StoredUser & { password?: string }>;
    if (records.length === 0) {
      await this.seedSimulatedData();
      return;
    }
    if (records.some((user) => typeof user.password === "string" || typeof user.credentialHash !== "string")) {
      const credentialsByUsername = new Map<string, string>(Object.values(SIMULATED_CREDENTIALS).map((credential) => [credential.username, credential.password]));
      const migrated = await Promise.all(records.map(async (user) => {
        const password = user.password ?? credentialsByUsername.get(user.username);
        const { password: _plaintext, ...withoutPlaintext } = user;
        return password ? { ...withoutPlaintext, credentialHash: await hashCredential(password) } : undefined;
      }));
      const write = db.transaction("users", "readwrite");
      const store = write.objectStore("users");
      for (let index = 0; index < records.length; index += 1) {
        if (migrated[index]) store.put(migrated[index]);
        else store.delete(records[index].userId);
      }
      await transactionComplete(write);
    }
  }
}

export { deleteAuthorityDatabase };

async function simulatedUsers(): Promise<StoredUser[]> {
  const credentials = SIMULATED_CREDENTIALS;
  return [
    { userId: "admin-simulated", username: credentials.admin.username, credentialHash: await hashCredential(credentials.admin.password), displayName: "Administración SIMULATED", role: "ADMIN", enabled: true, source: "SIMULATED" },
    { userId: "tech-camila", username: credentials.camila.username, credentialHash: await hashCredential(credentials.camila.password), displayName: "Camila Rojas (SIMULATED)", role: "TECHNICIAN", enabled: true, source: "SIMULATED" },
    { userId: "tech-diego", username: credentials.diego.username, credentialHash: await hashCredential(credentials.diego.password), displayName: "Diego Vargas (SIMULATED)", role: "TECHNICIAN", enabled: true, source: "SIMULATED" },
  ];
}

function simulatedDebtors(): DebtorRecord[] {
  return [
    { debtorId: "debtor-1001", accountId: "CTA-1001", supplyId: "SUM-1001", customerName: "María Flores", address: "Av. Petrolera 145, Villa Esperanza", references: "Frente a unidad educativa", meterId: "MED-1001", area: "B", locality: "002 - MOJOTORILLO", route: "002", circuit: "D-1182", tariff: "RS", supplyStatus: "A", enablingTitle: "R", routeOrder: 129, meterBrand: "WASION", meterIndex: "MED-1001", meterMultiplier: 1, cadastralLatitude: -19.589366, cadastralLongitude: -65.259119, claims: false, paymentPlan: false, suspensionDate: "2026-08-27T00:00:00.000Z", debtCents: 24050, monthsPending: 3, updatedAt: "2026-09-10T12:00:00.000Z", source: "SIMULATED", kardex: [{ entryId: "k-1001-1", period: "2026-07", amountCents: 8017, status: "PENDING", billingDate: "2026-07-27", invoiceOrigin: "FA_FACTURAS", daysLate: 63 }, { entryId: "k-1001-2", period: "2026-08", amountCents: 8017, status: "PENDING", billingDate: "2026-08-27", invoiceOrigin: "FA_FACTURAS", daysLate: 31 }, { entryId: "k-1001-3", period: "2026-09", amountCents: 8016, status: "PENDING", billingDate: "2026-09-10", invoiceOrigin: "FA_FACTURAS", daysLate: 2 }] },
    { debtorId: "debtor-1002", accountId: "CTA-1002", supplyId: "SUM-1002", customerName: "José Quispe", address: "Calle Los Álamos 22, San Pedro", references: "A dos cuadras del mercado", meterId: "MED-1002", area: "B", locality: "002 - MOJOTORILLO", route: "002", circuit: "D-1182", tariff: "RS", supplyStatus: "A", enablingTitle: "R", routeOrder: 132, meterBrand: "WASION", meterIndex: "MED-1002", meterMultiplier: 1, cadastralLatitude: -19.588912, cadastralLongitude: -65.258647, claims: false, paymentPlan: false, suspensionDate: "2026-08-27T00:00:00.000Z", debtCents: 11800, monthsPending: 2, updatedAt: "2026-09-10T12:00:00.000Z", source: "SIMULATED", kardex: [{ entryId: "k-1002-1", period: "2026-08", amountCents: 5900, status: "PENDING", billingDate: "2026-08-27", invoiceOrigin: "FA_FACTURAS", daysLate: 31 }, { entryId: "k-1002-2", period: "2026-09", amountCents: 5900, status: "PENDING", billingDate: "2026-09-10", invoiceOrigin: "FA_FACTURAS", daysLate: 2 }] },
  ];
}

interface ExtraSimulatedDebtorSeed {
  code: string;
  name: string;
  address: string;
  references: string;
  area: string;
  locality: string;
  route: string;
  circuit: string;
  debtCents: number;
  monthsPending: number;
  supplyStatus: string;
  claims: boolean;
  paymentPlan: boolean;
  latitude: number;
  longitude: number;
}

const EXTRA_SIMULATED_DEBTORS: ExtraSimulatedDebtorSeed[] = [
  { code: "1003", name: "Ana Condori", address: "Calle Tarija 18, Villa Esperanza", references: "Junto al mercado vecinal", area: "A", locality: "001 - VILLA ESPERANZA", route: "001", circuit: "D-1181", debtCents: 3150, monthsPending: 1, supplyStatus: "A", claims: false, paymentPlan: false, latitude: -19.590101, longitude: -65.260201 },
  { code: "1004", name: "Luis Mamani", address: "Pasaje Sucre 44, Villa Esperanza", references: "Casa de esquina azul", area: "A", locality: "001 - VILLA ESPERANZA", route: "001", circuit: "D-1181", debtCents: 15600, monthsPending: 4, supplyStatus: "A", claims: false, paymentPlan: true, latitude: -19.590412, longitude: -65.260543 },
  { code: "1005", name: "Rosa Choque", address: "Av. Central 302, Mojotorillo", references: "Frente a cancha comunal", area: "B", locality: "002 - MOJOTORILLO", route: "003", circuit: "D-1183", debtCents: 27800, monthsPending: 5, supplyStatus: "A", claims: true, paymentPlan: false, latitude: -19.587901, longitude: -65.257821 },
  { code: "1006", name: "Juan Calle", address: "Calle Los Pinos 7, San Pedro", references: "Portón metálico verde", area: "C", locality: "003 - SAN PEDRO", route: "004", circuit: "D-1184", debtCents: 8900, monthsPending: 2, supplyStatus: "A", claims: false, paymentPlan: false, latitude: -19.586744, longitude: -65.256421 },
  { code: "1007", name: "Elena Poma", address: "Barrio Nuevo 56, San Pedro", references: "A media cuadra de la plaza", area: "C", locality: "003 - SAN PEDRO", route: "004", circuit: "D-1184", debtCents: 42500, monthsPending: 8, supplyStatus: "A", claims: false, paymentPlan: false, latitude: -19.586201, longitude: -65.255988 },
  { code: "1008", name: "Miguel Vargas", address: "Camino a Chullpa 91", references: "Poste numerado 14", area: "D", locality: "004 - CHULLPA", route: "005", circuit: "D-1185", debtCents: 12600, monthsPending: 3, supplyStatus: "I", claims: false, paymentPlan: false, latitude: -19.594101, longitude: -65.263771 },
  { code: "1009", name: "Carla Nina", address: "Calle Libertad 109, Mojotorillo", references: "Al lado de la farmacia", area: "B", locality: "002 - MOJOTORILLO", route: "003", circuit: "D-1183", debtCents: 20400, monthsPending: 6, supplyStatus: "A", claims: false, paymentPlan: true, latitude: -19.588321, longitude: -65.257412 },
  { code: "1010", name: "Pedro Huanca", address: "Av. Sucre 210, Villa Esperanza", references: "Tienda La Esquina", area: "A", locality: "001 - VILLA ESPERANZA", route: "006", circuit: "D-1181", debtCents: 6700, monthsPending: 2, supplyStatus: "A", claims: false, paymentPlan: false, latitude: -19.591002, longitude: -65.261102 },
];

function createExtraSimulatedDebtor(seed: ExtraSimulatedDebtorSeed): DebtorRecord {
  const monthlyAmount = Math.floor(seed.debtCents / seed.monthsPending);
  const kardex = Array.from({ length: seed.monthsPending }, (_, index) => {
    const billingDate = new Date(Date.UTC(2026, index, 27));
    return {
      entryId: `k-${seed.code}-${index + 1}`,
      period: billingDate.toISOString().slice(0, 7),
      amountCents: index === seed.monthsPending - 1 ? seed.debtCents - monthlyAmount * index : monthlyAmount,
      status: "PENDING" as const,
      billingDate: billingDate.toISOString().slice(0, 10),
      invoiceOrigin: "FA_FACTURAS",
      daysLate: (seed.monthsPending - index) * 30,
    };
  });
  return {
    debtorId: `debtor-${seed.code}`,
    accountId: `CTA-${seed.code}`,
    supplyId: `SUM-${seed.code}`,
    customerName: seed.name,
    address: seed.address,
    references: seed.references,
    meterId: `MED-${seed.code}`,
    area: seed.area,
    locality: seed.locality,
    route: seed.route,
    circuit: seed.circuit,
    tariff: "RS",
    supplyStatus: seed.supplyStatus,
    enablingTitle: "R",
    routeOrder: Number(seed.code) - 900,
    meterBrand: "WASION",
    meterIndex: `MED-${seed.code}`,
    meterMultiplier: 1,
    cadastralLatitude: seed.latitude,
    cadastralLongitude: seed.longitude,
    claims: seed.claims,
    paymentPlan: seed.paymentPlan,
    suspensionDate: "2026-08-27T00:00:00.000Z",
    debtCents: seed.debtCents,
    monthsPending: seed.monthsPending,
    updatedAt: "2026-09-10T12:00:00.000Z",
    source: "SIMULATED",
    kardex,
  };
}

function auditEvent(input: Omit<AuditEvent, "auditId" | "source">): AuditEvent {
  return { auditId: secureUuid("audit"), source: "SIMULATED", ...input };
}

function secureUuid(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new Error("Secure identifier generation is unavailable.");
  return `${prefix}-${uuid}`;
}

function sameSession(left: Session, right: Session): boolean {
  return left.sessionId === right.sessionId && left.userId === right.userId && left.username === right.username && left.role === right.role && left.authenticity === "SIMULATED" && right.authenticity === "SIMULATED";
}

function commandHash(value: unknown): string {
  return JSON.stringify(value);
}

async function hashCredential(credential: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto credential verification is unavailable.");
  const bytes = new TextEncoder().encode(credential);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const NO_DATA_FILTER_VALUE = "__NO_DATA__";

function matchesOptional(value: string, expected: string | undefined): boolean {
  if (!expected) return true;
  if (expected === NO_DATA_FILTER_VALUE) return !normalizeFilterValue(value);
  return normalizeFilterValue(value) === normalizeFilterValue(expected);
}

function normalizeFilterValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function normalizeSearchValue(value: string | number | boolean | undefined | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function searchableDebtorValues(debtor: DebtorRecord): Array<string | number | boolean | undefined | null> {
  return [
    debtor.debtorId,
    debtor.accountId,
    debtor.supplyId,
    debtor.customerName,
    debtor.address,
    debtor.references,
    debtor.meterId,
    debtor.area,
    debtor.locality,
    debtor.route,
    debtor.circuit,
    debtor.debtCents,
    (debtor.debtCents / 100).toFixed(2),
    debtor.monthsPending,
    debtor.supplyStatus,
    debtor.tariff,
    debtor.enablingTitle,
    debtor.routeOrder,
    debtor.customerCi,
    debtor.contactPhone,
    debtor.meterBrand,
    debtor.meterIndex,
    debtor.meterMultiplier,
    debtor.claims,
    debtor.paymentPlan,
    ...debtor.kardex.flatMap((entry) => [entry.period, entry.amountCents, (entry.amountCents / 100).toFixed(2), entry.status, entry.daysLate]),
  ];
}

function isWorkOrderResult(value: StoredOperation["result"]): value is WorkOrder {
  return Boolean(value && "orderId" in value && !("batchId" in value));
}

function isBatchResult(value: StoredOperation["result"]): value is CreateOrdersBatchResult {
  return Boolean(value && "batchId" in value && Array.isArray(value.created) && Array.isArray(value.skipped));
}

function errorCode(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : fallback;
}
