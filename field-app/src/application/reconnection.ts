import {
  assertReconnectionEligible,
  assertOperationId,
  copyOrderWithPhysicalStatus,
  createVisit,
  DomainError,
  validateEvidence,
  type EvidenceReference,
  type OperationRecord,
  type VisitRecord,
  type WorkOrder,
} from "../domain";
import type { EnablementAdapter, EnablementGrant, EnablementResponse } from "../ports/authorization";
import type { AtomicOperationChange, ClaimResult, LocalRepository, StoredRecord } from "../ports/repository";

export interface ReconnectionProcessInput {
  repository: LocalRepository;
  enablement: EnablementAdapter;
  order: WorkOrder;
  operationId: string;
  technicianId: string;
  deviceId: string;
  now: string;
  evidence?: EvidenceReference;
  exceptionReason?: string;
}

export type ReconnectionResult =
  | { outcome: "visit_recorded"; visit: VisitRecord }
  | { outcome: "executed"; operation: OperationRecord }
  | { outcome: "physical_unknown"; operation: OperationRecord; lookupStatus: string }
  | { outcome: "recovery_required"; operation: OperationRecord; lookupStatus: string }
  | { outcome: "blocked"; reason: "NOT_ENABLED" | "ENABLEMENT_UNKNOWN" | "ENABLEMENT_EXPIRED"; operation?: OperationRecord }
  | { outcome: "duplicate"; operation: OperationRecord };

function uncertainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  const name = "name" in error ? error.name : undefined;
  return code === "TIMEOUT" || code === "RESPONSE_LOST" || code === "NETWORK_UNKNOWN" || name === "TimeoutError" || name === "ResponseLostError";
}

function versionOf(order: WorkOrder): number {
  if (order.version === undefined) throw new DomainError("Order version is required for atomic claims.", "ORDER_VERSION_REQUIRED");
  return order.version;
}

function claimedOrder(order: WorkOrder): WorkOrder {
  return { ...copyOrderWithPhysicalStatus(order, order.status, "CLAIMED"), version: versionOf(order) + 1 };
}

function visitChange(visit: VisitRecord, evidence?: EvidenceReference): AtomicOperationChange {
  return {
    visit,
    syncItem: {
      operationId: visit.operationId,
      status: visit.syncStatus,
      attempts: visit.attempts,
      action: "VISIT",
      orderId: visit.orderId,
      technicianId: visit.technicianId,
      deviceId: visit.deviceId,
      errorCode: visit.errorCode,
    },
    evidence,
  };
}

function operationChange(operation: OperationRecord, order?: WorkOrder, evidence?: EvidenceReference): AtomicOperationChange {
  return {
    operation,
    order,
    syncItem: {
      operationId: operation.operationId,
      status: operation.syncStatus,
      attempts: operation.attempts,
      action: operation.kind,
      orderId: operation.orderId,
      technicianId: operation.technicianId,
      deviceId: operation.deviceId,
      errorCode: operation.errorCode,
      uncertain: operation.physicalStatus === "PHYSICAL_UNKNOWN",
    },
    evidence,
  };
}

function makeVisit(input: ReconnectionProcessInput, reason: string, errorCode?: string): VisitRecord {
  return createVisit({
    operationId: input.operationId,
    orderId: input.order.orderId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
    action: "RECONNECTION",
    reason,
    recordedAt: input.now,
    evidenceRefs: input.evidence ? [input.evidence.evidenceId] : [],
    errorCode,
    exceptionReason: input.exceptionReason,
  });
}

function assertBinding(record: StoredRecord, input: ReconnectionProcessInput): void {
  if (
    record.orderId !== input.order.orderId ||
    record.technicianId !== input.technicianId ||
    record.deviceId !== input.deviceId ||
    (record.kind !== "RECONNECTION" && !(isVisitRecord(record) && record.attemptedAction === "RECONNECTION"))
  ) {
    throw new DomainError("Operation identifier is bound to a different reconnection context.", "OPERATION_BINDING_MISMATCH");
  }
}

function isVisitRecord(record: StoredRecord): record is VisitRecord {
  return record.kind === "VISIT" && "reason" in record;
}

