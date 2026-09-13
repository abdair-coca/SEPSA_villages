export type WorkOrderStatus = "GENERADO" | "EJECUTADO" | "RECONEXIÓN" | "ANULADO";
export type PhysicalStatus = "NONE" | "CLAIMED" | "CONFIRMED" | "PHYSICAL_UNKNOWN";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type ConnectivityMode = "online" | "weak" | "offline";

export interface WorkOrder {
  orderId: string;
  assignedTechnicianId: string;
  status: WorkOrderStatus;
  physicalStatus: PhysicalStatus;
  version?: number;
  cancellation?: CancellationDetails;
}

export interface CancellationDetails {
  reason: string;
  detectedAt: string;
}

export interface WorkPackage {
  packageId: string;
  technicianId: string;
  deviceId: string;
  version: number;
  downloadedAt: string;
  orders: WorkOrder[];
}

export type PackageValidationStatus = "SIMULATED_VALID" | "INVALID";

export interface WorkPackageEnvelope {
  packageId: string;
  package: WorkPackage;
  authenticity: "SIMULATED";
  integrity: "SIMULATED";
  validation: PackageValidationStatus;
  checksum: string;
}

export type VisitExecution = "NONE" | "CUT" | "RECONNECTION";

export interface VisitRecord {
  operationId: string;
  kind: "VISIT";
  orderId: string;
  technicianId: string;
  deviceId: string;
  action: "VISIT";
  attemptedAction: "CUT" | "RECONNECTION";
  execution: VisitExecution;
  reason: string;
  exceptionReason?: string;
  recordedAt: string;
  evidenceRefs: string[];
  attempts: number;
  errorCode?: string;
  syncStatus: SyncStatus;
}

export interface EvidenceReference {
  evidenceId: string;
  orderId: string;
  operationId: string;
  technicianId: string;
  deviceId: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  optimized: boolean;
  content?: Blob;
  contentHash?: string;
}

export interface OperationRecord {
  operationId: string;
  kind: "CUT" | "RECONNECTION" | "VISIT";
  action: "CUT" | "RECONNECTION";
  orderId: string;
  technicianId: string;
  deviceId: string;
  status: "INTENT_PERSISTED" | "CONFIRMED" | "BLOCKED" | "PHYSICAL_UNKNOWN" | "VISIT_RECORDED";
  physicalStatus: PhysicalStatus;
  syncStatus: SyncStatus;
  recordedAt: string;
  updatedAt: string;
  attempts: number;
  authorizationId?: string;
  exceptionReason?: string;
  cancellation?: CancellationDetails;
  evidenceRefs: string[];
  errorCode?: string;
}

export function generateOperationId(prefix = "operation"): string {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/i.test(prefix)) {
    throw new Error("Operation identifier prefix is invalid.");
  }
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (!randomUuid) {
    throw new Error("Secure operation identifier generation is unavailable.");
  }
  return `${prefix}-${randomUuid}`;
}
