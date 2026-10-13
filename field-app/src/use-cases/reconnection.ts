/**
 * Caso de uso: reconexión (reposición SC08) de una orden con corte confirmado (`executeReconnection`).
 *
 * Mismo esquema de seguridad que el corte (ver `process.ts`), con la habilitación provisional del piloto:
 * 1. Replay por `operationId`: se devuelve o se recupera consultando la habilitación (`lookupExisting`).
 * 2. Exige orden EJECUTADO/CONFIRMED, DEMORA (`Sin demora` si no hubo) y evidencia o excepción.
 * 3. Pide habilitación online; cualquier resultado no concluyente registra una visita (no reconecta).
 * 4. Reclama atómicamente la operación y la orden, consume la habilitación (un solo uso) y, solo si se
 *    consumió, deja la orden en `RECONEXIÓN`/`CONFIRMED`. Un resultado incierto queda en `PHYSICAL_UNKNOWN`.
 *
 * Conserva `effectiveAt`, el nombre histórico del técnico y `demora`, que no se modifican en reintentos.
 * Contrato `PILOT_PROVISIONAL`: ver `docs/features/synchronization.md` → "Reposición SC08".
 */
import {
  assertReconnectionEligible,
  assertOperationId,
  copyOrderWithPhysicalStatus,
  createVisit,
  validateEvidence,
} from "../domain/policies";
import { DomainError } from "../domain/errors";
import type { EvidenceReference, OperationRecord, VisitRecord, WorkOrder } from "../domain/types";
import { isUncertainError, type EnablementAdapter, type EnablementGrant, type EnablementResponse } from "../ports/authorization";
import type { AtomicOperationChange, LocalRepository, StoredRecord } from "../ports/repository";
import { consumeWithRetries, type Sleep } from "./consume-retry";

export interface ReconnectionProcessInput {
  repository: LocalRepository;
  enablement: EnablementAdapter;
  order: WorkOrder;
  operationId: string;
  technicianId: string;
  technicianNameSnapshot?: string;
  deviceId: string;
  now: string;
  demora?: string;
  evidence?: EvidenceReference;
  exceptionReason?: string;
  /** Espera entre reintentos del consumo; en pruebas se inyecta una inmediata. */
  sleep?: Sleep;
}

/** Mismos resultados que el corte; ver `CutProcessResult` en `process.ts`. */
export type ReconnectionResult =
  | { outcome: "visit_recorded"; visit: VisitRecord }
  | { outcome: "executed"; operation: OperationRecord }
  | { outcome: "physical_unknown"; operation: OperationRecord; lookupStatus: string; errorCode?: string }
  | { outcome: "recovery_required"; operation: OperationRecord; lookupStatus: string }
  | { outcome: "blocked"; reason: "NOT_ENABLED" | "ENABLEMENT_UNKNOWN" | "ENABLEMENT_EXPIRED"; operation?: OperationRecord }
  | { outcome: "duplicate"; operation: OperationRecord };

function versionOf(order: WorkOrder): number {
  if (order.version === undefined) throw new DomainError("Se requiere la versión de la orden para reclamar de forma atómica.", "ORDER_VERSION_REQUIRED");
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
      manualReview: operation.status === "BLOCKED",
    },
    evidence,
  };
}

/** DEMORA de SC08: obligatoria (o `Sin demora`), máximo 1000 caracteres en el piloto. */
function reconnectionDelay(input: ReconnectionProcessInput): string {
  const value = input.demora;
  if (!value?.trim()) throw new DomainError("Ingrese una observación de demora o Sin demora.", "RECONNECTION_DEMORA_REQUIRED");
  if (value.length > 1000) throw new DomainError("La observación de demora no puede superar 1000 caracteres.", "RECONNECTION_DEMORA_TOO_LONG");
  return value;
}

/** Intención de reconexión durable con la habilitación concedida y el nombre histórico del técnico. */
function operationFromGrant(input: ReconnectionProcessInput, grant: EnablementGrant): OperationRecord {
  const technicianNameSnapshot = grant.technicianNameSnapshot?.trim() ? grant.technicianNameSnapshot : input.technicianNameSnapshot;
  if (!technicianNameSnapshot?.trim()) throw new DomainError("No se pudo conservar el nombre histórico del técnico.", "TECHNICIAN_NAME_REQUIRED");
  return {
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
    effectiveAt: input.now,
    technicianNameSnapshot,
    demora: reconnectionDelay(input),
    updatedAt: input.now,
    attempts: 0,
    authorizationId: grant.enablementId,
    authorizationToken: grant.token,
    authorizationVersion: grant.version,
    authorizationConsumption: "immediate",
    evidenceRefs: input.evidence ? [input.evidence.evidenceId] : [],
    exceptionReason: input.exceptionReason,
  };
}