async function lookupExisting(input: ReconnectionProcessInput, operation: OperationRecord): Promise<ReconnectionResult> {
  if (operation.status === "INTENT_PERSISTED" || operation.physicalStatus === "CLAIMED") {
    const currentOrder = await input.repository.getOrder(operation.orderId);
    if (!currentOrder || currentOrder.version === undefined) {
      throw new DomainError("Persisted reconnection recovery cannot prove current order version.", "ORDER_VERSION_REQUIRED");
    }
    const uncertainOperation: OperationRecord = {
      ...operation,
      status: "PHYSICAL_UNKNOWN",
      physicalStatus: "PHYSICAL_UNKNOWN",
      syncStatus: "failed",
      updatedAt: input.now,
      errorCode: "RECOVERY_REQUIRED",
    };
    const uncertainOrder: WorkOrder = {
      ...currentOrder,
      physicalStatus: "PHYSICAL_UNKNOWN",
      version: currentOrder.version + 1,
    };
    await input.repository.updateOperationAndOrder(
      operationChange(uncertainOperation, uncertainOrder),
      currentOrder.version,
    );
    const lookup = await input.enablement.lookup(operation.operationId);
    return { outcome: "physical_unknown", operation: uncertainOperation, lookupStatus: lookup.status };
  }
  const lookup = await input.enablement.lookup(operation.operationId);
  if (operation.physicalStatus === "PHYSICAL_UNKNOWN") {
    return { outcome: "physical_unknown", operation, lookupStatus: lookup.status };
  }
  return { outcome: "recovery_required", operation, lookupStatus: lookup.status };
}

function grantValid(grant: EnablementGrant, input: ReconnectionProcessInput): boolean {
  return (
    grant.orderId === input.order.orderId &&
    grant.technicianId === input.technicianId &&
    grant.deviceId === input.deviceId &&
    grant.operationId === input.operationId &&
    grant.version === input.order.version &&
    input.now < grant.expiresAt
  );
}

function responseReason(response: EnablementResponse): "NOT_ENABLED" | "ENABLEMENT_UNKNOWN" {
  return response.status === "not_enabled" ? "NOT_ENABLED" : "ENABLEMENT_UNKNOWN";
}

