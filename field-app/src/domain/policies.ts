import { DomainError } from "./errors";
import type {
  EvidenceReference,
  OperationRecord,
  PhysicalStatus,
  VisitRecord,
  WorkOrder,
} from "./types";

export function assertAssignedOrder(order: WorkOrder, technicianId: string): void {
  if (order.assignedTechnicianId !== technicianId) {
    throw new DomainError("Order is not assigned to this technician.", "ORDER_NOT_ASSIGNED");
  }
}

export function assertCutEligible(order: WorkOrder, technicianId: string): void {
  assertAssignedOrder(order, technicianId);
  if (order.status !== "GENERADO") {
    throw new DomainError("Order is not ready for a cut.", "ORDER_STATUS_INVALID");
  }
  if (order.physicalStatus !== "NONE") {
    throw new DomainError("Order already has a physical cut claim.", "CUT_ALREADY_CLAIMED");
  }
}

export function assertReconnectionEligible(order: WorkOrder, technicianId: string): void {
  assertAssignedOrder(order, technicianId);
  if (order.status !== "EJECUTADO") {
    throw new DomainError("Order is not ready for reconnection.", "ORDER_NOT_EXECUTED");
  }
  if (order.physicalStatus !== "CONFIRMED") {
    throw new DomainError("Cut physical status is not confirmed.", "CUT_STATUS_INVALID");
  }
}

export function validateEvidence(
  evidence: EvidenceReference | undefined,
  exceptionReason?: string,
  binding?: { orderId: string; operationId: string; technicianId?: string; deviceId?: string },
): { valid: true; requiresOptimization: boolean } {
  if (!evidence) {
    if (!exceptionReason?.trim()) {
      throw new DomainError("Photo evidence or a justified exception is required.", "EVIDENCE_REQUIRED");
    }
    return { valid: true, requiresOptimization: false };
  }

  if (!Number.isFinite(evidence.width) || !Number.isFinite(evidence.height)) {
    throw new DomainError("Evidence dimensions must be finite.", "EVIDENCE_DIMENSIONS_INVALID");
  }
  if (evidence.width <= 0 || evidence.height <= 0) {
    throw new DomainError("Evidence dimensions must be positive.", "EVIDENCE_DIMENSIONS_INVALID");
  }
  if (typeof evidence.evidenceId !== "string" || !evidence.evidenceId.trim()) {
    throw new DomainError("Evidence identifier is required.", "EVIDENCE_ID_REQUIRED");
  }
  if (
    !binding ||
    evidence.orderId !== binding.orderId ||
    evidence.operationId !== binding.operationId ||
    (binding.technicianId !== undefined && evidence.technicianId !== binding.technicianId) ||
    (binding.deviceId !== undefined && evidence.deviceId !== binding.deviceId)
  ) {
    throw new DomainError("Evidence is bound to a different operation.", "EVIDENCE_BINDING_MISMATCH");
  }
  if (evidence.mimeType !== "image/jpeg" && evidence.mimeType !== "image/png") {
    throw new DomainError("Evidence must be a JPEG or PNG image.", "EVIDENCE_FORMAT_INVALID");
  }
  if (evidence.optimized !== true || evidence.width * evidence.height > 5_000_000) {
    throw new DomainError("Evidence must already be optimized to five megapixels or less.", "EVIDENCE_NOT_OPTIMIZED");
  }

  return {
    valid: true,
    requiresOptimization: false,
  };
}

export function nextOrderState(
  current: WorkOrder["status"],
  next: WorkOrder["status"],
): WorkOrder["status"] {
  const allowed: Record<WorkOrder["status"], WorkOrder["status"][]> = {
    GENERADO: ["EJECUTADO", "ANULADO"],
    EJECUTADO: ["RECONEXIÓN"],
    RECONEXIÓN: [],
    ANULADO: [],
  };
  if (!allowed[current].includes(next)) {
    throw new DomainError(`Invalid order transition from ${current} to ${next}.`, "ORDER_TRANSITION_INVALID");
  }
  return next;
}

export function assertHistoricalOperationImmutable(
  previous: OperationRecord,
  replacement: OperationRecord,
): void {
  const immutableFields: (keyof OperationRecord)[] = [
    "operationId",
    "kind",
    "action",
    "orderId",
    "technicianId",
    "deviceId",
    "recordedAt",
  ];
  for (const field of immutableFields) {
    if (previous[field] !== replacement[field]) {
      throw new DomainError("Historical operation identity cannot be changed.", "OPERATION_IMMUTABLE");
    }
  }
}

export function createVisit(input: {
  operationId: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  reason: string;
  action?: "CUT" | "RECONNECTION";
  recordedAt: string;
  evidenceRefs?: string[];
  attempts?: number;
  errorCode?: string;
  exceptionReason?: string;
}): VisitRecord {
  if (!input.operationId.trim()) {
    throw new DomainError("Operation identifier is required.", "OPERATION_ID_REQUIRED");
  }
  return {
    operationId: input.operationId,
    kind: "VISIT",
    orderId: input.orderId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
    action: "VISIT",
    attemptedAction: input.action ?? "CUT",
    execution: "NONE",
    reason: input.reason,
    exceptionReason: input.exceptionReason,
    recordedAt: input.recordedAt,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    attempts: input.attempts ?? 1,
    errorCode: input.errorCode,
    syncStatus: "pending",
  };
}

const OPERATION_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertOperationId(operationId: string): void {
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw new DomainError("Operation identifier must contain a prefix and UUID.", "OPERATION_ID_INVALID");
  }
}

export function copyOrderWithPhysicalStatus(
  order: WorkOrder,
  status: WorkOrder["status"],
  physicalStatus: PhysicalStatus,
): WorkOrder {
  return { ...order, status, physicalStatus };
}

export function copyOrderAsCancelled(
  order: WorkOrder,
  cancellation: { reason: string; detectedAt: string },
): WorkOrder {
  return {
    ...order,
    status: "ANULADO",
    physicalStatus: "NONE",
    version: order.version === undefined ? undefined : order.version + 1,
    cancellation: { ...cancellation },
  };
}