function consumeInput(operation: OperationRecord): Parameters<EnablementAdapter["consumeReconnection"]>[0] {
  if (!operation.authorizationId || !operation.authorizationToken || operation.authorizationVersion === undefined) {
    throw new DomainError("La habilitación de reconexión no se conservó localmente.", "RECONNECTION_ENABLEMENT_MISSING");
  }
  return {
    enablementId: operation.authorizationId,
    token: operation.authorizationToken,
    orderId: operation.orderId,
    technicianId: operation.technicianId,
    deviceId: operation.deviceId,
    operationId: operation.operationId,
    version: operation.authorizationVersion,
  };
}

/** `already_consumed` para la misma operación cuenta como consumida (replay de la misma reconexión). */
function isConsumed(status: string): boolean {
  return status === "consumed" || status === "already_consumed";
}

/**
 * Cierra la reconexión tras consumir la habilitación: operación CONFIRMED y orden `RECONEXIÓN`.
 * Si la orden local no está en el estado esperado, no se fuerza: queda `PHYSICAL_UNKNOWN` para revisión.
 */
async function completeReconnection(input: RecoveryContext, operation: OperationRecord): Promise<ReconnectionResult> {
  const currentOrder = await input.repository.getOrder(operation.orderId);
  if (!currentOrder || currentOrder.version === undefined || currentOrder.assignedTechnicianId !== operation.technicianId) {
    return persistUnknown(input, operation, currentOrder, "ORDER_RECOVERY_UNAVAILABLE");
  }
  const executed: OperationRecord = {
    ...operation,
    status: "CONFIRMED",
    physicalStatus: "CONFIRMED",
    syncStatus: "pending",
    authorizationToken: undefined,
    updatedAt: input.now,
    errorCode: undefined,
  };
  if (currentOrder.status === "RECONEXIÓN" && currentOrder.physicalStatus === "CONFIRMED") {
    await input.repository.updateOperationAndOrder(operationChange(executed));
    return { outcome: "executed", operation: executed };
  }
  if (currentOrder.status !== "EJECUTADO" || !["CLAIMED", "PHYSICAL_UNKNOWN"].includes(currentOrder.physicalStatus)) {
    const uncertain: OperationRecord = { ...operation, status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN", syncStatus: "failed", updatedAt: input.now, errorCode: "ORDER_STATE_CONFLICT" };
    await input.repository.updateOperationAndOrder(operationChange(uncertain));
    return { outcome: "physical_unknown", operation: uncertain, lookupStatus: "unknown" };
  }
  const finished: WorkOrder = {
    ...copyOrderWithPhysicalStatus(currentOrder, "RECONEXIÓN", "CONFIRMED"),
    version: currentOrder.version + 1,
  };
  await input.repository.updateOperationAndOrder(operationChange(executed, finished), currentOrder.version);
  return { outcome: "executed", operation: executed };
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
    throw new DomainError("El identificador de la operación está ligado a otro contexto de reconexión.", "OPERATION_BINDING_MISMATCH");
  }
}

function isVisitRecord(record: StoredRecord): record is VisitRecord {
  return record.kind === "VISIT" && "reason" in record;
}

/** Lo que la recuperación necesita: no la orden, la evidencia ni los datos de la captura original. */
export type RecoveryContext = Pick<ReconnectionProcessInput, "repository" | "enablement" | "now" | "sleep">;

/** Resultado de consultar la habilitación: consumo demostrado, o un código no concluyente con el estado remoto. */
type EnablementVerdict = { consumed: true } | { consumed: false; code: string; lookupStatus: string };

/**
 * Código para una habilitación no consumida en recuperación. Es distinto de `ENABLEMENT_EXPIRED` (visita):
 * aquí la reserva venció después de un consumo incierto, así que no se sabe si la reconexión ocurrió.
 */
function unresolvedEnablementCode(status: string): string {
  if (status === "expired") return "ENABLEMENT_RESERVATION_EXPIRED";
  if (status === "not_found") return "ENABLEMENT_NOT_FOUND";
  if (status === "unknown") return "ENABLEMENT_LOOKUP_UNKNOWN";
  return "RECOVERY_REQUIRED";
}

