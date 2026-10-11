/**
 * Aceptación de cortes y reconexiones sincronizados. En la misma transacción:
 * - CUT: orden `GENERADO`/`NONE` y versión vigente, evidencia verificada, autorización reservada para esta misma
 *   operación/orden/técnico/dispositivo/versión con token correcto; se consume (una vez, si no venció) y la
 *   orden pasa a `EJECUTADO`/`CONFIRMED`.
 * - RECONNECTION: orden `EJECUTADO`/`CONFIRMED`, exactamente un CUT confirmado en el ciclo, habilitación ya
 *   consumida por esta operación (sin reenviar el token) y evidencia verificada; la orden pasa a `RECONEXIÓN`.
 * Cualquier discrepancia deja la operación en conflicto y auditada; nunca se confirma un resultado a medias.
 */
import { hashToken } from "../../auth.js";
import type { PoolClient } from "pg";
import { HttpError } from "../../http.js";
import type { SessionUser, SyncPayload } from "../../types.js";
import { insertAudit } from "../audit/record.js";
import { type OrderRow } from "../projections/order.js";
import { hasVerifiedEvidence } from "../evidence/verification.js";
import { rejectSync, safeSyncPayload, type SyncResult } from "./support.js";

interface ReconnectionAuthorizationRow {
  authorization_id: string;
  operation_id: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string | null;
  device_id: string;
  order_version: number;
  status: string;
  consumed_operation_id: string | null;
  action: string;
}

interface CutAuthorizationRow {
  authorization_id: string;
  operation_id: string;
  token_hash: string;
  status: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string | null;
  device_id: string;
  order_version: number;
  action: string;
}

export async function applyPhysicalOperation(client: PoolClient, user: SessionUser, payload: SyncPayload, order: OrderRow): Promise<SyncResult> {
  if (payload.action === "RECONNECTION") return acceptReconnection(client, user, payload, order);
  return acceptCut(client, user, payload, order);
}

