import type {
  EvidenceReference,
  OperationRecord,
  VisitRecord,
  WorkOrder,
  WorkPackage,
  WorkPackageEnvelope,
} from "../../domain";
import type {
  AtomicOperationChange,
  CaptureDraft,
  CaptureDraftAction,
  CaptureDraftKey,
  ClaimResult,
  ConflictRecord,
  LocalRepository,
  SyncClaimResult,
  StoredRecord,
} from "../../ports/repository";
import type { SyncItem } from "../../ports/sync";
import {
  deleteFieldDatabase,
  openFieldDatabase,
  requestResult,
  transactionComplete,
} from "./database";
import { createSimulatedPackageEnvelope, isValidSimulatedPackage } from "./package-validation";

type StoredOrderOrder = WorkOrder & { __orderId: string };
type StoredEvidence = EvidenceReference & { __evidenceId: string };
type StoredPackageEnvelope = WorkPackageEnvelope & { __packageId: string };
type StoredConflict = ConflictRecord & { conflictId: string; __conflictId: string };
type StoredCaptureDraft = CaptureDraft & { draftId: string };
const CAPTURE_DRAFT_ACTIONS: readonly CaptureDraftAction[] = ["VISIT", "CUT", "RECONNECTION"];

export interface IndexedDbRepositoryOptions {
  dbName?: string;
  technicianId: string;
  deviceId: string;
}

export class IndexedDbLocalRepository implements LocalRepository {
  readonly dbName: string;
  private readonly technicianId: string;
  private readonly deviceId: string;
  private dbPromise: Promise<IDBDatabase>;

  constructor(options: IndexedDbRepositoryOptions) {
    this.dbName = options.dbName ?? scopedDatabaseName(options.technicianId, options.deviceId);
    this.technicianId = options.technicianId;
    this.deviceId = options.deviceId;
    if (!this.technicianId.trim() || !this.deviceId.trim()) {
      throw new Error("IndexedDB repository requires technicianId and deviceId scope.");
    }
    this.dbPromise = openFieldDatabase(this.dbName);
  }

  async close(): Promise<void> {
    const db = await this.dbPromise;
    db.close();
  }

  async deleteDatabase(): Promise<void> {
    await this.close();
    await deleteFieldDatabase(this.dbName);
  }