/** Consulta la habilitación por `operationId`; solo `consumed` (o una reserva consumida ahora) permite completar. */
async function consultEnablement(input: RecoveryContext, operation: OperationRecord): Promise<EnablementVerdict> {
  let lookup;
  try {
    lookup = await input.enablement.lookupReconnection(operation.operationId);
  } catch {
    return { consumed: false, code: "ENABLEMENT_LOOKUP_UNKNOWN", lookupStatus: "unknown" };
  }
  if (lookup.operationId !== operation.operationId) return { consumed: false, code: "ENABLEMENT_LOOKUP_MISMATCH", lookupStatus: "unknown" };
  if (lookup.status === "consumed") return { consumed: true };
  if (lookup.status === "reserved" && operation.authorizationToken && operation.authorizationId) {
    let attempt;
    try {
      attempt = await consumeWithRetries(() => input.enablement.consumeReconnection(consumeInput(operation)), input.sleep);
    } catch {
      return { consumed: false, code: "ENABLEMENT_CONSUME_UNKNOWN", lookupStatus: lookup.status };
    }
    if (attempt.kind === "uncertain") return { consumed: false, code: "ENABLEMENT_CONSUME_UNKNOWN", lookupStatus: lookup.status };
    const consumed = attempt.response;
    if (consumed.operationId !== operation.operationId) return { consumed: false, code: "CONSUME_OPERATION_ID_MISMATCH", lookupStatus: lookup.status };
    if (isConsumed(consumed.status)) return { consumed: true };
    return { consumed: false, code: "RECOVERY_REQUIRED", lookupStatus: lookup.status };
  }
  return { consumed: false, code: unresolvedEnablementCode(lookup.status), lookupStatus: lookup.status };
}

/**
 * Recupera una reconexión ya registrada consultando su habilitación por `operationId`. Solo completa con consumo
 * demostrado. Un registro `INTENT_PERSISTED` pasa a incierto con el código de la consulta; uno ya `PHYSICAL_UNKNOWN`
 * conserva su causa original y solo informa el resultado de la consulta.
 */
async function lookupExisting(input: RecoveryContext, operation: OperationRecord): Promise<ReconnectionResult> {
  const verdict = await consultEnablement(input, operation);
  if (verdict.consumed) return completeReconnection(input, operation);
  if (operation.physicalStatus === "PHYSICAL_UNKNOWN") {
    return { outcome: "physical_unknown", operation, lookupStatus: verdict.lookupStatus, errorCode: verdict.code };
  }
  const uncertain = await persistUnknown(input, operation, await input.repository.getOrder(operation.orderId), verdict.code);
  return { outcome: "physical_unknown", operation: uncertain.operation, lookupStatus: verdict.lookupStatus, errorCode: verdict.code };
}

export interface ReconnectionRecoveryInput extends RecoveryContext {
  operationId: string;
  technicianId: string;
  deviceId: string;
}

/**
 * Verifica con el servidor una reconexión pendiente (`INTENT_PERSISTED` o `PHYSICAL_UNKNOWN`) de este técnico y
 * dispositivo. No pide una habilitación nueva. Devuelve `undefined` si no hay nada que verificar.
 */
export async function recoverReconnection(input: ReconnectionRecoveryInput): Promise<ReconnectionResult | undefined> {
  const record = await input.repository.getRecord(input.operationId);
  if (!record || isVisitRecord(record) || record.kind !== "RECONNECTION") return undefined;
  if (record.technicianId !== input.technicianId || record.deviceId !== input.deviceId) return undefined;
  if (record.status === "CONFIRMED") return { outcome: "duplicate", operation: record };
  if (record.status !== "INTENT_PERSISTED" && record.physicalStatus !== "PHYSICAL_UNKNOWN") return undefined;
  return lookupExisting(input, record);
}

/** La habilitación debe ser para esta orden, técnico, dispositivo, operación y versión, y estar vigente. */
function grantValid(grant: EnablementGrant, input: ReconnectionProcessInput): boolean {
  return (
    grant.orderId === input.order.orderId &&
    grant.technicianId === input.technicianId &&
    grant.deviceId === input.deviceId &&
    grant.operationId === input.operationId &&
    grant.version === (input.order.authoritativeVersion ?? input.order.version) &&
    input.now < grant.expiresAt
  );
}

function responseReason(response: EnablementResponse): "NOT_ENABLED" | "ENABLEMENT_UNKNOWN" {
  return response.status === "not_enabled" ? "NOT_ENABLED" : "ENABLEMENT_UNKNOWN";
}

