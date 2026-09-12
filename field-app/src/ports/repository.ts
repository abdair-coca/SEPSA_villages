import type {
  OperationRecord,
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
}

export type ClaimResult =
  | { status: "claimed"; record: StoredRecord; order?: WorkOrder }
  | { status: "existing"; record: StoredRecord; order?: WorkOrder }
  | { status: "order_conflict"; currentOrder: WorkOrder }
  | { status: "rejected"; reason: string; currentOrder?: WorkOrder };

export interface LocalRepository {
  loadAssignedPackage(): Promise<WorkPackage>;
  getRecord(operationId: string): Promise<StoredRecord | undefined>;
  /** Atomically claims operation id and order state using expected order version. */
  claimCut(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult>;
  /** Atomically claims a visit by operation id; omitted order means global claim without order CAS/write. */
  claimVisit(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<ClaimResult>;
  /** CAS update. Omitting change.order updates only record, never order. */
  updateOperationAndOrder(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<void>;
  listSyncItems(): Promise<SyncItem[]>;
}

export class OrderVersionConflictError extends Error {
  readonly code = "ORDER_VERSION_CONFLICT";

  constructor() {
    super("Order changed before local CAS update.");
    this.name = "OrderVersionConflictError";
  }
}