  async savePackage(workPackage: WorkPackage | WorkPackageEnvelope): Promise<void> {
    const envelope = "package" in workPackage ? workPackage : createSimulatedPackageEnvelope(workPackage);
    if (!isValidSimulatedPackage(envelope)) {
      throw new Error("Work package rejected: simulated authenticity or integrity validation failed.");
    }
    if (envelope.package.technicianId !== this.technicianId) {
      throw new Error("Work package belongs to another technician.");
    }
    if (envelope.package.deviceId !== this.deviceId) {
      throw new Error("Work package belongs to another device.");
    }
    if (!Number.isFinite(envelope.package.version) || envelope.package.orders.some((order) => !Number.isFinite(order.version))) {
      throw new Error("Work package and every order require finite versions.");
    }
    if (envelope.package.orders.some((order) => order.assignedTechnicianId !== envelope.package.technicianId)) {
      throw new Error("Work package contains an order assigned to another technician.");
    }
    const db = await this.dbPromise;
    const transaction = db.transaction(["package", "orders", "sync"], "readwrite");
    const packageStore = transaction.objectStore("package");
    const orderStore = transaction.objectStore("orders");
    const syncStore = transaction.objectStore("sync");
    const currentEnvelope = fromStoredEnvelope(await requestResult(packageStore.get(this.packageKey(envelope.package.packageId))) as StoredPackageEnvelope | undefined);
    const currentOrders = await Promise.all(envelope.package.orders.map((order) => requestResult(orderStore.get(this.orderKey(order.orderId))))).then((orders) => orders.map(fromStoredOrder)) as Array<WorkOrder | undefined>;
    const localOrders = (await requestResult(orderStore.getAll()) as StoredOrderOrder[]).map(fromStoredOrder).filter((order): order is WorkOrder => Boolean(order));
    for (let index = 0; index < currentOrders.length; index += 1) {
      const current = currentOrders[index];
      const incoming = envelope.package.orders[index];
      if (current && current.assignedTechnicianId !== incoming.assignedTechnicianId) {
        transaction.abort();
        throw new Error("Work package conflicts with another technician's local order.");
      }
    }
    const syncItems = await requestResult(syncStore.getAll()) as SyncItem[];
    const protectedOrderIds = new Set(
      syncItems
        .filter((item) => this.identityMatches(item) && (item.status !== "synced" || item.manualReview))
        .map((item) => item.orderId)
        .filter((orderId): orderId is string => Boolean(orderId)),
    );
    const mergedOrders = envelope.package.orders.map((incoming, index) => {
      const current = currentOrders[index];
      const protectedByVersion = current?.version !== undefined && incoming.version !== undefined && current.version >= incoming.version;
      const protectedByPhysicalState = current?.physicalStatus !== undefined && current.physicalStatus !== "NONE";
      return current && (protectedByVersion || protectedByPhysicalState || protectedOrderIds.has(current.orderId)) ? current : incoming;
    });
    const incomingEnvelope = { ...envelope, packageId: envelope.package.packageId };
    const strictlyNewerPackage = Boolean(currentEnvelope && currentEnvelope.package.version < incomingEnvelope.package.version);
    const incomingOrderIds = new Set(incomingEnvelope.package.orders.map((order) => order.orderId));
    try {
      if (!currentEnvelope || currentEnvelope.package.version <= incomingEnvelope.package.version) {
        packageStore.put(toStoredEnvelope(incomingEnvelope, this.packageKey(incomingEnvelope.package.packageId)));
      }
      for (const order of mergedOrders) orderStore.put(toStoredOrder(order, this.orderKey(order.orderId)));
      if (strictlyNewerPackage) {
        for (const order of localOrders) {
          if (incomingOrderIds.has(order.orderId) || order.physicalStatus !== "NONE" || protectedOrderIds.has(order.orderId)) continue;
          orderStore.delete(this.orderKey(order.orderId));
        }
      }
    } catch (error) {
      transaction.abort();
      throw error;
    }
    await transactionComplete(transaction);
  }

  async putPackage(workPackage: WorkPackage | WorkPackageEnvelope): Promise<void> {
    return this.savePackage(workPackage);
  }