/** Ejecuta el flujo completo de reconexión descrito al inicio del archivo. */
export async function executeReconnection(input: ReconnectionProcessInput): Promise<ReconnectionResult> {
  if (!input.operationId.trim()) throw new DomainError("Se requiere el identificador de la operación.", "OPERATION_ID_REQUIRED");
  assertOperationId(input.operationId);
  const existing = await input.repository.getRecord(input.operationId);
  if (existing) {
    assertBinding(existing, input);
    if (isVisitRecord(existing)) return { outcome: "visit_recorded", visit: existing };
    if (existing.physicalStatus === "PHYSICAL_UNKNOWN" || existing.status === "INTENT_PERSISTED") return lookupExisting(input, existing);
    return { outcome: "duplicate", operation: existing };
  }

  assertReconnectionEligible(input.order, input.technicianId);
  reconnectionDelay(input);
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
      orderVersion: input.order.authoritativeVersion ?? input.order.version,
    });
  } catch (error) {
    if (!isUncertainError(error)) throw error;
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

  let intent: OperationRecord;
  try {
    intent = operationFromGrant(input, response.grant);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return persistVisit(input, makeVisit(input, "ENABLEMENT_UNKNOWN", error.code));
  }
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

  // Reintenta con el mismo operationId y token solo si el resultado es incierto (D019).
  const attempt = await consumeWithRetries(() => input.enablement.consumeReconnection(consumeInput(intent)), input.sleep);
  if (attempt.kind === "uncertain") return persistUnknown(input, intent, claim.order, attempt.errorCode);
  const consumed = attempt.response;

  if (consumed.operationId !== input.operationId) {
    return persistUnknown(input, intent, claim.order, "CONSUME_OPERATION_ID_MISMATCH");
  }
  if (consumed.status === "not_enabled") {
    const blocked: OperationRecord = { ...intent, status: "BLOCKED", physicalStatus: "NONE", syncStatus: "failed", authorizationToken: undefined, updatedAt: input.now, errorCode: "RECONNECTION_NOT_COMPLETED" };
    const released = { ...copyOrderWithPhysicalStatus(claim.order, "EJECUTADO", "CONFIRMED"), version: versionOf(claim.order) + 1 };
    await input.repository.updateOperationAndOrder(operationChange(blocked, released, input.evidence), versionOf(claim.order));
    return { outcome: "blocked", reason: "NOT_ENABLED", operation: blocked };
  }

  return completeReconnection(input, intent);
}

/** Registra la visita que deja constancia de una reconexión no ejecutada. */
async function persistVisit(input: ReconnectionProcessInput, visit: VisitRecord): Promise<ReconnectionResult> {
  const result = await input.repository.claimVisit(visitChange(visit, input.evidence));
  if (result.status === "existing") {
    assertBinding(result.record, input);
    if (isVisitRecord(result.record)) return { outcome: "visit_recorded", visit: result.record };
    throw new DomainError("El identificador de la operación ya lo usa una reconexión.", "OPERATION_BINDING_MISMATCH");
  }
  if (result.status !== "claimed") throw new DomainError("No se pudo guardar la visita.", "VISIT_CLAIM_REJECTED");
  return { outcome: "visit_recorded", visit };
}

/** Deja la reconexión en `PHYSICAL_UNKNOWN`; solo toca la orden si está en el estado reclamado esperado. */
async function persistUnknown(
  input: RecoveryContext,
  intent: OperationRecord,
  claimed: WorkOrder | undefined,
  errorCode: string,
): Promise<Extract<ReconnectionResult, { outcome: "physical_unknown" }>> {
  const operation = { ...intent, status: "PHYSICAL_UNKNOWN" as const, physicalStatus: "PHYSICAL_UNKNOWN" as const, syncStatus: "failed" as const, updatedAt: input.now, errorCode };
  if (!claimed || claimed.version === undefined || claimed.status !== "EJECUTADO" || claimed.physicalStatus === "PHYSICAL_UNKNOWN" || claimed.physicalStatus === "CONFIRMED") {
    await input.repository.updateOperationAndOrder(operationChange(operation));
    return { outcome: "physical_unknown", operation, lookupStatus: "unknown" };
  }
  const order = { ...copyOrderWithPhysicalStatus(claimed, "EJECUTADO", "PHYSICAL_UNKNOWN"), version: versionOf(claimed) + 1 };
  await input.repository.updateOperationAndOrder(operationChange(operation, order), versionOf(claimed));
  return { outcome: "physical_unknown", operation, lookupStatus: "unknown" };
}

export const processReconnection = executeReconnection;
