import type {
  OperationRecord,
  EvidenceReference,
  VisitRecord,
  WorkPackage,
  WorkOrder,
} from "../domain";
import type { SyncItem } from "./sync";

export type StoredRecord = OperationRecord | VisitRecord;

export interface AtomicOperationChange {
  operation?: OperationRecord;
  visit?: VisitRecord;
  order?: WorkOrder;
  syncItem: SyncItem;
  evidence?: EvidenceReference;
}

export type ClaimResult =
  | { status: "claimed"; record: StoredRecord; order?: WorkOrder }
  | { status: "existing"; record: StoredRecord; order?: WorkOrder }
  | { status: "order_conflict"; currentOrder: WorkOrder }
  | { status: "rejected"; reason: string; currentOrder?: WorkOrder };

export interface LocalRepository {
  loadAssignedPackage(): Promise<WorkPackage>;
  getOrder(orderId: string): Promise<WorkOrder | undefined>;
  getRecord(operationId: string): Promise<StoredRecord | undefined>;
  /** Atomically claims operation id and order state using expected order version. */
  claimCut(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult>;
  /** Same atomic claim as a cut, but for a reconnection action. */
  claimReconnection?(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult>;
  /** Atomically claims a visit by operation id; omitted order means global claim without order CAS/write. */
  claimVisit(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<ClaimResult>;
  /** CAS update. Omitting change.order updates only record, never order. */
  updateOperationAndOrder(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<void>;
  listSyncItems(): Promise<SyncItem[]>;
  getEvidence?(evidenceId: string): Promise<EvidenceReference | undefined>;
  claimSync(operationId: string, owner: string, now: string, leaseMilliseconds: number): Promise<SyncClaimResult>;
  recoverPhysicalUnknown(operationId: string, now: string, lease?: { owner: string; leaseToken: string }): Promise<StoredRecord | undefined>;
  updateSyncState(
    operationId: string,
    status: SyncItem["status"],
    options: { errorCode?: string; uncertain?: boolean; attempts?: number; owner: string; leaseToken: string; now: string; manualReview?: boolean },
  ): Promise<void>;
  recoverInFlight?(now?: string): Promise<void>;
  recordConflict?(conflict: ConflictRecord): Promise<void>;
  recordConflictAndFail(conflict: ConflictRecord, operationId: string, owner: string, leaseToken: string, now: string): Promise<void>;
}

export type SyncClaimResult =
  | { status: "claimed"; item: SyncItem }
  | { status: "busy"; item: SyncItem }
  | { status: "skipped"; item: SyncItem }
  | { status: "not_found" };

export interface ConflictRecord {
  conflictId: string;
  operationId: string;
  detectedAt: string;
  local: unknown;
  remote: unknown;
  reason: string;
  technicianId?: string;
  deviceId?: string;
}

export class OrderVersionConflictError extends Error {
  readonly code = "ORDER_VERSION_CONFLICT";

  constructor() {
    super("Order changed before local CAS update.");
    this.name = "OrderVersionConflictError";
  }
}
