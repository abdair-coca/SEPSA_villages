import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createOpaqueToken, hashToken } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../../http.js";
import type { SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { insertAudit } from "../audit/record.js";
import { orderSelect, type OrderRow } from "../projections/order.js";
import { isUuid, requireRole } from "../shared/request-validation.js";

interface ReconnectionAuthorizationRequest {
  operationId: string;
  orderId: string;
  deviceId: string;
  orderVersion: number;
}

interface ExistingReconnectionAuthorization {
  technician_id: string;
  order_id: string;
  device_id: string;
  action: string;
}

export async function authorizeReconnection(context: ApplicationContext, request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
  requireRole(user, "TECHNICIAN");
  const authorizationRequest = await readReconnectionAuthorizationRequest(request, context.config.maxBodyBytes);
  if (!isUuid(authorizationRequest.orderId) || authorizationRequest.orderVersion < 1) throw new HttpError(400, "INVALID_REQUEST", "order_id and order_version are invalid.");

  const result = await withTransaction(context.pool, async (client) => {
    const orderResult = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [authorizationRequest.orderId, PROVISIONAL_SOURCE]);
    const order = orderResult.rows[0];
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found.");
    if (order.assigned_technician_id !== user.userId) throw new HttpError(403, "ORDER_NOT_ASSIGNED", "Order is not assigned to current technician.");
    if (order.version !== authorizationRequest.orderVersion) throw new HttpError(409, "VERSION_CONFLICT", "Order version is stale.");
    if (!isEligibleReconnectionOrder(order)) throw new HttpError(409, "ORDER_NOT_ELIGIBLE", "Reconnection requires a confirmed cut on an executed order.");

    const cuts = await client.query<{ operation_id: string }>("SELECT operation_id FROM sync_operations WHERE order_id = $1 AND action = 'CUT' AND status = 'acknowledged' FOR SHARE", [authorizationRequest.orderId]);
    if (cuts.rows.length !== 1) throw new HttpError(409, "CUT_CYCLE_AMBIGUOUS", "The order does not identify exactly one remotely confirmed cut cycle.");
    await client.query("UPDATE cut_authorizations SET status = 'EXPIRED' WHERE order_id = $1 AND action = 'RECONNECTION' AND status = 'RESERVED' AND expires_at <= clock_timestamp()", [authorizationRequest.orderId]);

    const existing = await client.query<ExistingReconnectionAuthorization>("SELECT technician_id, order_id, device_id, action, status FROM cut_authorizations WHERE operation_id = $1 FOR UPDATE", [authorizationRequest.operationId]);
    const prior = existing.rows[0];
    if (prior) {
      if (belongsToAnotherReconnection(prior, authorizationRequest, user.userId)) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Authorization operation identifier is bound to another context.");
      throw new HttpError(409, "ENABLEMENT_OPERATION_REPLAY", "This operation already has a habilitation reservation; verify its status before starting another operation.");
    }

    const active = await client.query<{ authorization_id: string; operation_id: string; status: string }>("SELECT authorization_id, operation_id, status FROM cut_authorizations WHERE order_id = $1 AND action = 'RECONNECTION' AND status IN ('RESERVED', 'CONSUMED') FOR UPDATE", [authorizationRequest.orderId]);
    const activeAuthorization = active.rows[0];
    if (activeAuthorization?.status === "CONSUMED") throw new HttpError(409, "RECONNECTION_ALREADY_CONSUMED", "A reconnection operation is already consumed for this order.");
    if (activeAuthorization?.status === "RESERVED") {
      await client.query("UPDATE cut_authorizations SET status = 'REJECTED' WHERE authorization_id = $1 AND status = 'RESERVED'", [activeAuthorization.authorization_id]);
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "RECONNECTION_ENABLEMENT_REPLACED", result: "accepted", entityId: activeAuthorization.authorization_id, orderId: authorizationRequest.orderId, operationId: activeAuthorization.operation_id, deviceId: authorizationRequest.deviceId, reason: "UNCONSUMED_RESERVATION_REPLACED", metadata: { replacement_operation_id: authorizationRequest.operationId, source: PROVISIONAL_SOURCE } });
    }

    const authorizationId = randomUUID();
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + context.config.authorizationTtlSeconds * 1000).toISOString();
    await client.query(
      `INSERT INTO cut_authorizations(authorization_id, operation_id, order_id, technician_id, device_id, order_version, token_hash, status, expires_at, source, action, technician_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED', $8, $9, 'RECONNECTION', $10)`,
      [authorizationId, authorizationRequest.operationId, authorizationRequest.orderId, user.userId, authorizationRequest.deviceId, authorizationRequest.orderVersion, hashToken(token), expiresAt, PROVISIONAL_SOURCE, user.displayName],
    );
    await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "AUTHORIZE_RECONNECTION", result: "accepted", entityId: authorizationId, orderId: authorizationRequest.orderId, operationId: authorizationRequest.operationId, deviceId: authorizationRequest.deviceId, metadata: { version: authorizationRequest.orderVersion, technician_name_snapshot: user.displayName, source: PROVISIONAL_SOURCE } });
    return { enablement_id: authorizationId, token, order_id: authorizationRequest.orderId, technician_id: user.userId, technician_name_snapshot: user.displayName, device_id: authorizationRequest.deviceId, operation_id: authorizationRequest.operationId, version: authorizationRequest.orderVersion, issued_at: new Date().toISOString(), expires_at: expiresAt, source: PROVISIONAL_SOURCE };
  });
  context.logEvent("authorization.reconnection", { requestId: String(response.getHeader("x-request-id")), result: "reserved" });
  sendJson(response, 200, result);
}

async function readReconnectionAuthorizationRequest(request: IncomingMessage, maxBodyBytes: number): Promise<ReconnectionAuthorizationRequest> {
  const body = await parseJsonBody(request, maxBodyBytes);
  return {
    operationId: requiredString(body.operation_id, "operation_id"),
    orderId: requiredString(body.order_id, "order_id"),
    deviceId: requiredString(body.device_id, "device_id"),
    orderVersion: requiredInteger(body.order_version, "order_version"),
  };
}

function isEligibleReconnectionOrder(order: OrderRow): boolean {
  return order.status === "EJECUTADO" && order.physical_status === "CONFIRMED";
}

function belongsToAnotherReconnection(prior: ExistingReconnectionAuthorization, request: ReconnectionAuthorizationRequest, userId: string): boolean {
  return prior.technician_id !== userId || prior.order_id !== request.orderId || prior.device_id !== request.deviceId || prior.action !== "RECONNECTION";
}
