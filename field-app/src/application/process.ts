import {
  assertCutEligible,
  assertOperationId,
  copyOrderAsCancelled,
  copyOrderWithPhysicalStatus,
  createVisit,
  DomainError,
  validateEvidence,
  type CancellationDetails,
  type EvidenceReference,
  type OperationRecord,
  type VisitRecord,
  type WorkOrder,
} from "../domain";
import type {
  AuthorizationAdapter,
  AuthorizationGrant,
  AuthResponse,
  ConsumeResponse,
} from "../ports/authorization";
import type {
  AtomicOperationChange,
  ClaimResult,
  LocalRepository,
  StoredRecord,
} from "../ports/repository";
import { OrderVersionConflictError } from "../ports/repository";

export interface CutProcessInput {
  repository: LocalRepository;
  authorization: AuthorizationAdapter;
  order: WorkOrder;
  operationId: string;
  technicianId: string;
  deviceId: string;
  now: string;
  evidence?: EvidenceReference;
  exceptionReason?: string;
}

export type CutBlockReason =
  | "AUTHORIZATION_TIMEOUT"
  | "AUTHORIZATION_UNKNOWN"
  | "NOT_AUTHORIZED"
  | "PAYMENT_DETECTED"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "AUTHORIZATION_CONSUMPTION_UNKNOWN"
  | "AUTHORIZATION_EXPIRED"
  | "ORDER_CLAIM_CONFLICT";

export type CutProcessResult =
  | { outcome: "visit_recorded"; visit: VisitRecord; order?: WorkOrder }
  | { outcome: "executed"; operation: OperationRecord }
  | { outcome: "physical_unknown"; operation: OperationRecord; lookupStatus: string }
  | { outcome: "recovery_required"; operation: OperationRecord; lookupStatus: string }
  | { outcome: "blocked"; reason: CutBlockReason; operation?: OperationRecord }
  | { outcome: "duplicate"; operation: OperationRecord };

function uncertainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  const name = "name" in error ? error.name : undefined;
  const message = "message" in error ? error.message : undefined;
  return (
    code === "TIMEOUT" ||
    code === "RESPONSE_LOST" ||
    code === "NETWORK_UNKNOWN" ||
    name === "TimeoutError" ||
    name === "ResponseLostError" ||
    (typeof message === "string" && /timeout|network|offline|unknown|response.*lost/i.test(message))
  );
}