  async loadAssignedPackage(): Promise<WorkPackage> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["package", "orders"], "readonly");
    const envelopes = (await requestResult(transaction.objectStore("package").getAll())) as StoredPackageEnvelope[];
    const valid = envelopes
      .map(fromStoredEnvelope)
      .filter((candidate): candidate is WorkPackageEnvelope => Boolean(candidate))
      .filter((candidate) => isValidSimulatedPackage(candidate))
      .filter((candidate) => this.identityMatches(candidate.package))
      .sort((left, right) => right.package.version - left.package.version);
    if (!valid[0]) throw new Error("No valid work package is available for this technician and device.");
    const orders = await Promise.all(valid[0].package.orders.map((order) => requestResult(transaction.objectStore("orders").get(this.orderKey(order.orderId)))));
    await transactionComplete(transaction);
    return {
      ...structuredClone(valid[0].package),
      orders: valid[0].package.orders.map((order, index) => structuredClone(fromStoredOrder((orders[index] as StoredOrderOrder | undefined)) ?? order)),
    };
  }

  async getOrder(orderId: string): Promise<WorkOrder | undefined> {
    return fromStoredOrder(await this.readStore<StoredOrderOrder>("orders", this.orderKey(orderId)));
  }

  async getRecord(operationId: string): Promise<StoredRecord | undefined> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["operations", "visits"], "readonly");
    const operation = await requestResult(transaction.objectStore("operations").get(operationId));
    const record = operation ?? (await requestResult(transaction.objectStore("visits").get(operationId)));
    await transactionComplete(transaction);
    if (!record || !this.identityMatches(record as { technicianId?: string; deviceId?: string })) return undefined;
    return record as StoredRecord;
  }

  async getCaptureDraft(key: CaptureDraftKey): Promise<CaptureDraft | undefined> {
    this.assertDraftScope(key);
    const draft = await this.readStore<StoredCaptureDraft>("drafts", this.draftKey(key));
    if (!draft) return undefined;
    if (!this.identityMatches(draft) || draft.orderId !== key.orderId || draft.action !== key.action) {
      throw new Error("Capture draft is outside this technician and device scope.");
    }
    const { draftId: _draftId, ...captureDraft } = draft;
    return captureDraft;
  }

  async saveCaptureDraft(draft: CaptureDraft): Promise<void> {
    this.assertDraftScope(draft);
    if (!draft.orderId.trim() || !draft.updatedAt.trim()) {
      throw new Error("Capture draft requires order identity and update time.");
    }
    const key = this.draftKey(draft);
    const stored: StoredCaptureDraft = { ...structuredClone(draft), draftId: key };
    const db = await this.dbPromise;
    const transaction = db.transaction("drafts", "readwrite");
    const completed = transactionComplete(transaction);
    try {
      transaction.objectStore("drafts").put(stored);
    } catch (error) {
      transaction.abort();
      throw error;
    }
    await completed;
  }

  async deleteCaptureDraft(key: CaptureDraftKey): Promise<void> {
    this.assertDraftScope(key);
    const db = await this.dbPromise;
    const transaction = db.transaction("drafts", "readwrite");
    const completed = transactionComplete(transaction);
    transaction.objectStore("drafts").delete(this.draftKey(key));
    await completed;
  }

  async claimCut(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult> {
    return this.claim(change, expectedOrderVersion);
  }

  async claimReconnection(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult> {
    return this.claim(change, expectedOrderVersion);
  }

  private async claim(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult> {
    const record = change.operation ?? change.visit;
    if (!record || !change.order) throw new Error("Atomic claim requires record and order.");
    if (!this.identityMatches(record) || !this.identityMatches(change.syncItem)) {
      return { status: "rejected", reason: "Operation is outside this technician and device scope." };
    }
    const db = await this.dbPromise;
    const transaction = db.transaction(["operations", "visits", "orders", "sync", "evidence"], "readwrite");
    const operations = transaction.objectStore("operations");
    const visits = transaction.objectStore("visits");
    const existing = (await requestResult(operations.get(record.operationId))) ?? (await requestResult(visits.get(record.operationId)));
    if (existing) {
      transaction.abort();
      if (!this.identityMatches(existing as { technicianId?: string; deviceId?: string })) {
        return { status: "rejected", reason: "Operation identifier belongs to another technician and device." };
      }
      return { status: "existing", record: existing as StoredRecord };
    }
    const current = fromStoredOrder(await requestResult(transaction.objectStore("orders").get(this.orderKey(record.orderId))) as StoredOrderOrder | undefined);
    if (!current || current.version !== expectedOrderVersion) {
      transaction.abort();
      return { status: "order_conflict", currentOrder: current ?? change.order };
    }
    if (current.assignedTechnicianId !== record.technicianId || change.order.assignedTechnicianId !== record.technicianId) {
      transaction.abort();
      return { status: "rejected", reason: "Order is not assigned to this technician.", currentOrder: current };
    }
    if (change.order.orderId !== record.orderId) {
      transaction.abort();
      return { status: "rejected", reason: "Order claim does not match operation order.", currentOrder: current };
    }
    if (change.order.version !== expectedOrderVersion + 1) {
      transaction.abort();
      return { status: "rejected", reason: "Order claim must advance version by one.", currentOrder: current };
    }
    try {
      this.putRecord(transaction, record);
      transaction.objectStore("orders").put(toStoredOrder(change.order, this.orderKey(change.order.orderId)));
      transaction.objectStore("sync").put(change.syncItem);
      if (change.evidence) await this.putEvidence(transaction, change.evidence);
    } catch (error) {
      transaction.abort();
      throw error;
    }
    await transactionComplete(transaction);
    return { status: "claimed", record, order: change.order };
  }

  async claimVisit(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<ClaimResult> {
    const record = change.visit;
    if (!record) throw new Error("Visit claim requires visit.");
    if (!this.identityMatches(record) || !this.identityMatches(change.syncItem)) {
      return { status: "rejected", reason: "Operation is outside this technician and device scope." };
    }
    const db = await this.dbPromise;
    const stores = ["operations", "visits", "orders", "sync", "evidence"] as const;
    const transaction = db.transaction(stores, "readwrite");
    const existing = (await requestResult(transaction.objectStore("operations").get(record.operationId))) ??
      (await requestResult(transaction.objectStore("visits").get(record.operationId)));
    if (existing) {
      transaction.abort();
      if (!this.identityMatches(existing as { technicianId?: string; deviceId?: string })) {
        return { status: "rejected", reason: "Operation identifier belongs to another technician and device." };
      }
      return { status: "existing", record: existing as StoredRecord };
    }
    if (change.order && expectedOrderVersion !== undefined) {
      const current = fromStoredOrder(await requestResult(transaction.objectStore("orders").get(this.orderKey(record.orderId))) as StoredOrderOrder | undefined);
      if (!current || current.version !== expectedOrderVersion) {
        transaction.abort();
        return { status: "order_conflict", currentOrder: current ?? change.order };
      }
      if (current.assignedTechnicianId !== record.technicianId || change.order.assignedTechnicianId !== record.technicianId) {
        transaction.abort();
        return { status: "rejected", reason: "Order is not assigned to this technician.", currentOrder: current };
      }
      if (change.order.orderId !== record.orderId) {
        transaction.abort();
        return { status: "rejected", reason: "Order update does not match operation order.", currentOrder: current };
      }
      if (change.order.version === undefined || change.order.version !== expectedOrderVersion + 1) {
        transaction.abort();
        return { status: "rejected", reason: "Order update must advance version by one.", currentOrder: current };
      }
    }
    if (change.order && expectedOrderVersion === undefined) {
      transaction.abort();
      return { status: "rejected", reason: "Order update requires an expected version." };
    }
    try {
      this.putRecord(transaction, record);
      if (change.order) transaction.objectStore("orders").put(toStoredOrder(change.order, this.orderKey(change.order.orderId)));
      transaction.objectStore("sync").put(change.syncItem);
      if (change.evidence) await this.putEvidence(transaction, change.evidence);
    } catch (error) {
      transaction.abort();
      throw error;
    }
    await transactionComplete(transaction);
    return { status: "claimed", record, order: change.order };
  }

  async updateOperationAndOrder(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<void> {
    const record = change.operation ?? change.visit;
    if (!record) throw new Error("Update requires a record.");
    if (!this.identityMatches(record) || !this.identityMatches(change.syncItem)) {
      throw new Error("Operation is outside this technician and device scope.");
    }
    const db = await this.dbPromise;
    const storeNames = change.order ? ["operations", "visits", "orders", "sync", "evidence"] : ["operations", "visits", "sync", "evidence"];
    const transaction = db.transaction(storeNames, "readwrite");
    if (change.order && expectedOrderVersion !== undefined) {
      const current = fromStoredOrder(await requestResult(transaction.objectStore("orders").get(this.orderKey(record.orderId))) as StoredOrderOrder | undefined);
      if (!current || current.version !== expectedOrderVersion) {
        transaction.abort();
        throw new Error("CAS order version mismatch");
      }
      if (change.order.assignedTechnicianId !== record.technicianId || current.assignedTechnicianId !== record.technicianId) {
        transaction.abort();
        throw new Error("Order cannot be reassigned during operation update.");
      }
      if (change.order.orderId !== record.orderId) {
        transaction.abort();
        throw new Error("Order update does not match operation order.");
      }
      if (change.order.version === undefined || change.order.version !== expectedOrderVersion + 1 || change.order.assignedTechnicianId !== record.technicianId) {
        transaction.abort();
        throw new Error("Order update must advance version.");
      }
      transaction.objectStore("orders").put(toStoredOrder(change.order, this.orderKey(change.order.orderId)));
    }
    if (change.order && expectedOrderVersion === undefined) {
      transaction.abort();
      throw new Error("Order update requires an expected version.");
    }
    const existing = (await requestResult(transaction.objectStore("operations").get(record.operationId))) ??
      (await requestResult(transaction.objectStore("visits").get(record.operationId)));
    if (existing && !this.identityMatches(existing as { technicianId?: string; deviceId?: string })) {
      transaction.abort();
      throw new Error("Operation identifier belongs to another technician and device.");
    }
    try {
      this.putRecord(transaction, record);
      transaction.objectStore("sync").put(change.syncItem);
      if (change.evidence) await this.putEvidence(transaction, change.evidence);
    } catch (error) {
      transaction.abort();
      throw error;
    }
    await transactionComplete(transaction);
  }

  async listSyncItems(): Promise<SyncItem[]> {
    const items = await this.readAll<SyncItem>("sync");
    return items.filter((item) => this.identityMatches(item));
  }

  async claimSync(operationId: string, owner: string, now: string, leaseMilliseconds: number, options: { allowManualReview?: boolean } = {}): Promise<SyncClaimResult> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["sync", "operations", "visits"], "readwrite");
    const syncStore = transaction.objectStore("sync");
    const current = await requestResult(syncStore.get(operationId)) as SyncItem | undefined;
    if (!current || !this.identityMatches(current)) {
      transaction.abort();
      return { status: "not_found" };
    }
    if ((current.manualReview && !options.allowManualReview) || current.status === "synced") {
      transaction.abort();
      return { status: "skipped", item: current };
    }
    if (current.status === "syncing") {
      if (!current.leaseExpiresAt || current.leaseExpiresAt > now) {
        transaction.abort();
        return { status: "busy", item: current };
      }
    }
    const item: SyncItem = {
      ...current,
      status: "syncing",
      attempts: current.attempts + 1,
      leaseOwner: owner,
      leaseExpiresAt: new Date(Date.parse(now) + leaseMilliseconds).toISOString(),
      leaseToken: secureRandomUuid(),
      updatedAt: now,
    };
    syncStore.put(item);
    const record = (await requestResult(transaction.objectStore("operations").get(operationId))) ??
      (await requestResult(transaction.objectStore("visits").get(operationId)));
    if (record) {
      if (!this.identityMatches(record as { technicianId?: string; deviceId?: string })) {
        transaction.abort();
        throw new Error("Operation is outside this technician and device scope.");
      }
      this.putRecord(transaction, { ...record, syncStatus: "syncing" } as StoredRecord);
    }
    await transactionComplete(transaction);
    return { status: "claimed", item };
  }

  async updateSyncState(
    operationId: string,
    status: SyncItem["status"],
    options: { errorCode?: string; uncertain?: boolean; attempts?: number; owner: string; leaseToken: string; now: string; manualReview?: boolean; remoteConfirmed?: boolean },
  ): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["operations", "visits", "orders", "sync"], "readwrite");
    const syncStore = transaction.objectStore("sync");
    const current = (await requestResult(syncStore.get(operationId))) as SyncItem | undefined;
    if (!current || !this.identityMatches(current)) {
      transaction.abort();
      throw new Error(`Sync item ${operationId} does not exist in this repository scope.`);
    }
    if (current.leaseOwner !== options.owner || current.leaseToken !== options.leaseToken || !current.leaseExpiresAt || current.leaseExpiresAt <= options.now) {
      transaction.abort();
      throw new Error("Sync lease fencing token is invalid.");
    }
    const next: SyncItem = {
      ...current,
      status,
      errorCode: options.errorCode,
      uncertain: options.uncertain ?? current.uncertain,
      attempts: options.attempts ?? current.attempts,
      manualReview: options.manualReview ?? current.manualReview,
      leaseOwner: status === "syncing" ? current.leaseOwner : undefined,
      leaseExpiresAt: status === "syncing" ? current.leaseExpiresAt : undefined,
      leaseToken: status === "syncing" ? current.leaseToken : undefined,
      updatedAt: new Date().toISOString(),
    };
    syncStore.put(next);
    const operation = await requestResult(transaction.objectStore("operations").get(operationId));
    const visit = await requestResult(transaction.objectStore("visits").get(operationId));
    const record = operation ?? visit;
    if (record) {
      if (!this.identityMatches(record as { technicianId?: string; deviceId?: string })) {
        transaction.abort();
        throw new Error("Operation is outside this technician and device scope.");
      }
      const confirmedRecord = options.remoteConfirmed && record.kind !== "VISIT"
        ? { ...record, status: "CONFIRMED", physicalStatus: "CONFIRMED", syncStatus: status, errorCode: undefined } as OperationRecord
        : { ...record, syncStatus: status, errorCode: options.errorCode } as StoredRecord;
      this.putRecord(transaction, confirmedRecord);
      if (options.remoteConfirmed && record.kind !== "VISIT") {
        const order = fromStoredOrder(await requestResult(transaction.objectStore("orders").get(this.orderKey(record.orderId))) as StoredOrderOrder | undefined);
        if (!order) {
          transaction.abort();
          throw new Error("Confirmed operation order is missing from local repository.");
        }
        transaction.objectStore("orders").put(toStoredOrder({ ...order, status: record.action === "CUT" ? "EJECUTADO" : "RECONEXIÓN", physicalStatus: "CONFIRMED" }, this.orderKey(order.orderId)));
      }
    }
    await transactionComplete(transaction);
  }

  async recoverInFlight(now = new Date().toISOString()): Promise<void> {
    const items = await this.listSyncItems();
    for (const item of items) {
      if (item.status !== "syncing" || !item.leaseExpiresAt || item.leaseExpiresAt > now) continue;
      await this.recoverPhysicalUnknown(item.operationId, now);
    }
  }

  async recoverPhysicalUnknown(
    operationId: string,
    now: string,
    lease?: { owner: string; leaseToken: string },
  ): Promise<StoredRecord | undefined> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["sync", "operations", "visits", "orders"], "readwrite");
    const syncStore = transaction.objectStore("sync");
    const currentSync = await requestResult(syncStore.get(operationId)) as SyncItem | undefined;
    if (!currentSync || !this.identityMatches(currentSync)) {
      transaction.abort();
      return undefined;
    }
    if (lease) {
      if (currentSync.leaseOwner !== lease.owner || currentSync.leaseToken !== lease.leaseToken || !currentSync.leaseExpiresAt || currentSync.leaseExpiresAt <= now) {
        transaction.abort();
        throw new Error("Sync lease fencing token is invalid.");
      }
    } else if (currentSync.status !== "syncing" || !currentSync.leaseExpiresAt || currentSync.leaseExpiresAt > now) {
      transaction.abort();
      return undefined;
    }
    const operation = await requestResult(transaction.objectStore("operations").get(operationId)) as OperationRecord | undefined;
    const visit = await requestResult(transaction.objectStore("visits").get(operationId)) as VisitRecord | undefined;
    const record = operation ?? visit;
    if (!record) {
      transaction.abort();
      return undefined;
    }
    const pendingPhysical = record.kind !== "VISIT" && (record.status === "INTENT_PERSISTED" || record.physicalStatus === "CLAIMED");
    let nextRecord: StoredRecord = { ...record, syncStatus: "failed", errorCode: "RESPONSE_UNKNOWN" } as StoredRecord;
    let nextSync: SyncItem = { ...currentSync, status: "failed", uncertain: true, errorCode: "RESPONSE_UNKNOWN", updatedAt: now };
    if (pendingPhysical) {
      const currentOrder = fromStoredOrder(await requestResult(transaction.objectStore("orders").get(this.orderKey(record.orderId))) as StoredOrderOrder | undefined);
      if (!currentOrder || currentOrder.version === undefined || !Number.isFinite(currentOrder.version)) {
        transaction.abort();
        throw new Error("Physical recovery cannot prove current order version.");
      }
      nextRecord = {
        ...record,
        status: "PHYSICAL_UNKNOWN",
        physicalStatus: "PHYSICAL_UNKNOWN",
        syncStatus: "failed",
        errorCode: "RESPONSE_UNKNOWN",
        updatedAt: now,
      } as OperationRecord;
      nextSync = { ...nextSync, errorCode: "RESPONSE_UNKNOWN" };
      transaction.objectStore("orders").put(toStoredOrder({ ...currentOrder, physicalStatus: "PHYSICAL_UNKNOWN", version: currentOrder.version + 1 }, this.orderKey(currentOrder.orderId)));
    }
    if (!lease) {
      nextSync = { ...nextSync, leaseOwner: undefined, leaseExpiresAt: undefined, leaseToken: undefined };
    }
    syncStore.put(nextSync);
    this.putRecord(transaction, nextRecord);
    await transactionComplete(transaction);
    return nextRecord;
  }

  async recordConflict(conflict: ConflictRecord): Promise<void> {
    if ((conflict.technicianId && conflict.technicianId !== this.technicianId) || (conflict.deviceId && conflict.deviceId !== this.deviceId)) {
      throw new Error("Conflict is outside this technician and device scope.");
    }
    const db = await this.dbPromise;
    const transaction = db.transaction("conflicts", "readwrite");
    transaction.objectStore("conflicts").put(toStoredConflict(conflict, this.conflictKey(conflict.conflictId)));
    await transactionComplete(transaction);
  }

  async recordConflictAndFail(conflict: ConflictRecord, operationId: string, owner: string, leaseToken: string, now: string): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["conflicts", "sync", "operations", "visits"], "readwrite");
    const syncStore = transaction.objectStore("sync");
    const current = await requestResult(syncStore.get(operationId)) as SyncItem | undefined;
    if (!current || !this.identityMatches(current) || current.leaseOwner !== owner || current.leaseToken !== leaseToken || !current.leaseExpiresAt || current.leaseExpiresAt <= now) {
      transaction.abort();
      throw new Error("Sync lease belongs to another owner.");
    }
    syncStore.put({ ...current, status: "failed", errorCode: "REMOTE_CONFLICT", manualReview: true, uncertain: false, leaseOwner: undefined, leaseExpiresAt: undefined, leaseToken: undefined, updatedAt: conflict.detectedAt });
    const operation = await requestResult(transaction.objectStore("operations").get(operationId));
    const visit = await requestResult(transaction.objectStore("visits").get(operationId));
    const record = operation ?? visit;
    if (record) this.putRecord(transaction, { ...record, syncStatus: "failed", errorCode: "REMOTE_CONFLICT" } as StoredRecord);
    const scopedConflict = { ...structuredClone(conflict), technicianId: this.technicianId, deviceId: this.deviceId };
    transaction.objectStore("conflicts").put(toStoredConflict(scopedConflict, this.conflictKey(conflict.conflictId)));
    await transactionComplete(transaction);
  }

  async listConflicts(): Promise<ConflictRecord[]> {
    const conflicts = await this.readAll<StoredConflict>("conflicts");
    return conflicts.map(fromStoredConflict).filter((conflict) => this.identityMatches(conflict));
  }

  async getEvidence(evidenceId: string): Promise<EvidenceReference | undefined> {
    const evidence = await this.readStore<StoredEvidence>("evidence", this.evidenceKey(evidenceId));
    return evidence ? fromStoredEvidence(evidence) : undefined;
  }

  private async putEvidence(transaction: IDBTransaction, evidence: EvidenceReference): Promise<void> {
    if (!this.identityMatches(evidence)) throw new Error("Evidence is outside this technician and device scope.");
    const store = transaction.objectStore("evidence");
    const key = this.evidenceKey(evidence.evidenceId);
    const current = await requestResult(store.get(key)) as StoredEvidence | undefined;
    if (current && !evidenceEquivalent(fromStoredEvidence(current), evidence)) {
      throw new Error("Evidence identifier collision has different binding or metadata.");
    }
    if (!current) store.put(toStoredEvidence(evidence, key));
  }

  private putRecord(transaction: IDBTransaction, record: StoredRecord): void {
    transaction.objectStore(record.kind === "VISIT" ? "visits" : "operations").put(record);
  }

  private identityMatches(value: { technicianId?: string; deviceId?: string }): boolean {
    return value.technicianId === this.technicianId && value.deviceId === this.deviceId;
  }

  private assertDraftScope(key: CaptureDraftKey): void {
    if (!this.identityMatches(key)) {
      throw new Error("Capture draft is outside this technician and device scope.");
    }
    if (!key.technicianId.trim() || !key.deviceId.trim() || !key.orderId.trim()) {
      throw new Error("Capture draft requires technician, device, and order identity.");
    }
    if (!CAPTURE_DRAFT_ACTIONS.includes(key.action)) {
      throw new Error("Capture draft action is invalid.");
    }
  }

  private draftKey(key: CaptureDraftKey): string {
    return JSON.stringify([key.technicianId, key.deviceId, key.orderId, key.action]);
  }

  private orderKey(orderId: string): string {
    return JSON.stringify([this.technicianId, this.deviceId, orderId]);
  }

  private evidenceKey(evidenceId: string): string {
    return JSON.stringify([this.technicianId, this.deviceId, evidenceId]);
  }

  private packageKey(packageId: string): string {
    return JSON.stringify([this.technicianId, this.deviceId, packageId]);
  }

  private conflictKey(conflictId: string): string {
    return JSON.stringify([this.technicianId, this.deviceId, conflictId]);
  }

  private async readStore<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.dbPromise;
    const transaction = db.transaction(storeName, "readonly");
    const value = await requestResult(transaction.objectStore(storeName).get(key));
    await transactionComplete(transaction);
    return value as T | undefined;
  }

  private async readAll<T>(storeName: string): Promise<T[]> {
    const db = await this.dbPromise;
    const transaction = db.transaction(storeName, "readonly");
    const value = await requestResult(transaction.objectStore(storeName).getAll());
    await transactionComplete(transaction);
    return value as T[];
  }
}

