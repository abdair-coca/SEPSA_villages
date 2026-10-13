/**
 * Cierre de un corte o una reconexión cuya autorización el servidor demuestra que no se usó (D022).
 *
 * El backend solo consume una reserva vigente con el token y el `operationId` exactos, y responde `consumed` a un
 * replay antes de mirar la vigencia. Por eso `expired`, `rejected` y `not_found` prueban que **la autorización** no
 * se consumió (no que nadie tocara el medidor). Con esa prueba, obtenida en el momento del cierre:
 * - la operación queda `BLOCKED` con `AUTHORIZATION_CLOSED_NOT_CONSUMED`, fuera de la cola automática;
 * - la orden vuelve al estado previo (corte: `GENERADO`/`NONE`; reconexión: `EJECUTADO`/`CONFIRMED`);
 * - una visita con id derivado del de la operación deja constancia en el servidor y hace el cierre idempotente.
 * Un corte cuyo POST ya empezó no se cierra: solo vale la consulta de la cola.
 */
import { copyOrderWithPhysicalStatus, createVisit } from "../domain/policies";
import type { OperationRecord, VisitRecord, WorkOrder } from "../domain/types";
import type { AuthorizationAdapter, EnablementAdapter } from "../ports/authorization";
import type { LocalRepository } from "../ports/repository";

export const AUTHORIZATION_CLOSED_NOT_CONSUMED = "AUTHORIZATION_CLOSED_NOT_CONSUMED";
const UNCONSUMED_PROOFS = new Set(["expired", "rejected", "not_found"]);

export type UnconsumedProof = NonNullable<OperationRecord["lastAuthorizationLookup"]>["status"];

/** `true` si el estado de la autorización en el servidor demuestra que no se consumió. */
export function provesUnconsumed(status: string | undefined): status is UnconsumedProof {
  return status !== undefined && UNCONSUMED_PROOFS.has(status);
}

/** `true` si la operación puede ofrecer pedir una autorización nueva (última consulta concluyente y sin cerrar). */
export function canRequestNewAuthorization(record: OperationRecord): boolean {
  return record.status !== "BLOCKED" && record.status !== "CONFIRMED" && provesUnconsumed(record.lastAuthorizationLookup?.status);
}

/** Id de la visita de constancia: mismo UUID que la operación cerrada, con otro prefijo. */
export function closureVisitId(operationId: string): string {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(operationId)?.[0];
  if (!uuid) throw new Error("La operación no tiene un UUID para derivar la visita de cierre.");
  return `closure-${uuid}`;
}

export interface CloseUnconsumedInput {
  repository: LocalRepository;
  authorization: AuthorizationAdapter;
  enablement: EnablementAdapter;
  operationId: string;
  technicianId: string;
  deviceId: string;
  now: string;
}

export type CloseUnconsumedResult =
  | { outcome: "closed"; operation: OperationRecord; visit: VisitRecord; order: WorkOrder }
  | { outcome: "not_proven"; lookupStatus: string }
  | { outcome: "not_applicable" };

export async function closeUnconsumedOperation(input: CloseUnconsumedInput): Promise<CloseUnconsumedResult> {
  const record = await input.repository.getRecord(input.operationId);
  if (!record || record.kind === "VISIT" || (record.action !== "CUT" && record.action !== "RECONNECTION")) return { outcome: "not_applicable" };
  const operation = record as OperationRecord;
  if (operation.technicianId !== input.technicianId || operation.deviceId !== input.deviceId) return { outcome: "not_applicable" };
  if (operation.status !== "PHYSICAL_UNKNOWN" && operation.status !== "INTENT_PERSISTED") return { outcome: "not_applicable" };
  const item = (await input.repository.listSyncItems()).find((candidate) => candidate.operationId === operation.operationId);
  if (!item || item.status === "synced") return { outcome: "not_applicable" };
  if (operation.action === "CUT" && (operation.authorizationConsumption !== "immediate" || item.cutSendPhase !== "preparing")) return { outcome: "not_applicable" };

  const lookupStatus = await currentAuthorizationStatus(input, operation);
  if (!provesUnconsumed(lookupStatus)) return { outcome: "not_proven", lookupStatus };

  const order = await input.repository.getOrder(operation.orderId);
  const expectedStatus = operation.action === "CUT" ? "GENERADO" : "EJECUTADO";
  if (!order || order.version === undefined || order.status !== expectedStatus || !["CLAIMED", "PHYSICAL_UNKNOWN"].includes(order.physicalStatus)) return { outcome: "not_applicable" };

  const visit = createVisit({
    operationId: closureVisitId(operation.operationId),
    orderId: operation.orderId,
    technicianId: operation.technicianId,
    deviceId: operation.deviceId,
    action: operation.action,
    reason: AUTHORIZATION_CLOSED_NOT_CONSUMED,
    recordedAt: input.now,
    errorCode: AUTHORIZATION_CLOSED_NOT_CONSUMED,
  });
  const claimed = await input.repository.claimVisit({ visit, syncItem: { operationId: visit.operationId, status: visit.syncStatus, attempts: visit.attempts, action: "VISIT", orderId: visit.orderId, technicianId: visit.technicianId, deviceId: visit.deviceId, errorCode: visit.errorCode } });
  if (claimed.status !== "claimed" && claimed.status !== "existing") return { outcome: "not_applicable" };

  const closed: OperationRecord = { ...operation, status: "BLOCKED", physicalStatus: "NONE", syncStatus: "failed", authorizationToken: undefined, updatedAt: input.now, errorCode: AUTHORIZATION_CLOSED_NOT_CONSUMED, lastAuthorizationLookup: { status: lookupStatus, at: input.now } };
  const released: WorkOrder = operation.action === "CUT"
    ? { ...copyOrderWithPhysicalStatus(order, "GENERADO", "NONE"), version: order.version + 1 }
    : { ...copyOrderWithPhysicalStatus(order, "EJECUTADO", "CONFIRMED"), version: order.version + 1 };
  await input.repository.updateOperationAndOrder({
    operation: closed,
    order: released,
    // Fuera de la cola automática (`manualReview`), sin incertidumbre: la cola lo muestra como cerrado.
    syncItem: { operationId: closed.operationId, status: "failed", attempts: closed.attempts, action: closed.kind, orderId: closed.orderId, technicianId: closed.technicianId, deviceId: closed.deviceId, errorCode: AUTHORIZATION_CLOSED_NOT_CONSUMED, uncertain: false, manualReview: true, fieldCapture: closed.fieldCapture },
  }, order.version);
  return { outcome: "closed", operation: closed, visit, order: released };
}

async function currentAuthorizationStatus(input: CloseUnconsumedInput, operation: OperationRecord): Promise<string> {
  try {
    const lookup = operation.action === "CUT"
      ? await input.authorization.lookupCutAuthorization?.(operation.operationId)
      : await input.enablement.lookupReconnection(operation.operationId);
    if (!lookup || lookup.operationId !== operation.operationId) return "unknown";
    return lookup.status;
  } catch {
    return "unknown";
  }
}
