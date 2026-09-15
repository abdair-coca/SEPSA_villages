import { assertOperationId, assertVisitEligible, createVisit, DomainError, validateEvidence, type EvidenceReference, type FieldCapture, type VisitRecord, type WorkOrder } from "../domain";
import type { AtomicOperationChange, LocalRepository, StoredRecord } from "../ports/repository";

export interface OfflineVisitInput {
  repository: LocalRepository;
  order: WorkOrder;
  operationId: string;
  technicianId: string;
  deviceId: string;
  attemptedAction?: "CUT" | "RECONNECTION";
  reason: string;
  exceptionReason?: string;
  evidence?: EvidenceReference;
  now: string;
  fieldCapture?: FieldCapture;
}

export type OfflineVisitResult = { outcome: "visit_recorded"; visit: VisitRecord } | { outcome: "duplicate"; visit: VisitRecord };

/** Persists a visit and its pending queue item in the repository's atomic transaction. */
export async function executeOfflineVisit(input: OfflineVisitInput): Promise<OfflineVisitResult> {
  assertOperationId(input.operationId);
  assertVisitEligible(input.order, input.technicianId);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) throw new DomainError("La visita debe incluir un motivo.", "VISIT_REASON_REQUIRED");
  if (input.evidence || input.exceptionReason !== undefined) {
    validateEvidence(input.evidence, input.exceptionReason, {
      orderId: input.order.orderId,
      operationId: input.operationId,
      technicianId: input.technicianId,
      deviceId: input.deviceId,
    });
  }

  const existing = await input.repository.getRecord(input.operationId);
  if (existing) {
    assertVisitBinding(existing, input);
    if (!isVisit(existing)) throw new Error("Operation identifier is already used by a physical operation.");
    return { outcome: "duplicate", visit: existing };
  }

  const visit = createVisit({
    operationId: input.operationId,
    orderId: input.order.orderId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
    action: input.attemptedAction,
    reason,
    exceptionReason: input.exceptionReason,
    recordedAt: input.now,
    evidenceRefs: input.evidence ? [input.evidence.evidenceId] : [],
    fieldCapture: input.fieldCapture,
  });
  const change: AtomicOperationChange = {
    visit,
    syncItem: {
      operationId: visit.operationId,
      action: "VISIT",
      orderId: visit.orderId,
      technicianId: visit.technicianId,
      deviceId: visit.deviceId,
      status: "pending",
      attempts: visit.attempts,
      fieldCapture: visit.fieldCapture,
    },
    evidence: input.evidence,
  };
  const result = await input.repository.claimVisit(change);
  if (result.status === "existing") {
    assertVisitBinding(result.record, input);
    if (!isVisit(result.record)) throw new Error("Operation identifier is already used by a physical operation.");
    return { outcome: "duplicate", visit: result.record };
  }
  if (result.status !== "claimed") throw new Error("Visit could not be persisted locally.");
  return { outcome: "visit_recorded", visit };
}

function isVisit(record: StoredRecord): record is VisitRecord {
  return record.kind === "VISIT" && "reason" in record;
}

function assertVisitBinding(record: StoredRecord, input: OfflineVisitInput): void {
  if (record.orderId !== input.order.orderId || record.technicianId !== input.technicianId || record.deviceId !== input.deviceId) {
    throw new Error("Operation identifier is bound to a different visit context.");
  }
}