export { deleteFieldDatabase };

function scopedDatabaseName(technicianId: string, deviceId: string): string {
  return `sepsa-field-app-${encodeURIComponent(technicianId)}-${encodeURIComponent(deviceId)}`;
}

function toStoredOrder(order: WorkOrder, key: string): StoredOrderOrder {
  return { ...structuredClone(order), orderId: key, __orderId: order.orderId };
}

function fromStoredOrder(order: StoredOrderOrder | undefined): WorkOrder | undefined {
  if (!order) return undefined;
  if (!order.__orderId) return structuredClone(order);
  const { __orderId, ...domainOrder } = order;
  return { ...domainOrder, orderId: __orderId };
}

function toStoredEvidence(evidence: EvidenceReference, key: string): StoredEvidence {
  return { ...structuredClone(evidence), evidenceId: key, __evidenceId: evidence.evidenceId };
}

function toStoredEnvelope(envelope: WorkPackageEnvelope, key: string): StoredPackageEnvelope {
  return { ...structuredClone(envelope), packageId: key, __packageId: envelope.package.packageId };
}

function fromStoredEnvelope(envelope: StoredPackageEnvelope | undefined): WorkPackageEnvelope | undefined {
  if (!envelope) return undefined;
  if (!envelope.__packageId) return structuredClone(envelope);
  const { __packageId, ...domainEnvelope } = envelope;
  return { ...domainEnvelope, packageId: __packageId };
}

