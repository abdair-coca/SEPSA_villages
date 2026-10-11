/**
 * Reglas de la sincronización a nivel de caso de uso. No conoce HTTP ni escribe SQL (`repositories/`).
 * - `syncOperation`: aplica la operación en una transacción (`sync-apply.service.ts`).
 * - `lookupOperation`: `confirmed` solo con un recibo completo; un recibo antiguo incompleto o un conflicto
 *   responde `unknown`. El técnico solo ve sus operaciones; ADMIN ve todas.
 * - `recordHumanReview` (solo ADMIN, comprobado en el controlador): marca la orden `PHYSICAL_UNKNOWN` con motivo y
 *   versión esperada. No confirma el corte, no autoriza otra ejecución y no cambia un resultado ya confirmado.
 */
import { withTransaction } from "../db.js";
import { HttpError } from "../http/responses.js";
import { insertAudit } from "../repositories/audit.repository.js";
import { findOrderForReviewForUpdate, markOrderPhysicalUnknown } from "../repositories/orders.repository.js";
import { findSyncOperationForLookup, findSyncOperationForReview, type SyncOperationLookupRow } from "../repositories/sync.repository.js";
import type { ServiceContext } from "../shared/application-context.js";
import type { SessionUser, SyncPayload } from "../types.js";
import { applySync } from "./sync-apply.service.js";
import type { SyncResult } from "./sync-support.service.js";

export interface HumanReviewInput {
  operationId: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  expectedVersion: number;
  reason: string;
}

export interface HumanReviewResult {
  status: "recorded";
  order_id: string;
  operation_id: string;
  physical_status: "PHYSICAL_UNKNOWN";
  version: number;
}

export interface SyncService {
  syncOperation(user: SessionUser, payload: SyncPayload): Promise<SyncResult>;
  /** Cuerpo JSON de la respuesta de consulta (`confirmed`, `not_found` o `unknown`). */
  lookupOperation(user: SessionUser, operationId: string): Promise<Record<string, unknown>>;
  recordHumanReview(user: SessionUser, input: HumanReviewInput): Promise<HumanReviewResult>;
}

export function createSyncService(context: ServiceContext): SyncService {
  async function syncOperation(user: SessionUser, payload: SyncPayload): Promise<SyncResult> {
    return withTransaction(context.pool, async (client) => applySync(client, user, payload));
  }

  async function lookupOperation(user: SessionUser, operationId: string): Promise<Record<string, unknown>> {
    const row = await findSyncOperationForLookup(context.pool, operationId, user.role, user.userId);
    const status = row?.status;
    if (!status) return { status: "not_found", operation_id: operationId };
    if (status === "acknowledged") {
      const payload = row.payload;
      const recordedAt = payload.recorded_at;
      const evidenceRefs = payload.evidence_refs;
      const fieldCapture = payload.field_capture;
      const orderVersion = payload.order_version;
      const effectiveAt = payload.effective_at;
      const demora = payload.demora;
      const technicianNameSnapshot = payload.technician_name_snapshot;
      const complete = isCompleteReceipt(
        row.action,
        recordedAt,
        evidenceRefs,
        orderVersion,
        effectiveAt,
        demora,
        technicianNameSnapshot,
        fieldCapture,
      );
      if (!complete) return { status: "unknown", operation_id: operationId, error_code: "LEGACY_RECEIPT_INCOMPLETE" };
      return { status: "confirmed", operation_id: row.operation_id, order_id: row.order_id, technician_id: row.technician_id, technician_name_snapshot: technicianNameSnapshot, device_id: row.device_id, action: row.action, recorded_at: recordedAt, effective_at: effectiveAt, demora, evidence_refs: evidenceRefs, order_version: orderVersion, field_capture: fieldCapture };
    }
    return { status: "unknown", operation_id: operationId, error_code: "CONFLICT_REQUIRES_REVIEW" };
  }

  async function recordHumanReview(user: SessionUser, input: HumanReviewInput): Promise<HumanReviewResult> {
    const { operationId, orderId, technicianId, deviceId, expectedVersion, reason } = input;
    return withTransaction(context.pool, async (client) => {
      const order = await findOrderForReviewForUpdate(client, orderId);
      if (!order || order.assigned_technician_id !== technicianId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "No se encontraron la orden ni el técnico asignado.");
      if (order.version !== expectedVersion) throw new HttpError(409, "VERSION_CONFLICT", "La orden cambió antes de la revisión humana.");
      if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_REVIEWABLE", "Solo una orden generada y activa puede marcarse como físicamente incierta.");
      if (order.physical_status === "CONFIRMED") throw new HttpError(409, "ALREADY_CONFIRMED", "Un resultado físico confirmado no puede cambiarse por revisión.");
      const operation = await findSyncOperationForReview(client, operationId);
      if (operation && (operation.order_id !== orderId || operation.technician_id !== technicianId || operation.device_id !== deviceId)) throw new HttpError(409, "OPERATION_IDENTITY_MISMATCH", "La operación no coincide con la orden, el técnico y el dispositivo revisados.");
      if (operation?.status === "acknowledged") throw new HttpError(409, "ALREADY_CONFIRMED", "Una operación confirmada remotamente no puede cambiarse por revisión.");
      const updatedCount = await markOrderPhysicalUnknown(client, orderId, expectedVersion);
      if (updatedCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "La orden cambió durante la revisión humana.");
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "HUMAN_REVIEW_RECORDED", result: "accepted", entityId: operationId, orderId, operationId, deviceId, reason, transition: { before: order.physical_status, after: "PHYSICAL_UNKNOWN", version: expectedVersion + 1 }, metadata: { expected_version: expectedVersion, technician_id: technicianId, device_id: deviceId, remote_operation_status: operation?.status ?? "not_found", physical_result_confirmed: false } });
      return { status: "recorded" as const, order_id: orderId, operation_id: operationId, physical_status: "PHYSICAL_UNKNOWN" as const, version: expectedVersion + 1 };
    });
  }

  return { syncOperation, lookupOperation, recordHumanReview };
}

function isCompleteReceipt(
  action: SyncOperationLookupRow["action"],
  recordedAt: unknown,
  evidenceRefs: unknown,
  orderVersion: unknown,
  effectiveAt: unknown,
  demora: unknown,
  technicianNameSnapshot: unknown,
  fieldCapture: unknown,
): boolean {
  return typeof recordedAt === "string" &&
    Array.isArray(evidenceRefs) &&
    evidenceRefs.every((ref) => typeof ref === "string") &&
    (action === "VISIT" || (Number.isSafeInteger(orderVersion) && (action === "RECONNECTION"
      ? typeof effectiveAt === "string" && typeof demora === "string" && typeof technicianNameSnapshot === "string"
      : typeof fieldCapture === "object" && fieldCapture !== null)));
}
