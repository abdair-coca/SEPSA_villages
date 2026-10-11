import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "../../types.js";
import { withTransaction } from "../../db.js";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../../http.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { insertAudit } from "../audit/record.js";
import { requireRole } from "../shared/request-validation.js";

export interface LookupReviewHandlers {
  lookupOperation(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void>;
  recordHumanReview(request: IncomingMessage, response: ServerResponse, user: SessionUser, operationId: string): Promise<void>;
}

interface SyncOperationLookupRow {
  operation_id: string;
  status: string;
  order_id: string;
  technician_id: string;
  device_id: string;
  action: "CUT" | "RECONNECTION" | "VISIT";
  payload: Record<string, unknown>;
}

interface HumanReviewOrderRow {
  order_id: string;
  version: number;
  status: string;
  physical_status: string;
  assigned_technician_id: string | null;
}

interface HumanReviewOperationRow {
  order_id: string;
  technician_id: string;
  device_id: string;
  status: string;
}

export function createLookupReviewHandlers(context: ApplicationContext): LookupReviewHandlers {
  async function lookupOperation(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void> {
    if (user.role !== "TECHNICIAN" && user.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Role is not allowed.");
    if (!operationId) throw new HttpError(400, "INVALID_REQUEST", "operation_id is required.");
    const result = await context.pool.query<SyncOperationLookupRow>(
      `SELECT operation_id, status, order_id, technician_id, device_id, action, payload
       FROM sync_operations WHERE operation_id = $1 AND ($2::text = 'ADMIN' OR technician_id = $3)`,
      [operationId, user.role, user.userId],
    );
    const row = result.rows[0];
    const status = row?.status;
    if (!status) return sendJson(response, 200, { status: "not_found", operation_id: operationId });
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
      if (!complete) return sendJson(response, 200, { status: "unknown", operation_id: operationId, error_code: "LEGACY_RECEIPT_INCOMPLETE" });
      return sendJson(response, 200, { status: "confirmed", operation_id: row.operation_id, order_id: row.order_id, technician_id: row.technician_id, technician_name_snapshot: technicianNameSnapshot, device_id: row.device_id, action: row.action, recorded_at: recordedAt, effective_at: effectiveAt, demora, evidence_refs: evidenceRefs, order_version: orderVersion, field_capture: fieldCapture });
    }
    sendJson(response, 200, { status: "unknown", operation_id: operationId, error_code: "CONFLICT_REQUIRES_REVIEW" });
  }

  async function recordHumanReview(request: IncomingMessage, response: ServerResponse, user: SessionUser, operationId: string): Promise<void> {
    requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const orderId = requiredString(body.order_id, "order_id");
    const technicianId = requiredString(body.technician_id, "technician_id");
    const deviceId = requiredString(body.device_id, "device_id");
    const expectedVersion = requiredInteger(body.expected_version, "expected_version");
    const reason = requiredString(body.reason, "reason").trim();
    if (!reason || reason.length > 1000) throw new HttpError(400, "INVALID_REVIEW_REASON", "reason must contain 1 to 1000 non-whitespace characters.");
    const result = await withTransaction(context.pool, async (client) => {
      const orderResult = await client.query<HumanReviewOrderRow>(
        "SELECT order_id, version, status, physical_status, assigned_technician_id FROM orders WHERE order_id = $1 AND source = $2 FOR UPDATE",
        [orderId, PROVISIONAL_SOURCE],
      );
      const order = orderResult.rows[0];
      if (!order || order.assigned_technician_id !== technicianId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "Order and assigned technician were not found.");
      if (order.version !== expectedVersion) throw new HttpError(409, "VERSION_CONFLICT", "Order changed before human review.");
      if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_REVIEWABLE", "Only an active generated order can be marked physically uncertain.");
      if (order.physical_status === "CONFIRMED") throw new HttpError(409, "ALREADY_CONFIRMED", "A confirmed physical result cannot be changed by review.");
      const operationResult = await client.query<HumanReviewOperationRow>(
        "SELECT order_id, technician_id, device_id, status FROM sync_operations WHERE operation_id = $1 FOR UPDATE",
        [operationId],
      );
      const operation = operationResult.rows[0];
      if (operation && (operation.order_id !== orderId || operation.technician_id !== technicianId || operation.device_id !== deviceId)) throw new HttpError(409, "OPERATION_IDENTITY_MISMATCH", "Operation does not match the reviewed order, technician, and device.");
      if (operation?.status === "acknowledged") throw new HttpError(409, "ALREADY_CONFIRMED", "A remotely acknowledged operation cannot be changed by review.");
      const update = await client.query("UPDATE orders SET physical_status = 'PHYSICAL_UNKNOWN', version = version + 1, updated_at = now() WHERE order_id = $1 AND version = $2 AND physical_status <> 'CONFIRMED'", [orderId, expectedVersion]);
      if (update.rowCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Order changed during human review.");
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "HUMAN_REVIEW_RECORDED", result: "accepted", entityId: operationId, orderId, operationId, deviceId, reason, transition: { before: order.physical_status, after: "PHYSICAL_UNKNOWN", version: expectedVersion + 1 }, metadata: { expected_version: expectedVersion, technician_id: technicianId, device_id: deviceId, remote_operation_status: operation?.status ?? "not_found", physical_result_confirmed: false } });
      return { status: "recorded", order_id: orderId, operation_id: operationId, physical_status: "PHYSICAL_UNKNOWN", version: expectedVersion + 1 };
    });
    sendJson(response, 200, { ...result, source: PROVISIONAL_SOURCE });
  }

  return { lookupOperation, recordHumanReview };
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