export async function executeReconnection(input: ReconnectionProcessInput): Promise<ReconnectionResult> {
  if (!input.operationId.trim()) throw new DomainError("Operation identifier is required.", "OPERATION_ID_REQUIRED");
  assertOperationId(input.operationId);
  const existing = await input.repository.getRecord(input.operationId);
  if (existing) {
    assertBinding(existing, input);
    if (isVisitRecord(existing)) return { outcome: "visit_recorded", visit: existing };
    if (existing.physicalStatus === "PHYSICAL_UNKNOWN" || existing.status === "INTENT_PERSISTED") return lookupExisting(input, existing);
    return { outcome: "duplicate", operation: existing };
  }

  assertReconnectionEligible(input.order, input.technicianId);
  validateEvidence(input.evidence, input.exceptionReason, {
    orderId: input.order.orderId,
    operationId: input.operationId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
  });
  let response: EnablementResponse;
  try {
    response = await input.enablement.requestReconnection({
      orderId: input.order.orderId,
      technicianId: input.technicianId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      orderVersion: input.order.version,
    });
  } catch (error) {
    if (!uncertainError(error)) throw error;
    return persistVisit(input, makeVisit(input, "ENABLEMENT_UNKNOWN", error instanceof Error && "code" in error ? String(error.code) : "ENABLEMENT_UNKNOWN"));
  }

  if (response.operationId !== input.operationId) {
    return persistVisit(input, makeVisit(input, "ENABLEMENT_UNKNOWN", "ENABLEMENT_OPERATION_ID_MISMATCH"));
  }

  if (response.status !== "enabled" || !response.grant) {
    const reason = responseReason(response);
    return persistVisit(input, makeVisit(input, reason, response.errorCode));
  }
  if (!grantValid(response.grant, input)) {
    return persistVisit(input, makeVisit(input, "ENABLEMENT_EXPIRED", "ENABLEMENT_EXPIRED"));
  }

  const intent: OperationRecord = {
    operationId: input.operationId,
    kind: "RECONNECTION",
    action: "RECONNECTION",
    orderId: input.order.orderId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
    status: "INTENT_PERSISTED",
    physicalStatus: "CLAIMED",
    syncStatus: "pending",
    recordedAt: input.now,
    updatedAt: input.now,
    attempts: 0,
    authorizationId: response.grant.enablementId,
    evidenceRefs: input.evidence ? [input.evidence.evidenceId] : [],
  };
  const claim = input.repository.claimReconnection
    ? await input.repository.claimReconnection(operationChange(intent, claimedOrder(input.order), input.evidence), versionOf(input.order))
    : await input.repository.claimCut(operationChange(intent, claimedOrder(input.order), input.evidence), versionOf(input.order));
  if (claim.status === "existing") {
    assertBinding(claim.record, input);
    if (isVisitRecord(claim.record)) return { outcome: "visit_recorded", visit: claim.record };
    return lookupExisting(input, claim.record);
  }
  if (claim.status !== "claimed" || !claim.order) {
    return persistVisit(input, makeVisit(input, "ORDER_CLAIM_CONFLICT", "ORDER_VERSION_CONFLICT"));
  }

  let consumed;
  try {
    consumed = await input.enablement.consumeReconnection({
      enablementId: response.grant.enablementId,
      token: response.grant.token,
      orderId: input.order.orderId,
      technicianId: input.technicianId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      version: response.grant.version,
    });
  } catch (error) {
    if (!uncertainError(error)) throw error;
    return persistUnknown(input, intent, claim.order, error instanceof Error && "code" in error ? String(error.code) : "RESPONSE_UNKNOWN");
  }

  if (consumed.operationId !== input.operationId) {
    return persistUnknown(input, intent, claim.order, "CONSUME_OPERATION_ID_MISMATCH");
  }

  if (consumed.status === "unknown" || consumed.status === "already_consumed") {
    return persistUnknown(input, intent, claim.order, consumed.errorCode ?? "RESPONSE_UNKNOWN");
  }
  if (consumed.status === "not_enabled") {
    const blocked: OperationRecord = { ...intent, status: "BLOCKED", physicalStatus: "NONE", updatedAt: input.now, errorCode: consumed.errorCode ?? "NOT_ENABLED" };
    const released = { ...copyOrderWithPhysicalStatus(claim.order, "EJECUTADO", "NONE"), version: versionOf(claim.order) + 1 };
    await input.repository.updateOperationAndOrder(operationChange(blocked, released, input.evidence), versionOf(claim.order));
    return { outcome: "blocked", reason: "NOT_ENABLED", operation: blocked };
  }

  const executed: OperationRecord = { ...intent, status: "CONFIRMED", physicalStatus: "CONFIRMED", updatedAt: input.now };
  const finished = { ...copyOrderWithPhysicalStatus(claim.order, "RECONEXIÓN", "CONFIRMED"), version: versionOf(claim.order) + 1 };
  await input.repository.updateOperationAndOrder(operationChange(executed, finished, input.evidence), versionOf(claim.order));
  return { outcome: "executed", operation: executed };
}

async function persistVisit(input: ReconnectionProcessInput, visit: VisitRecord): Promise<ReconnectionResult> {
  const result = await input.repository.claimVisit(visitChange(visit, input.evidence));
  if (result.status === "existing") {
    assertBinding(result.record, input);
    if (isVisitRecord(result.record)) return { outcome: "visit_recorded", visit: result.record };
    throw new DomainError("Operation identifier is already used by a reconnection.", "OPERATION_BINDING_MISMATCH");
  }
  if (result.status !== "claimed") throw new DomainError("Visit could not be persisted.", "VISIT_CLAIM_REJECTED");
  return { outcome: "visit_recorded", visit };
}

async function persistUnknown(
  input: ReconnectionProcessInput,
  intent: OperationRecord,
  claimed: WorkOrder,
  errorCode: string,
): Promise<ReconnectionResult> {
  const operation = { ...intent, status: "PHYSICAL_UNKNOWN" as const, physicalStatus: "PHYSICAL_UNKNOWN" as const, syncStatus: "failed" as const, updatedAt: input.now, errorCode };
  const order = { ...copyOrderWithPhysicalStatus(claimed, "EJECUTADO", "PHYSICAL_UNKNOWN"), version: versionOf(claimed) + 1 };
  await input.repository.updateOperationAndOrder(operationChange(operation, order, input.evidence), versionOf(claimed));
  const lookup = await input.enablement.lookup(input.operationId);
  return { outcome: "physical_unknown", operation, lookupStatus: lookup.status };
}

export const processReconnection = executeReconnection;
