import type {
  AssignOrderCommand,
  AuditEvent,
  CreateOrderCommand,
  CreateOrdersBatchCommand,
  CreateOrdersBatchResult,
  DebtorQuery,
  DebtorRecord,
  OperationRecord,
  VisitRecord,
  Session,
  TechnicianRecord,
  WorkOrder,
  WorkPackageEnvelope,
} from "../domain";
import type { RemoteResult } from "./authorization";

export interface TechnicalOrderAuthorizationInput {
  operationId: string;
  action?: "CUT" | "RECONNECTION";
  orderId: string;
  technicianId: string;
  deviceId: string;
  orderVersion: number;
  session: Session;
}

export type TechnicalOrderAuthorizationResult =
  | { status: "authorized"; order: WorkOrder }
  | { status: "not_authorized" | "unknown"; errorCode: string; order?: WorkOrder };

export interface OperationsAuthorityPort {
  findDebtors(query: DebtorQuery): Promise<DebtorRecord[]>;
  listTechnicians(session: Session): Promise<TechnicianRecord[]>;
  createOrder(input: CreateOrderCommand): Promise<WorkOrder>;
  createOrdersBatch(input: CreateOrdersBatchCommand): Promise<CreateOrdersBatchResult>;
  assignOrder(input: AssignOrderCommand): Promise<WorkOrder>;
  downloadAssigned(technicianId: string, deviceId: string, session?: Session): Promise<WorkPackageEnvelope>;
  recordSyncedOperation(operation: OperationRecord | VisitRecord, session: Session): Promise<void>;
  authorizeTechnicalOrder(input: TechnicalOrderAuthorizationInput): Promise<TechnicalOrderAuthorizationResult>;
  lookupSyncedOperation(operationId: string, session: Session, technicianId: string, deviceId: string): Promise<RemoteResult>;
  listOrders(session: Session): Promise<WorkOrder[]>;
  listAudit(query?: { orderId?: string; includeRejected?: boolean; session?: Session }): Promise<AuditEvent[]>;
}
