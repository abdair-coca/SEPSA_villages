/**
 * Aceptación de cortes y reconexiones sincronizados. En la misma transacción:
 * - CUT: orden `GENERADO`/`NONE` y versión vigente, evidencia verificada, autorización reservada para esta misma
 *   operación/orden/técnico/dispositivo/versión con token correcto; se consume (una vez, si no venció) y la
 *   orden pasa a `EJECUTADO`/`CONFIRMED`.
 * - RECONNECTION: orden `EJECUTADO`/`CONFIRMED`, exactamente un CUT confirmado en el ciclo, habilitación ya
 *   consumida por esta operación (sin reenviar el token) y evidencia verificada; la orden pasa a `RECONEXIÓN`.
 * Cualquier discrepancia deja la operación en conflicto y auditada; nunca se confirma un resultado a medias.
 * El SQL está en `repositories/`; el orden de las consultas es el original.
 */
import type { PoolClient } from "pg";
import { HttpError } from "../http/responses.js";
import type { OrderRow } from "../mappers/order.mapper.js";
import { insertAudit } from "../repositories/audit.repository.js";
import {
  consumeCutAuthorization,
  findCutAuthorizationForSyncForUpdate,
  findReconnectionAuthorizationForSyncForUpdate,
  type SyncCutAuthorizationRow,
  type SyncReconnectionAuthorizationRow,
} from "../repositories/authorizations.repository.js";
import { markOrderCutExecuted, markOrderReconnected } from "../repositories/orders.repository.js";
import { listAcknowledgedCutOperationsShared, markSyncOperationAcknowledged } from "../repositories/sync.repository.js";
import { hashToken } from "../shared/auth-crypto.js";
import type { SessionUser, SyncPayload } from "../types.js";
import { hasVerifiedEvidence } from "./evidence.service.js";
import { rejectSync, safeSyncPayload, type SyncResult } from "./sync-support.service.js";

export async function applyPhysicalOperation(client: PoolClient, user: SessionUser, payload: SyncPayload, order: OrderRow): Promise<SyncResult> {
  if (payload.action === "RECONNECTION") return acceptReconnection(client, user, payload, order);
  return acceptCut(client, user, payload, order);
}

async function acceptReconnection(client: PoolClient, user: SessionUser, payload: SyncPayload, order: OrderRow): Promise<SyncResult> {
  if (order.status !== "EJECUTADO" || order.physical_status !== "CONFIRMED") return rejectSync(client, user, payload, "RECONNECTION requiere una orden ejecutada con un corte confirmado.");
  if (payload.order_version === undefined || order.version !== payload.order_version) return rejectSync(client, user, payload, "La versión de la orden está desactualizada.");
  const cuts = await listAcknowledgedCutOperationsShared(client, payload.order_id);
  if (cuts.length !== 1) return rejectSync(client, user, payload, "La orden no identifica exactamente un ciclo CUT confirmado.");
  if (!payload.authorization_id || payload.authorization_token !== undefined) return rejectSync(client, user, payload, "RECONNECTION requiere el identificador de la habilitación consumida y no debe reenviar el token.");
  const grant = await findReconnectionAuthorizationForSyncForUpdate(client, payload.authorization_id);
  if (!grant || !matchesReconnectionAuthorization(grant, user, payload)) {
    return rejectSync(client, user, payload, "La habilitación de reconexión consumida no corresponde a esta operación.");
  }
  if (payload.evidence_refs.length > 0 && !await hasVerifiedEvidence(client, payload, user.userId)) return rejectSync(client, user, payload, "Falta la evidencia de RECONNECTION, no está verificada o está ligada a otra operación.");
  const updatedCount = await markOrderReconnected(client, payload.order_id, payload.order_version);
  if (updatedCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "La orden cambió mientras se registraba la reconexión.");
  await markSyncOperationAcknowledged(client, payload.operation_id);
  await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_RECONNECTION", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload), transition: { before: order.status, after: "RECONEXIÓN", version: payload.order_version + 1 } });
  return { status: "acknowledged" };
}

async function acceptCut(client: PoolClient, user: SessionUser, payload: SyncPayload, order: OrderRow): Promise<SyncResult> {
  if (order.status !== "GENERADO") return rejectSync(client, user, payload, "Solo se pueden cortar órdenes en estado GENERADO.");
  if (order.physical_status !== "NONE") return rejectSync(client, user, payload, "El estado físico debe ser NONE antes de sincronizar un corte.");
  if (payload.evidence_refs.length > 0 && !await hasVerifiedEvidence(client, payload, user.userId)) return rejectSync(client, user, payload, "Falta la evidencia de CUT, no está verificada o está ligada a otra operación.");
  if (!payload.authorization_id || !payload.authorization_token || payload.order_version === undefined) return rejectSync(client, user, payload, "CUT requiere autorización, token y versión de la orden.");
  if (order.version !== payload.order_version) return rejectSync(client, user, payload, "La versión de la orden está desactualizada.");
  const grant = await findCutAuthorizationForSyncForUpdate(client, payload.authorization_id);
  const authorizationToken = payload.authorization_token;
  if (!grant || !matchesCutAuthorization(grant, user, payload, authorizationToken)) {
    return rejectSync(client, user, payload, "La autorización no es válida, venció, ya fue consumida o no está ligada a esta operación.");
  }
  // Consumo de un solo uso: solo pasa de RESERVED a CONSUMED si no venció (hora de la base, no del cliente).
  const consumedCount = await consumeCutAuthorization(client, grant.authorization_id, payload.operation_id);
  if (consumedCount !== 1) return rejectSync(client, user, payload, "La autorización no es válida, venció, ya fue consumida o no está ligada a esta operación.");
  const updatedCount = await markOrderCutExecuted(client, payload.order_id, payload.order_version);
  if (updatedCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "La orden cambió mientras se consumía la autorización.");
  await markSyncOperationAcknowledged(client, payload.operation_id);
  await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_CUT", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload), transition: { before: order.status, after: "EJECUTADO", version: payload.order_version + 1 } });
  return { status: "acknowledged" };
}

function matchesReconnectionAuthorization(grant: SyncReconnectionAuthorizationRow, user: SessionUser, payload: SyncPayload): boolean {
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

function matchesCutAuthorization(grant: SyncCutAuthorizationRow, user: SessionUser, payload: SyncPayload, authorizationToken: string): boolean {
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
