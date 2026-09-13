import { DomainError } from "./errors";
import type {
  EvidenceReference,
  FieldCapture,
  OperationRecord,
  PhysicalStatus,
  AuthorizedAction,
  Role,
  Session,
  VisitRecord,
  WorkOrder,
} from "./types";

const ROLE_PERMISSIONS: Record<Role, AuthorizedAction[]> = {
  ADMIN: ["FIND_DEBTORS", "CREATE_ORDER", "ASSIGN_ORDER", "VIEW_ORDERS", "VIEW_AUDIT"],
  TECHNICIAN: ["DOWNLOAD_ASSIGNED", "SYNC_OPERATION"],
};

export function permissionsForRole(role: Role): AuthorizedAction[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function assertRecognizedRole(role: string): asserts role is Role {
  if (role !== "ADMIN" && role !== "TECHNICIAN") {
    throw new DomainError("User role is not recognized.", "ROLE_NOT_RECOGNIZED");
  }
}

export function assertCan(session: Session, action: AuthorizedAction): void {
  assertRecognizedRole(session.role);
  if (!ROLE_PERMISSIONS[session.role].includes(action) || !session.permissions.includes(action)) {
    throw new DomainError("This role cannot perform the requested action.", "FORBIDDEN");
  }
}

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

export function validateFieldCapture(capture: FieldCapture | undefined, expectedMeterId?: string): void {
  if (!capture) {
    throw new DomainError("La captura de campo es obligatoria para confirmar el corte.", "FIELD_CAPTURE_REQUIRED");
  }

  if (!capture.reading) {
    throw new DomainError("La lectura final del medidor es obligatoria.", "METER_READING_REQUIRED");
  }
  if (capture.reading.status !== "CAPTURED" || !Number.isFinite(capture.reading.value) || (capture.reading.value ?? 0) < 0) {
    throw new DomainError("La lectura final del medidor es obligatoria.", "METER_READING_REQUIRED");
  }
  if (!capture.reading.meterId.trim() || capture.reading.unit !== "kWh") {
    throw new DomainError("La lectura debe estar asociada a un medidor en kWh.", "METER_READING_INVALID");
  }
  if (expectedMeterId !== undefined && capture.reading.meterId !== expectedMeterId) {
    throw new DomainError("La lectura corresponde a un medidor diferente.", "METER_READING_MISMATCH");
  }

  if (capture.location.status === "CAPTURED") {
    if (!Number.isFinite(capture.location.latitude) || !Number.isFinite(capture.location.longitude)) {
      throw new DomainError("Las coordenadas GPS no son válidas.", "GPS_COORDINATES_INVALID");
    }
    if ((capture.location.latitude ?? 0) < -90 || (capture.location.latitude ?? 0) > 90 || (capture.location.longitude ?? 0) < -180 || (capture.location.longitude ?? 0) > 180) {
      throw new DomainError("Las coordenadas GPS están fuera de rango.", "GPS_COORDINATES_INVALID");
    }
    const accuracyMeters = capture.location.accuracyMeters;
    if (!Number.isFinite(accuracyMeters) || (accuracyMeters ?? 0) < 0) {
      throw new DomainError("La precisión GPS no es válida.", "GPS_ACCURACY_INVALID");
    }
  } else if (capture.location.status === "BYPASSED" && capture.location.exceptionReason?.trim()) {
    // GPS bypass is explicit and auditable; precision thresholds remain pending validation with SEPSA.
  } else {
    throw new DomainError("Capture GPS o registre una excepción justificada.", "GPS_REQUIRED");
  }

  if (!["RED", "MEDIDOR", "BARRAS", "PROTECCION", "ACOMETIDA", "FUSIBLES"].includes(capture.cutType)) {
    throw new DomainError("El tipo de corte no pertenece al catálogo confirmado.", "CUT_TYPE_INVALID");
  }
  if (typeof capture.nearbyMeters !== "boolean") {
    throw new DomainError("Debe indicar si existen medidores cercanos.", "NEARBY_METERS_REQUIRED");
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
  if (evidence.content !== undefined && (typeof Blob === "undefined" || !(evidence.content instanceof Blob))) {
    throw new DomainError("Evidence content must be a Blob.", "EVIDENCE_CONTENT_INVALID");
  }
  if (evidence.contentHash !== undefined && !/^[a-f0-9]{64}$/i.test(evidence.contentHash)) {
    throw new DomainError("Evidence content hash must be SHA-256.", "EVIDENCE_HASH_INVALID");
  }
  if (evidence.contentHash !== undefined && evidence.content === undefined) {
    throw new DomainError("Evidence content is required with its hash.", "EVIDENCE_CONTENT_REQUIRED");
  }
  if (evidence.content !== undefined && !evidence.contentHash) {
    throw new DomainError("Evidence content hash is required for stored content.", "EVIDENCE_HASH_REQUIRED");
  }
  if (evidence.content && evidence.content.type && evidence.content.type !== evidence.mimeType) {
    throw new DomainError("Evidence content type does not match its metadata.", "EVIDENCE_CONTENT_TYPE_INVALID");
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
  fieldCapture?: FieldCapture;
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
    fieldCapture: input.fieldCapture,
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
