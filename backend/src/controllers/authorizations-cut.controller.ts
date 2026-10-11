/**
 * Emisión de autorización de corte (`POST /v1/authorizations/cut`, solo TECHNICIAN).
 * Reserva una autorización de un solo uso ligada a operación, orden, técnico, dispositivo y versión, con
 * vencimiento (`AUTHORIZATION_TTL_SECONDS`). Exige orden asignada, versión vigente, `GENERADO` y estado
 * físico `NONE`. El token solo se devuelve una vez; se guarda su hash. Se consume al aceptar el sync del CUT.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createOpaqueToken, hashToken } from "../shared/auth-crypto.js";
import { withTransaction } from "../db.js";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../http/responses.js";
import type { SessionUser } from "../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { insertAudit } from "../repositories/audit.repository.js";
import type { OrderRow } from "../mappers/order.mapper.js";
import { orderSelect } from "../repositories/orders.repository.js";
import { requireRole } from "../shared/request-validation.js";

interface CutAuthorizationRequest {
  operationId: string;
  orderId: string;
  deviceId: string;
  orderVersion: number;
}

interface ExistingCutAuthorization {
  technician_id: string;
  action: string;
}

export async function authorizeCut(context: ApplicationContext, request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
  requireRole(user, "TECHNICIAN");
  const authorizationRequest = await readCutAuthorizationRequest(request, context.config.maxBodyBytes);
  const result = await withTransaction(context.pool, async (client) => {
    const existing = await client.query<ExistingCutAuthorization & { authorization_id: string; expires_at: string }>("SELECT authorization_id, expires_at, technician_id, action FROM cut_authorizations WHERE operation_id = $1", [authorizationRequest.operationId]);
    const prior = existing.rows[0];
    // Un operation_id solo puede tener una autorización: no se emite otra para el mismo intento.
    if (prior) {
      if (belongsToAnotherCutAuthorization(prior, user.userId)) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Authorization operation identifier is bound to another action or technician.");
      throw new HttpError(409, "AUTHORIZATION_OPERATION_REPLAY", "Authorization operation already has a reservation; use saved response.");
    }

    const orderResult = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [authorizationRequest.orderId, PROVISIONAL_SOURCE]);
    const order = orderResult.rows[0];
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found.");
    if (order.assigned_technician_id !== user.userId) throw new HttpError(403, "ORDER_NOT_ASSIGNED", "Order is not assigned to current technician.");
    if (order.version !== authorizationRequest.orderVersion) throw new HttpError(409, "VERSION_CONFLICT", "Order version is stale.");
    if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_ELIGIBLE", "Order is not eligible for a cut authorization.");
    if (order.physical_status !== "NONE") throw new HttpError(409, "PHYSICAL_STATUS_NOT_ELIGIBLE", "Physical status must be NONE before a new cut authorization.");

    const authorizationId = randomUUID();
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + context.config.authorizationTtlSeconds * 1000).toISOString();
    await client.query(
      `INSERT INTO cut_authorizations(authorization_id, operation_id, order_id, technician_id, device_id, order_version, token_hash, status, expires_at, source, action, technician_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED', $8, $9, 'CUT', $10)`,
      [authorizationId, authorizationRequest.operationId, authorizationRequest.orderId, user.userId, authorizationRequest.deviceId, authorizationRequest.orderVersion, hashToken(token), expiresAt, PROVISIONAL_SOURCE, user.displayName],
    );
    await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "AUTHORIZE_CUT", result: "accepted", entityId: authorizationId, orderId: authorizationRequest.orderId, operationId: authorizationRequest.operationId, deviceId: authorizationRequest.deviceId });
    return { authorization_id: authorizationId, token, order_id: authorizationRequest.orderId, technician_id: user.userId, technician_name_snapshot: user.displayName, device_id: authorizationRequest.deviceId, operation_id: authorizationRequest.operationId, version: authorizationRequest.orderVersion, issued_at: new Date().toISOString(), expires_at: expiresAt, source: PROVISIONAL_SOURCE };
  });
  context.logEvent("authorization.cut", { requestId: String(response.getHeader("x-request-id")), result: "reserved" });
  sendJson(response, 200, result);
}

async function readCutAuthorizationRequest(request: IncomingMessage, maxBodyBytes: number): Promise<CutAuthorizationRequest> {
  const body = await parseJsonBody(request, maxBodyBytes);
  return {
    operationId: requiredString(body.operation_id, "operation_id"),
    orderId: requiredString(body.order_id, "order_id"),
    deviceId: requiredString(body.device_id, "device_id"),
    orderVersion: requiredInteger(body.order_version, "order_version"),
  };
}

function belongsToAnotherCutAuthorization(prior: ExistingCutAuthorization, userId: string): boolean {
  return prior.technician_id !== userId || prior.action !== "CUT";
}
