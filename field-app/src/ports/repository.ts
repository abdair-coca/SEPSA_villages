import type {
  OperationRecord,
  EvidenceReference,
  FieldCapture,
  VisitRecord,
  WorkPackage,
  WorkOrder,
} from "../domain";
import type { SyncItem } from "./sync";

export type StoredRecord = OperationRecord | VisitRecord;

export type CaptureDraftAction = "VISIT" | "CUT" | "RECONNECTION";

export interface CaptureDraftKey {
  technicianId: string;
  deviceId: string;
  orderId: string;
  action: CaptureDraftAction;
}

export type CaptureDraftContent = Partial<Pick<FieldCapture, "cutType" | "nearbyMeters">> & {
  reading?: Partial<FieldCapture["reading"]>;
  location?: Partial<FieldCapture["location"]>;
  evidence?: Array<File | Blob>;
  exceptionReason?: string;
  gpsExceptionReason?: string;
};

export interface CaptureDraft extends CaptureDraftKey {
  updatedAt: string;
  content: CaptureDraftContent;
}

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
  getCaptureDraft(key: CaptureDraftKey): Promise<CaptureDraft | undefined>;
  saveCaptureDraft(draft: CaptureDraft): Promise<void>;
  deleteCaptureDraft(key: CaptureDraftKey): Promise<void>;
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
  claimSync(operationId: string, owner: string, now: string, leaseMilliseconds: number, options?: { allowManualReview?: boolean }): Promise<SyncClaimResult>;
  recoverPhysicalUnknown(operationId: string, now: string, lease?: { owner: string; leaseToken: string }): Promise<StoredRecord | undefined>;
  updateSyncState(
    operationId: string,
    status: SyncItem["status"],
    options: { errorCode?: string; uncertain?: boolean; attempts?: number; owner: string; leaseToken: string; now: string; manualReview?: boolean; remoteConfirmed?: boolean },
  ): Promise<void>;
  recoverInFlight?(now?: string): Promise<void>;
  recordConflict?(conflict: ConflictRecord): Promise<void>;
  listConflicts?(): Promise<ConflictRecord[]>;
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
