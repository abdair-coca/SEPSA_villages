/**
 * Consumo y consulta de la habilitación de reconexión.
 * El consumo verifica token (por hash), operación, orden, técnico, dispositivo y versión, y marca la
 * habilitación `CONSUMED` una sola vez. Repetir el consumo con la misma operación es un replay aceptado; con
 * otra operación, vencida o con la orden cambiada, responde `not_enabled`. Todo intento queda auditado.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { hashToken } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../../http.js";
import type { SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { insertAudit } from "../audit/record.js";
import { isUuid, requireRole } from "../shared/request-validation.js";

interface ConsumeReconnectionRequest {
  enablementId: string;
  token: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  version: number;
}

interface ReconnectionOrderState {
  assigned_technician_id: string | null;
  status: string;
  physical_status: string;
  version: number;
}

interface ReconnectionGrant {
  authorization_id: string;
  operation_id: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string | null;
  device_id: string;
  order_version: number;
  token_hash: string;
  status: string;
  expires_at: string;
  consumed_operation_id: string | null;
  action: string;
}

export async function consumeReconnectionEnablement(context: ApplicationContext, request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
  requireRole(user, "TECHNICIAN");
  const consumeRequest = await readConsumeRequest(request, context.config.maxBodyBytes);
  if (consumeRequest.technicianId !== user.userId) throw new HttpError(403, "TECHNICIAN_SCOPE", "Enablement technician does not match session.");
  if (!isUuid(consumeRequest.orderId) || consumeRequest.version < 1) throw new HttpError(400, "INVALID_REQUEST", "order_id and version are invalid.");

  const result = await withTransaction(context.pool, async (client) => {
    const orderResult = await client.query<ReconnectionOrderState>("SELECT assigned_technician_id, status, physical_status, version FROM orders WHERE order_id = $1 AND source = $2 FOR UPDATE", [consumeRequest.orderId, PROVISIONAL_SOURCE]);
    const order = orderResult.rows[0];
    if (!order || order.assigned_technician_id !== user.userId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "Order and assigned technician were not found.");

    const grantResult = await client.query<ReconnectionGrant>("SELECT authorization_id, operation_id, order_id, technician_id, technician_name_snapshot, device_id, order_version, token_hash, status, expires_at, consumed_operation_id, action FROM cut_authorizations WHERE authorization_id = $1 FOR UPDATE", [consumeRequest.enablementId]);
    const grant = grantResult.rows[0];
    if (!hasExpectedBinding(grant, consumeRequest, user.userId, hashToken(consumeRequest.token))) {
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ENABLEMENT_BINDING_CONFLICT", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
      return notEnabled(consumeRequest.operationId);
    }
    if (grant.status === "CONSUMED") {
      if (grant.consumed_operation_id !== consumeRequest.operationId) {
        await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ENABLEMENT_ALREADY_CONSUMED", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
        return notEnabled(consumeRequest.operationId);
      }
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION_REPLAY", result: "accepted", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
      return consumed(consumeRequest.operationId);
    }
    if (grant.status !== "RESERVED" || Date.parse(grant.expires_at) <= Date.now()) {
      if (grant.status === "RESERVED") await client.query("UPDATE cut_authorizations SET status = 'EXPIRED' WHERE authorization_id = $1 AND status = 'RESERVED'", [consumeRequest.enablementId]);
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ENABLEMENT_EXPIRED_OR_UNAVAILABLE", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
      return notEnabled(consumeRequest.operationId);
    }
    if (!isCurrentReconnectionOrder(order, consumeRequest.version)) {
      await client.query("UPDATE cut_authorizations SET status = 'REJECTED' WHERE authorization_id = $1 AND status = 'RESERVED'", [consumeRequest.enablementId]);
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ORDER_STATE_CONFLICT", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
      return notEnabled(consumeRequest.operationId);
    }
    const consumedResult = await client.query("UPDATE cut_authorizations SET status = 'CONSUMED', consumed_at = clock_timestamp(), consumed_operation_id = $2 WHERE authorization_id = $1 AND action = 'RECONNECTION' AND status = 'RESERVED' AND expires_at > clock_timestamp()", [consumeRequest.enablementId, consumeRequest.operationId]);
    if (consumedResult.rowCount !== 1) {
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ENABLEMENT_EXPIRED_OR_UNAVAILABLE", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
      return notEnabled(consumeRequest.operationId);
    }
    await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "accepted", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, metadata: { version: consumeRequest.version, technician_name_snapshot: grant.technician_name_snapshot, source: PROVISIONAL_SOURCE } });
    return consumed(consumeRequest.operationId);
  });
  context.logEvent("authorization.reconnection", { requestId: String(response.getHeader("x-request-id")), result: "consumed" });
  sendJson(response, 200, result);
}

export async function lookupReconnectionEnablement(context: ApplicationContext, response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void> {
  requireRole(user, "TECHNICIAN");
  if (!operationId) throw new HttpError(400, "INVALID_REQUEST", "operation_id is required.");
  const result = await withTransaction(context.pool, async (client) => {
    const rows = await client.query<{ authorization_id: string; technician_id: string; status: string; expires_at: string }>("SELECT authorization_id, technician_id, status, expires_at FROM cut_authorizations WHERE operation_id = $1 AND action = 'RECONNECTION' FOR UPDATE", [operationId]);
    const grant = rows.rows[0];
    if (!grant || grant.technician_id !== user.userId) return { status: "not_found" as const, operation_id: operationId, source: PROVISIONAL_SOURCE };
    let status = reconnectionStatus(grant.status);
    if (status === "reserved" && Date.parse(grant.expires_at) <= Date.now()) {
      await client.query("UPDATE cut_authorizations SET status = 'EXPIRED' WHERE authorization_id = $1 AND status = 'RESERVED'", [grant.authorization_id]);
      status = "expired";
    }
    return { status, operation_id: operationId, source: PROVISIONAL_SOURCE };
  });
  sendJson(response, 200, result);
}

async function readConsumeRequest(request: IncomingMessage, maxBodyBytes: number): Promise<ConsumeReconnectionRequest> {
  const body = await parseJsonBody(request, maxBodyBytes);
  return {
    enablementId: requiredString(body.enablement_id, "enablement_id"),
    token: requiredString(body.token, "token"),
    orderId: requiredString(body.order_id, "order_id"),
    technicianId: requiredString(body.technician_id, "technician_id"),
    deviceId: requiredString(body.device_id, "device_id"),
    operationId: requiredString(body.operation_id, "operation_id"),
    version: requiredInteger(body.version, "version"),
  };
}

function hasExpectedBinding(grant: ReconnectionGrant | undefined, request: ConsumeReconnectionRequest, userId: string, tokenHash: string): grant is ReconnectionGrant {
  return Boolean(grant && grant.action === "RECONNECTION" && grant.operation_id === request.operationId && grant.order_id === request.orderId && grant.technician_id === userId && grant.device_id === request.deviceId && grant.order_version === request.version && grant.token_hash === tokenHash);
}

function isCurrentReconnectionOrder(order: ReconnectionOrderState, version: number): boolean {
  return order.status === "EJECUTADO" && order.physical_status === "CONFIRMED" && order.version === version;
}

function reconnectionStatus(status: string): "consumed" | "reserved" | "expired" | "unknown" {
  if (status === "CONSUMED") return "consumed";
  if (status === "RESERVED") return "reserved";
  if (status === "EXPIRED") return "expired";
  return "unknown";
}

function notEnabled(operationId: string): { status: "not_enabled"; operation_id: string; source: string } {
  return { status: "not_enabled", operation_id: operationId, source: PROVISIONAL_SOURCE };
}

function consumed(operationId: string): { status: "consumed"; operation_id: string; source: string } {
  return { status: "consumed", operation_id: operationId, source: PROVISIONAL_SOURCE };
}