function toStoredConflict(conflict: ConflictRecord, key: string): StoredConflict {
  return { ...structuredClone(conflict), conflictId: key, __conflictId: conflict.conflictId };
}

function fromStoredConflict(conflict: StoredConflict): ConflictRecord {
  if (!conflict.__conflictId) return structuredClone(conflict);
  const { __conflictId, ...domainConflict } = conflict;
  return { ...domainConflict, conflictId: __conflictId };
}

function fromStoredEvidence(evidence: StoredEvidence): EvidenceReference {
  if (!evidence.__evidenceId) return structuredClone(evidence);
  const { __evidenceId, ...domainEvidence } = evidence;
  return { ...domainEvidence, evidenceId: __evidenceId };
}

function evidenceEquivalent(left: EvidenceReference, right: EvidenceReference): boolean {
  return left.evidenceId === right.evidenceId &&
    left.orderId === right.orderId &&
    left.operationId === right.operationId &&
    left.technicianId === right.technicianId &&
    left.deviceId === right.deviceId &&
    left.mimeType === right.mimeType &&
    left.width === right.width &&
    left.height === right.height &&
    left.optimized === right.optimized &&
    left.contentHash?.toLowerCase() === right.contentHash?.toLowerCase() &&
    left.content?.size === right.content?.size &&
    left.content?.type === right.content?.type;
}

function secureRandomUuid(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new Error("Secure lease token generation is unavailable.");
  return uuid;
}
