import { DomainError, assertCan, permissionsForRole, type AssignOrderCommand, type AuditEvent, type CreateOrderCommand, type DebtorQuery, type DebtorRecord, type DemoCredentials, type OperationRecord, type Session, type SimulatedUser, type VisitRecord, type WorkOrder, type WorkPackage, type WorkPackageEnvelope } from "../../domain";
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
  action: "CREATE_ORDER" | "ASSIGN_ORDER" | "SYNC_OPERATION" | "AUTHORIZATION_RESERVATION";
  result?: WorkOrder;
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
      role: user.role,
      permissions: permissionsForRole(user.role),
      issuedAt: now,
      authenticity: "SIMULATED",
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
    const normalized = query.query?.trim().toLocaleLowerCase();
    const result = records.filter((debtor) => {
      const textMatch = !normalized || [debtor.debtorId, debtor.accountId, debtor.supplyId, debtor.customerName, debtor.meterId].some((value) => value.toLocaleLowerCase().includes(normalized));
      return textMatch && matchesOptional(debtor.area, query.area) && matchesOptional(debtor.locality, query.locality) && matchesOptional(debtor.route, query.route);
    }).map((debtor) => structuredClone(debtor));
    transaction.objectStore("audit").put(auditEvent({ actorId: session.userId, actorRole: session.role, action: "FIND_DEBTORS", result: "accepted", occurredAt: new Date().toISOString() }));
    await transactionComplete(transaction);
    return result;
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
      if (!prior.result) throw new DomainError("Stored create result is invalid.", "IDEMPOTENCY_CONFLICT");
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
      if (!prior.result) throw new DomainError("Stored assignment result is invalid.", "IDEMPOTENCY_CONFLICT");
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
    const assigned: WorkOrder = { ...current, assignedTechnicianId: technician.userId, version: input.expectedOrderVersion + 1 };
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
    { debtorId: "debtor-1001", accountId: "CTA-1001", supplyId: "SUM-1001", customerName: "María Flores", address: "Av. Petrolera 145, Villa Esperanza", references: "Frente a unidad educativa", meterId: "MED-1001", area: "Valle", locality: "Villa Esperanza", route: "R-07", debtCents: 24050, monthsPending: 3, updatedAt: "2026-09-10T12:00:00.000Z", source: "SIMULATED", kardex: [{ entryId: "k-1001-1", period: "2026-07", amountCents: 8017, status: "PENDING" }, { entryId: "k-1001-2", period: "2026-08", amountCents: 8017, status: "PENDING" }, { entryId: "k-1001-3", period: "2026-09", amountCents: 8016, status: "PENDING" }] },
    { debtorId: "debtor-1002", accountId: "CTA-1002", supplyId: "SUM-1002", customerName: "José Quispe", address: "Calle Los Álamos 22, San Pedro", references: "A dos cuadras del mercado", meterId: "MED-1002", area: "Valle", locality: "San Pedro", route: "R-08", debtCents: 11800, monthsPending: 2, updatedAt: "2026-09-10T12:00:00.000Z", source: "SIMULATED", kardex: [{ entryId: "k-1002-1", period: "2026-08", amountCents: 5900, status: "PENDING" }, { entryId: "k-1002-2", period: "2026-09", amountCents: 5900, status: "PENDING" }] },
  ];
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

function matchesOptional(value: string, expected: string | undefined): boolean {
  return !expected || value.toLocaleLowerCase() === expected.trim().toLocaleLowerCase();
}

function errorCode(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : fallback;
}