async function acceptReconnection(client: PoolClient, user: SessionUser, payload: SyncPayload, order: OrderRow): Promise<SyncResult> {
  if (order.status !== "EJECUTADO" || order.physical_status !== "CONFIRMED") return rejectSync(client, user, payload, "RECONNECTION requires an executed order with a confirmed cut.");
  if (payload.order_version === undefined || order.version !== payload.order_version) return rejectSync(client, user, payload, "Order version is stale.");
  const cuts = await client.query<{ operation_id: string }>("SELECT operation_id FROM sync_operations WHERE order_id = $1 AND action = 'CUT' AND status = 'acknowledged' FOR SHARE", [payload.order_id]);
  if (cuts.rows.length !== 1) return rejectSync(client, user, payload, "Order does not identify exactly one confirmed CUT cycle.");
  if (!payload.authorization_id || payload.authorization_token !== undefined) return rejectSync(client, user, payload, "RECONNECTION requires its consumed enablement identifier and must not resend the token.");
  const authorization = await client.query<ReconnectionAuthorizationRow>(
    "SELECT authorization_id, operation_id, order_id, technician_id, technician_name_snapshot, device_id, order_version, status, consumed_operation_id, action FROM cut_authorizations WHERE authorization_id = $1 FOR UPDATE",
    [payload.authorization_id],
  );
  const grant = authorization.rows[0];
  if (!grant || !matchesReconnectionAuthorization(grant, user, payload)) {
    return rejectSync(client, user, payload, "Consumed reconnection habilitation does not match this operation.");
  }
  if (payload.evidence_refs.length > 0 && !await hasVerifiedEvidence(client, payload, user.userId)) return rejectSync(client, user, payload, "RECONNECTION evidence is missing, unverified, or bound to another operation.");
  const updatedOrder = await client.query("UPDATE orders SET status = 'RECONEXIÓN', physical_status = 'CONFIRMED', version = version + 1, updated_at = now() WHERE order_id = $1 AND status = 'EJECUTADO' AND physical_status = 'CONFIRMED' AND version = $2", [payload.order_id, payload.order_version]);
  if (updatedOrder.rowCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Order changed while recording reconnection.");
  await client.query("UPDATE sync_operations SET status = 'acknowledged', conflict_reason = NULL, acknowledged_at = now() WHERE operation_id = $1", [payload.operation_id]);
  await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_RECONNECTION", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload), transition: { before: order.status, after: "RECONEXIÓN", version: payload.order_version + 1 } });
  return { status: "acknowledged" };
}

async function acceptCut(client: PoolClient, user: SessionUser, payload: SyncPayload, order: OrderRow): Promise<SyncResult> {
  if (order.status !== "GENERADO") return rejectSync(client, user, payload, "Only GENERADO orders can be cut.");
  if (order.physical_status !== "NONE") return rejectSync(client, user, payload, "Physical status must be NONE before a cut can be synchronized.");
  if (payload.evidence_refs.length > 0 && !await hasVerifiedEvidence(client, payload, user.userId)) return rejectSync(client, user, payload, "CUT evidence is missing, unverified, or bound to another operation.");
  if (!payload.authorization_id || !payload.authorization_token || payload.order_version === undefined) return rejectSync(client, user, payload, "Cut requires authorization, token, and order version.");
  if (order.version !== payload.order_version) return rejectSync(client, user, payload, "Order version is stale.");
  const authorization = await client.query<CutAuthorizationRow>(
    "SELECT authorization_id, operation_id, token_hash, status, order_id, technician_id, technician_name_snapshot, device_id, order_version, action FROM cut_authorizations WHERE authorization_id = $1 FOR UPDATE",
    [payload.authorization_id],
  );
  const grant = authorization.rows[0];
  const authorizationToken = payload.authorization_token;
  if (!grant || !matchesCutAuthorization(grant, user, payload, authorizationToken)) {
    return rejectSync(client, user, payload, "Authorization is invalid, expired, consumed, or not bound to this operation.");
  }
  // Consumo de un solo uso: solo pasa de RESERVED a CONSUMED si no venció (hora de la base, no del cliente).
  const consumedAuthorization = await client.query("UPDATE cut_authorizations SET status = 'CONSUMED', consumed_at = clock_timestamp(), consumed_operation_id = $2 WHERE authorization_id = $1 AND action = 'CUT' AND status = 'RESERVED' AND expires_at > clock_timestamp()", [grant.authorization_id, payload.operation_id]);
  if (consumedAuthorization.rowCount !== 1) return rejectSync(client, user, payload, "Authorization is invalid, expired, consumed, or not bound to this operation.");
  const updatedOrder = await client.query("UPDATE orders SET status = 'EJECUTADO', physical_status = 'CONFIRMED', version = version + 1, updated_at = now() WHERE order_id = $1 AND version = $2", [payload.order_id, payload.order_version]);
  if (updatedOrder.rowCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Order changed while consuming authorization.");
  await client.query("UPDATE sync_operations SET status = 'acknowledged', conflict_reason = NULL, acknowledged_at = now() WHERE operation_id = $1", [payload.operation_id]);
  await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_CUT", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload), transition: { before: order.status, after: "EJECUTADO", version: payload.order_version + 1 } });
  return { status: "acknowledged" };
}

function matchesReconnectionAuthorization(grant: ReconnectionAuthorizationRow, user: SessionUser, payload: SyncPayload): boolean {
  return grant.action === "RECONNECTION" &&
    grant.status === "CONSUMED" &&
    grant.consumed_operation_id === payload.operation_id &&
    grant.operation_id === payload.operation_id &&
    grant.order_id === payload.order_id &&
    grant.technician_id === user.userId &&
    grant.device_id === payload.device_id &&
    grant.order_version === payload.order_version &&
    Boolean(grant.technician_name_snapshot) &&
    grant.technician_name_snapshot === payload.technician_name_snapshot;
}

function matchesCutAuthorization(grant: CutAuthorizationRow, user: SessionUser, payload: SyncPayload, authorizationToken: string): boolean {
  return grant.action === "CUT" &&
    grant.operation_id === payload.operation_id &&
    grant.order_id === payload.order_id &&
    grant.technician_id === user.userId &&
    grant.device_id === payload.device_id &&
    grant.order_version === payload.order_version &&
    grant.status === "RESERVED" &&
    grant.token_hash === hashToken(authorizationToken) &&
    grant.technician_name_snapshot === payload.technician_name_snapshot;
}