function operationChange(
  operation: OperationRecord,
  order: WorkOrder | undefined,
  evidence?: EvidenceReference,
): AtomicOperationChange {
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

function visitChange(visit: VisitRecord, order?: WorkOrder, evidence?: EvidenceReference): AtomicOperationChange {
  return {
    visit,
    order,
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

function createIntent(
  input: CutProcessInput,
  grant: AuthorizationGrant,
  evidenceRefs: string[],
): OperationRecord {
  return {
    operationId: input.operationId,
    kind: "CUT",
    action: "CUT",
    orderId: input.order.orderId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
    status: "INTENT_PERSISTED",
    physicalStatus: "CLAIMED",
    syncStatus: "pending",
    recordedAt: input.now,
    updatedAt: input.now,
    attempts: 0,
    authorizationId: grant.authorizationId,
    exceptionReason: input.exceptionReason,
    evidenceRefs,
  };
}

function createVisitFor(
  input: CutProcessInput,
  reason: CutBlockReason,
  errorCode?: string,
): VisitRecord {
  return createVisit({
    operationId: input.operationId,
    orderId: input.order.orderId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
    reason,
    recordedAt: input.now,
    evidenceRefs: input.evidence ? [input.evidence.evidenceId] : [],
    exceptionReason: input.exceptionReason,
    errorCode,
  });
}

function responseBlockReason(response: AuthResponse): CutBlockReason {
  switch (response.status) {
    case "payment_detected":
      return "PAYMENT_DETECTED";
    case "not_authorized":
      return "NOT_AUTHORIZED";
    default:
      return "AUTHORIZATION_UNKNOWN";
  }
}

function grantIsValid(grant: AuthorizationGrant, input: CutProcessInput): boolean {
  return (
    grant.orderId === input.order.orderId &&
    grant.technicianId === input.technicianId &&
    grant.deviceId === input.deviceId &&
    grant.operationId === input.operationId &&
    grant.version === input.order.version &&
    input.now < grant.expiresAt
  );
}

function assertReplayBinding(existing: StoredRecord, input: CutProcessInput): void {
  const validKind = existing.kind === "CUT" || (isVisit(existing) && existing.attemptedAction === "CUT");
  if (
    existing.orderId !== input.order.orderId ||
    existing.technicianId !== input.technicianId ||
    existing.deviceId !== input.deviceId ||
    !validKind
  ) {
    throw new DomainError(
      "Operation identifier is bound to a different cut context.",
      "OPERATION_BINDING_MISMATCH",
    );
  }
}

function paymentDetails(
  payment: { reason: string; detectedAt: string } | undefined,
  fallbackReason: string | undefined,
  now: string,
): CancellationDetails {
  return {
    reason: payment?.reason || fallbackReason || "PAYMENT_DETECTED",
    detectedAt: payment?.detectedAt || now,
  };
}

function requireOrderVersion(order: WorkOrder): number {
  if (order.version === undefined) {
    throw new DomainError("Order version is required for atomic claims.", "ORDER_VERSION_REQUIRED");
  }
  return order.version;
}

function claimOrder(order: WorkOrder, status: WorkOrder["status"], physicalStatus: WorkOrder["physicalStatus"]): WorkOrder {
  const version = requireOrderVersion(order);
  return {
    ...copyOrderWithPhysicalStatus(order, status, physicalStatus),
    version: version + 1,
  };
}

function isVisit(record: StoredRecord): record is VisitRecord {
  return record.kind === "VISIT" && "reason" in record;
}

function claimedVisitResult(result: ClaimResult, input: CutProcessInput): CutProcessResult {
  if (result.status === "order_conflict") {
    throw new DomainError("Order changed before visit could be recorded.", "ORDER_VERSION_CONFLICT");
  }
  if (result.status === "rejected") {
    throw new DomainError(result.reason, "VISIT_CLAIM_REJECTED");
  }
  assertReplayBinding(result.record, input);
  if (!isVisit(result.record)) {
    throw new DomainError("Operation identifier is already used by a cut.", "OPERATION_BINDING_MISMATCH");
  }
  return { outcome: "visit_recorded", visit: result.record, order: result.order };
}

async function recordVisit(
  input: CutProcessInput,
  visit: VisitRecord,
  order?: WorkOrder,
  expectedOrderVersion = order?.version,
): Promise<CutProcessResult> {
  const result = await input.repository.claimVisit(visitChange(visit, order, input.evidence), expectedOrderVersion);
  return claimedVisitResult(result, input);
}

async function recordPaymentDetected(
  input: CutProcessInput,
  payment: CancellationDetails,
): Promise<CutProcessResult> {
  const visit = createVisitFor(input, "PAYMENT_DETECTED", payment.reason);
  const cancelledOrder = copyOrderAsCancelled(input.order, payment);
  const result = await input.repository.claimVisit(
    visitChange(visit, cancelledOrder, input.evidence),
    requireOrderVersion(input.order),
  );
  if (result.status === "order_conflict") {
    return recordVisit(
      input,
      { ...visit, errorCode: "ORDER_VERSION_CONFLICT" },
    );
  }
  return claimedVisitResult(result, input);
}

async function recoverExisting(
  input: CutProcessInput,
  existing: OperationRecord,
): Promise<CutProcessResult> {
  if (existing.status === "INTENT_PERSISTED" || existing.physicalStatus === "CLAIMED") {
    const currentOrder = await input.repository.getOrder(existing.orderId);
    if (!currentOrder || currentOrder.version === undefined) {
      throw new DomainError("Persisted cut recovery cannot prove current order version.", "ORDER_VERSION_REQUIRED");
    }
    const uncertainOperation: OperationRecord = {
      ...existing,
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
    const lookup = await input.authorization.lookup(existing.operationId);
    return { outcome: "physical_unknown", operation: uncertainOperation, lookupStatus: lookup.status };
  }
  const lookup = await input.authorization.lookup(existing.operationId);
  if (existing.physicalStatus === "PHYSICAL_UNKNOWN") {
    return { outcome: "physical_unknown", operation: existing, lookupStatus: lookup.status };
  }
  return { outcome: "recovery_required", operation: existing, lookupStatus: lookup.status };
}

async function recordPhysicalUnknown(
  input: CutProcessInput,
  intent: OperationRecord,
  claimedOrder: WorkOrder,
  errorCode: string,
): Promise<CutProcessResult> {
  const uncertainOperation: OperationRecord = {
    ...intent,
    status: "PHYSICAL_UNKNOWN",
    physicalStatus: "PHYSICAL_UNKNOWN",
    syncStatus: "failed",
    updatedAt: input.now,
    errorCode,
  };
  const uncertainOrder = claimOrder(claimedOrder, claimedOrder.status, "PHYSICAL_UNKNOWN");
  await input.repository.updateOperationAndOrder(
    operationChange(uncertainOperation, uncertainOrder, input.evidence),
    requireOrderVersion(claimedOrder),
  );
  const lookup = await input.authorization.lookup(input.operationId);
  return {
    outcome: "physical_unknown",
    operation: uncertainOperation,
    lookupStatus: lookup.status,
  };
}

function handleClaimResult(
  result: ClaimResult,
  input: CutProcessInput,
): { kind: "claimed"; order: WorkOrder } | { kind: "existing"; record: StoredRecord } | { kind: "conflict"; order: WorkOrder } {
  if (result.status === "claimed") {
    if (!result.order) throw new DomainError("Cut claim did not return claimed order.", "ORDER_CLAIM_REJECTED");
    return { kind: "claimed", order: result.order };
  }
  if (result.status === "existing") {
    assertReplayBinding(result.record, input);
    return { kind: "existing", record: result.record };
  }
  if (result.status === "order_conflict" || result.status === "rejected") {
    if (!result.currentOrder) throw new DomainError(result.status, "ORDER_CLAIM_REJECTED");
    return { kind: "conflict", order: result.currentOrder };
  }
  throw new DomainError("Unknown claim result.", "ORDER_CLAIM_REJECTED");
}

function isOrderVersionConflict(error: unknown): boolean {
  return error instanceof OrderVersionConflictError || (
    error instanceof Error && error.message === "CAS order version mismatch"
  );
}

export async function executeCut(input: CutProcessInput): Promise<CutProcessResult> {
  if (!input.operationId.trim()) throw new DomainError("Operation identifier is required.", "OPERATION_ID_REQUIRED");
  assertOperationId(input.operationId);

  const existing = await input.repository.getRecord(input.operationId);
  if (existing) {
    assertReplayBinding(existing, input);
    if (isVisit(existing)) return { outcome: "visit_recorded", visit: existing };
    if (existing.status === "INTENT_PERSISTED" || existing.physicalStatus === "CLAIMED") {
      return recoverExisting(input, existing);
    }
    if (existing.physicalStatus === "PHYSICAL_UNKNOWN") {
      return recoverExisting(input, existing);
    }
    return { outcome: "duplicate", operation: existing };
  }

  validateEvidence(input.evidence, input.exceptionReason, {
    orderId: input.order.orderId,
    operationId: input.operationId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
  });
  assertCutEligible(input.order, input.technicianId);
  const expectedOrderVersion = requireOrderVersion(input.order);

  let authorizationResponse: AuthResponse;
  try {
    authorizationResponse = await input.authorization.requestCut({
      orderId: input.order.orderId,
      technicianId: input.technicianId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      orderVersion: input.order.version,
    });
  } catch (error) {
    if (!uncertainError(error)) throw error;
    const visit = createVisitFor(
      input,
      error instanceof Error && error.name === "TimeoutError" ? "AUTHORIZATION_TIMEOUT" : "AUTHORIZATION_UNKNOWN",
      error instanceof Error && "code" in error ? String(error.code) : "AUTHORIZATION_UNKNOWN",
    );
    return recordVisit(input, visit);
  }

  if (authorizationResponse.operationId !== input.operationId) {
    return recordVisit(input, createVisitFor(input, "AUTHORIZATION_UNKNOWN", "AUTHORIZATION_OPERATION_ID_MISMATCH"));
  }

  if (authorizationResponse.status !== "authorized" || !authorizationResponse.grant) {
    const reason = responseBlockReason(authorizationResponse);
    if (reason === "PAYMENT_DETECTED") {
      return recordPaymentDetected(
        input,
        paymentDetails(authorizationResponse.payment, authorizationResponse.errorCode, input.now),
      );
    }
    const visit = createVisitFor(input, reason, authorizationResponse.errorCode);
    return recordVisit(input, visit);
  }

  if (!grantIsValid(authorizationResponse.grant, input)) {
    const visit = createVisitFor(input, "AUTHORIZATION_EXPIRED");
    return recordVisit(input, visit);
  }

  const intent = createIntent(
    input,
    authorizationResponse.grant,
    input.evidence ? [input.evidence.evidenceId] : [],
  );
  const claim = await input.repository.claimCut(
    operationChange(intent, claimOrder(input.order, "GENERADO", "CLAIMED"), input.evidence),
    expectedOrderVersion,
  );
  const claimState = handleClaimResult(claim, input);
  if (claimState.kind === "existing") {
    if (isVisit(claimState.record)) return { outcome: "visit_recorded", visit: claimState.record };
    if (claimState.record.status === "INTENT_PERSISTED" || claimState.record.physicalStatus === "CLAIMED") {
      return recoverExisting(input, claimState.record);
    }
    return { outcome: "duplicate", operation: claimState.record };
  }
  if (claimState.kind === "conflict") {
    const visit = createVisitFor(input, "ORDER_CLAIM_CONFLICT", "ORDER_VERSION_CONFLICT");
    return recordVisit(input, visit);
  }

  const claimedOrder = claimState.order;
  let consumeResponse: ConsumeResponse;
  try {
    consumeResponse = await input.authorization.consumeCut({
      authorizationId: authorizationResponse.grant.authorizationId,
      token: authorizationResponse.grant.token,
      orderId: input.order.orderId,
      technicianId: input.technicianId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      version: authorizationResponse.grant.version,
    });
  } catch (error) {
    if (!uncertainError(error)) throw error;
    const errorCode = error instanceof Error && "code" in error ? String(error.code) : "RESPONSE_UNKNOWN";
    return recordPhysicalUnknown(input, intent, claimedOrder, errorCode);
  }

  if (consumeResponse.operationId !== input.operationId) {
    return recordPhysicalUnknown(input, intent, claimedOrder, "CONSUME_OPERATION_ID_MISMATCH");
  }

  if (consumeResponse.status === "unknown") {
    return recordPhysicalUnknown(input, intent, claimedOrder, consumeResponse.errorCode ?? "RESPONSE_UNKNOWN");
  }

  if (consumeResponse.status === "payment_detected") {
    const payment = paymentDetails(consumeResponse.payment, consumeResponse.errorCode, input.now);
    const blockedOperation: OperationRecord = {
      ...intent,
      status: "BLOCKED",
      physicalStatus: "NONE",
      updatedAt: input.now,
      errorCode: payment.reason,
      cancellation: payment,
    };
    await input.repository.updateOperationAndOrder(
      operationChange(blockedOperation, copyOrderAsCancelled(claimedOrder, payment), input.evidence),
      requireOrderVersion(claimedOrder),
    );
    return { outcome: "blocked", reason: "PAYMENT_DETECTED", operation: blockedOperation };
  }

  if (consumeResponse.status === "not_authorized") {
    const blockedOperation: OperationRecord = {
      ...intent,
      status: "BLOCKED",
      physicalStatus: "NONE",
      updatedAt: input.now,
      errorCode: consumeResponse.errorCode ?? "NOT_AUTHORIZED",
    };
    const releasedOrder = claimOrder(claimedOrder, "GENERADO", "NONE");
    try {
      await input.repository.updateOperationAndOrder(
        operationChange(blockedOperation, releasedOrder, input.evidence),
        requireOrderVersion(claimedOrder),
      );
    } catch (error) {
      if (!isOrderVersionConflict(error)) throw error;
      return {
        outcome: "recovery_required",
        operation: intent,
        lookupStatus: "order_cas_conflict",
      };
    }
    return { outcome: "blocked", reason: "NOT_AUTHORIZED", operation: blockedOperation };
  }

  if (consumeResponse.status === "already_consumed") {
    return recordPhysicalUnknown(
      input,
      intent,
      claimedOrder,
      consumeResponse.errorCode ?? "AUTHORIZATION_ALREADY_CONSUMED",
    );
  }

  if (consumeResponse.status !== "consumed") {
    const reason: CutBlockReason = "AUTHORIZATION_CONSUMPTION_UNKNOWN";
    const blockedOperation: OperationRecord = {
      ...intent,
      status: "BLOCKED",
      physicalStatus: "NONE",
      updatedAt: input.now,
      errorCode: consumeResponse.errorCode ?? reason,
    };
    await input.repository.updateOperationAndOrder(
      operationChange(blockedOperation, undefined, input.evidence),
      requireOrderVersion(claimedOrder),
    );
    return { outcome: "blocked", reason, operation: blockedOperation };
  }

  const executed: OperationRecord = {
    ...intent,
    status: "CONFIRMED",
    physicalStatus: "CONFIRMED",
    updatedAt: input.now,
  };
  await input.repository.updateOperationAndOrder(
    operationChange(executed, claimOrder(claimedOrder, "EJECUTADO", "CONFIRMED"), input.evidence),
    requireOrderVersion(claimedOrder),
  );
  return { outcome: "executed", operation: executed };
}

export const processCut = executeCut;
