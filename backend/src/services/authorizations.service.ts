/**
 * Reglas de las autorizaciones de corte y las habilitaciones de reconexión. No conoce HTTP ni escribe SQL
 * (`repositories/authorizations.repository.ts`).
 * - Corte: reserva una autorización de un solo uso ligada a operación, orden, técnico, dispositivo y versión,
 *   con vencimiento (`AUTHORIZATION_TTL_SECONDS`). Exige orden asignada, versión vigente, `GENERADO` y estado
 *   físico `NONE`. El token solo se devuelve una vez; se guarda su hash. La app la consume al confirmar el corte
 *   (`consumeCutAuthorization`, D020); una reserva sin consumir de una versión anterior de la app se consume al
 *   aceptar el sync del CUT (`sync-physical-operations.service.ts`).
 * - Reconexión (contrato provisional del piloto): igual que la de corte, pero exige orden `EJECUTADO` con corte
 *   `CONFIRMED` y exactamente un ciclo de corte confirmado. Una reserva sin consumir se reemplaza (y se audita).
 * - Consumo: verifica token (por hash), operación, orden, técnico, dispositivo y versión, y marca la habilitación
 *   `CONSUMED` una sola vez. Repetir el consumo con la misma operación es un replay aceptado; con otra operación,
 *   vencida o con la orden cambiada, responde `not_enabled`. Todo intento queda auditado.
 */
import { randomUUID } from "node:crypto";
import { withTransaction } from "../db.js";
import { HttpError } from "../http/responses.js";
import type { OrderRow } from "../mappers/order.mapper.js";
import { insertAudit } from "../repositories/audit.repository.js";
import {
  consumeCutAuthorization,
  consumeReconnectionAuthorization,
  expireReservedAuthorization,
  expireStaleReconnectionReservations,
  findActiveReconnectionForUpdate,
  findAuthorizationByOperationForUpdate,
  findCutAuthorizationByOperation,
  findAuthorizationGrantForUpdate,
  findGrantStatusByOperationForUpdate,
  insertCutAuthorization,
  insertReconnectionAuthorization,
  rejectReservedAuthorization,
  type ExistingCutAuthorization,
  type ExistingReconnectionAuthorization,
  type AuthorizationGrant,
} from "../repositories/authorizations.repository.js";
import { findOrderForUpdate, findOrderStateForUpdate, type OrderState } from "../repositories/orders.repository.js";
import { listAcknowledgedCutOperationsShared } from "../repositories/sync.repository.js";
import { PROVISIONAL_SOURCE, type ServiceContext } from "../shared/application-context.js";
import { createOpaqueToken, hashToken } from "../shared/auth-crypto.js";
import type { SessionUser } from "../types.js";

export interface AuthorizationRequest {
  operationId: string;
  orderId: string;
  deviceId: string;
  orderVersion: number;
}

export interface ConsumeReconnectionRequest {
  enablementId: string;
  token: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  version: number;
}

export interface ConsumeCutRequest {
  authorizationId: string;
  token: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  operationId: string;
  version: number;
}

export interface CutConsumeResult {
  status: "consumed" | "not_authorized";
  operation_id: string;
  source: string;
}

export interface CutAuthorizationLookupResult {
  status: "not_found" | "consumed" | "reserved" | "expired" | "rejected" | "unknown";
  operation_id: string;
  source: string;
}

export interface CutAuthorizationResult {
  authorization_id: string;
  token: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string;
  device_id: string;
  operation_id: string;
  version: number;
  issued_at: string;
  expires_at: string;
  source: string;
}

export interface ReconnectionEnablementResult {
  enablement_id: string;
  token: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string;
  device_id: string;
  operation_id: string;
  version: number;
  issued_at: string;
  expires_at: string;
  source: string;
}

export interface ReconnectionConsumeResult {
  status: "consumed" | "not_enabled";
  operation_id: string;
  source: string;
}

export interface ReconnectionLookupResult {
  status: "not_found" | "consumed" | "reserved" | "expired" | "rejected" | "unknown";
  operation_id: string;
  source: string;
}

export interface AuthorizationService {
  authorizeCut(user: SessionUser, request: AuthorizationRequest): Promise<CutAuthorizationResult>;
  authorizeReconnection(user: SessionUser, request: AuthorizationRequest): Promise<ReconnectionEnablementResult>;
  consumeReconnectionEnablement(user: SessionUser, request: ConsumeReconnectionRequest): Promise<ReconnectionConsumeResult>;
  lookupReconnectionEnablement(user: SessionUser, operationId: string): Promise<ReconnectionLookupResult>;
  consumeCutAuthorization(user: SessionUser, request: ConsumeCutRequest): Promise<CutConsumeResult>;
  lookupCutAuthorization(user: SessionUser, operationId: string): Promise<CutAuthorizationLookupResult>;
}

export function createAuthorizationService(context: ServiceContext): AuthorizationService {
  async function authorizeCut(user: SessionUser, authorizationRequest: AuthorizationRequest): Promise<CutAuthorizationResult> {
    return withTransaction(context.pool, async (client) => {
      const prior = await findCutAuthorizationByOperation(client, authorizationRequest.operationId);
      // Un operation_id solo puede tener una autorización: no se emite otra para el mismo intento.
      if (prior) {
        if (belongsToAnotherCutAuthorization(prior, user.userId)) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "El identificador de la operación de autorización está ligado a otra acción o técnico.");
        throw new HttpError(409, "AUTHORIZATION_OPERATION_REPLAY", "La operación de autorización ya tiene una reserva; use la respuesta guardada.");
      }

      const order = await findOrderForUpdate(client, authorizationRequest.orderId);
      if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "No se encontró la orden.");
      if (order.assigned_technician_id !== user.userId) throw new HttpError(403, "ORDER_NOT_ASSIGNED", "La orden no está asignada al técnico actual.");
      if (order.version !== authorizationRequest.orderVersion) throw new HttpError(409, "VERSION_CONFLICT", "La versión de la orden está desactualizada.");
      if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_ELIGIBLE", "La orden no es elegible para una autorización de corte.");
      if (order.physical_status !== "NONE") throw new HttpError(409, "PHYSICAL_STATUS_NOT_ELIGIBLE", "El estado físico debe ser NONE antes de una nueva autorización de corte.");

      const authorizationId = randomUUID();
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + context.config.authorizationTtlSeconds * 1000).toISOString();
      await insertCutAuthorization(client, { authorizationId, operationId: authorizationRequest.operationId, orderId: authorizationRequest.orderId, technicianId: user.userId, deviceId: authorizationRequest.deviceId, orderVersion: authorizationRequest.orderVersion, tokenHash: hashToken(token), expiresAt, technicianNameSnapshot: user.displayName });
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "AUTHORIZE_CUT", result: "accepted", entityId: authorizationId, orderId: authorizationRequest.orderId, operationId: authorizationRequest.operationId, deviceId: authorizationRequest.deviceId });
      return { authorization_id: authorizationId, token, order_id: authorizationRequest.orderId, technician_id: user.userId, technician_name_snapshot: user.displayName, device_id: authorizationRequest.deviceId, operation_id: authorizationRequest.operationId, version: authorizationRequest.orderVersion, issued_at: new Date().toISOString(), expires_at: expiresAt, source: PROVISIONAL_SOURCE };
    });
  }

  async function authorizeReconnection(user: SessionUser, authorizationRequest: AuthorizationRequest): Promise<ReconnectionEnablementResult> {
    return withTransaction(context.pool, async (client) => {
      const order = await findOrderForUpdate(client, authorizationRequest.orderId);
      if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "No se encontró la orden.");
      if (order.assigned_technician_id !== user.userId) throw new HttpError(403, "ORDER_NOT_ASSIGNED", "La orden no está asignada al técnico actual.");
      if (order.version !== authorizationRequest.orderVersion) throw new HttpError(409, "VERSION_CONFLICT", "La versión de la orden está desactualizada.");
      if (!isEligibleReconnectionOrder(order)) throw new HttpError(409, "ORDER_NOT_ELIGIBLE", "La reconexión requiere un corte confirmado en una orden ejecutada.");

      const cuts = await listAcknowledgedCutOperationsShared(client, authorizationRequest.orderId);
      if (cuts.length !== 1) throw new HttpError(409, "CUT_CYCLE_AMBIGUOUS", "La orden no identifica exactamente un ciclo de corte confirmado remotamente.");
      await expireStaleReconnectionReservations(client, authorizationRequest.orderId);

      const prior = await findAuthorizationByOperationForUpdate(client, authorizationRequest.operationId);
      if (prior) {
        if (belongsToAnotherReconnection(prior, authorizationRequest, user.userId)) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "El identificador de la operación de autorización está ligado a otro contexto.");
        throw new HttpError(409, "ENABLEMENT_OPERATION_REPLAY", "Esta operación ya tiene una reserva de habilitación; verifique su estado antes de iniciar otra operación.");
      }

      const activeAuthorization = await findActiveReconnectionForUpdate(client, authorizationRequest.orderId);
      if (activeAuthorization?.status === "CONSUMED") throw new HttpError(409, "RECONNECTION_ALREADY_CONSUMED", "Ya se consumió una operación de reconexión para esta orden.");
      if (activeAuthorization?.status === "RESERVED") {
        await rejectReservedAuthorization(client, activeAuthorization.authorization_id);
        await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "RECONNECTION_ENABLEMENT_REPLACED", result: "accepted", entityId: activeAuthorization.authorization_id, orderId: authorizationRequest.orderId, operationId: activeAuthorization.operation_id, deviceId: authorizationRequest.deviceId, reason: "UNCONSUMED_RESERVATION_REPLACED", metadata: { replacement_operation_id: authorizationRequest.operationId, source: PROVISIONAL_SOURCE } });
      }

      const authorizationId = randomUUID();
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + context.config.authorizationTtlSeconds * 1000).toISOString();
      await insertReconnectionAuthorization(client, { authorizationId, operationId: authorizationRequest.operationId, orderId: authorizationRequest.orderId, technicianId: user.userId, deviceId: authorizationRequest.deviceId, orderVersion: authorizationRequest.orderVersion, tokenHash: hashToken(token), expiresAt, technicianNameSnapshot: user.displayName });
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "AUTHORIZE_RECONNECTION", result: "accepted", entityId: authorizationId, orderId: authorizationRequest.orderId, operationId: authorizationRequest.operationId, deviceId: authorizationRequest.deviceId, metadata: { version: authorizationRequest.orderVersion, technician_name_snapshot: user.displayName, source: PROVISIONAL_SOURCE } });
      return { enablement_id: authorizationId, token, order_id: authorizationRequest.orderId, technician_id: user.userId, technician_name_snapshot: user.displayName, device_id: authorizationRequest.deviceId, operation_id: authorizationRequest.operationId, version: authorizationRequest.orderVersion, issued_at: new Date().toISOString(), expires_at: expiresAt, source: PROVISIONAL_SOURCE };
    });
  }

  async function consumeReconnectionEnablement(user: SessionUser, consumeRequest: ConsumeReconnectionRequest): Promise<ReconnectionConsumeResult> {
    return withTransaction(context.pool, async (client) => {
      const order = await findOrderStateForUpdate(client, consumeRequest.orderId);
      if (!order || order.assigned_technician_id !== user.userId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "No se encontraron la orden ni el técnico asignado.");

      const grant = await findAuthorizationGrantForUpdate(client, consumeRequest.enablementId);
      if (!hasExpectedBinding(grant, "RECONNECTION", { ...consumeRequest, authorizationId: consumeRequest.enablementId }, user.userId, hashToken(consumeRequest.token))) {
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
        if (grant.status === "RESERVED") await expireReservedAuthorization(client, consumeRequest.enablementId);
        await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ENABLEMENT_EXPIRED_OR_UNAVAILABLE", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
        return notEnabled(consumeRequest.operationId);
      }
      if (!isCurrentReconnectionOrder(order, consumeRequest.version)) {
        await rejectReservedAuthorization(client, consumeRequest.enablementId);
        await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ORDER_STATE_CONFLICT", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
        return notEnabled(consumeRequest.operationId);
      }
      const consumedCount = await consumeReconnectionAuthorization(client, consumeRequest.enablementId, consumeRequest.operationId);
      if (consumedCount !== 1) {
        await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "rejected", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason: "ENABLEMENT_EXPIRED_OR_UNAVAILABLE", metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
        return notEnabled(consumeRequest.operationId);
      }
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CONSUME_RECONNECTION", result: "accepted", entityId: consumeRequest.enablementId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, metadata: { version: consumeRequest.version, technician_name_snapshot: grant.technician_name_snapshot, source: PROVISIONAL_SOURCE } });
      return consumed(consumeRequest.operationId);
    });
  }

  async function lookupReconnectionEnablement(user: SessionUser, operationId: string): Promise<ReconnectionLookupResult> {
    return withTransaction(context.pool, async (client) => {
      const grant = await findGrantStatusByOperationForUpdate(client, operationId, "RECONNECTION");
      if (!grant || grant.technician_id !== user.userId) return { status: "not_found" as const, operation_id: operationId, source: PROVISIONAL_SOURCE };
      let status = authorizationStatus(grant.status);
      if (status === "reserved" && Date.parse(grant.expires_at) <= Date.now()) {
        await expireReservedAuthorization(client, grant.authorization_id);
        status = "expired";
      }
      return { status, operation_id: operationId, source: PROVISIONAL_SOURCE };
    });
  }

  /**
   * Consume la autorización de corte cuando el técnico confirma, antes de cortar (D020). Mismas reglas que la
   * habilitación de reconexión: vínculo y token exactos, `RESERVED` vigente y orden `GENERADO`/`NONE` en la versión
   * autorizada. El replay con la misma operación devuelve `consumed`; el sync posterior ya no depende del vencimiento.
   */
  async function consumeCutAuthorizationGrant(user: SessionUser, consumeRequest: ConsumeCutRequest): Promise<CutConsumeResult> {
    return withTransaction(context.pool, async (client) => {
      const audit = (result: "accepted" | "rejected", action: string, reason?: string) => insertAudit(client, { actorId: user.userId, actorRole: user.role, action, result, entityId: consumeRequest.authorizationId, orderId: consumeRequest.orderId, operationId: consumeRequest.operationId, deviceId: consumeRequest.deviceId, reason, metadata: { version: consumeRequest.version, source: PROVISIONAL_SOURCE } });
      const order = await findOrderStateForUpdate(client, consumeRequest.orderId);
      if (!order || order.assigned_technician_id !== user.userId) throw new HttpError(404, "ORDER_SCOPE_NOT_FOUND", "No se encontraron la orden ni el técnico asignado.");

      const grant = await findAuthorizationGrantForUpdate(client, consumeRequest.authorizationId);
      if (!hasExpectedBinding(grant, "CUT", consumeRequest, user.userId, hashToken(consumeRequest.token))) {
        await audit("rejected", "CONSUME_CUT", "AUTHORIZATION_BINDING_CONFLICT");
        return notAuthorized(consumeRequest.operationId);
      }
      if (grant.status === "CONSUMED") {
        if (grant.consumed_operation_id !== consumeRequest.operationId) {
          await audit("rejected", "CONSUME_CUT", "AUTHORIZATION_ALREADY_CONSUMED");
          return notAuthorized(consumeRequest.operationId);
        }
        await audit("accepted", "CONSUME_CUT_REPLAY");
        return cutConsumed(consumeRequest.operationId);
      }
      if (grant.status !== "RESERVED" || Date.parse(grant.expires_at) <= Date.now()) {
        if (grant.status === "RESERVED") await expireReservedAuthorization(client, consumeRequest.authorizationId);
        await audit("rejected", "CONSUME_CUT", "AUTHORIZATION_EXPIRED_OR_UNAVAILABLE");
        return notAuthorized(consumeRequest.operationId);
      }
      if (order.status !== "GENERADO" || order.physical_status !== "NONE" || order.version !== consumeRequest.version) {
        await rejectReservedAuthorization(client, consumeRequest.authorizationId);
        await audit("rejected", "CONSUME_CUT", "ORDER_STATE_CONFLICT");
        return notAuthorized(consumeRequest.operationId);
      }
      const consumedCount = await consumeCutAuthorization(client, consumeRequest.authorizationId, consumeRequest.operationId);
      if (consumedCount !== 1) {
        await audit("rejected", "CONSUME_CUT", "AUTHORIZATION_EXPIRED_OR_UNAVAILABLE");
        return notAuthorized(consumeRequest.operationId);
      }
      await audit("accepted", "CONSUME_CUT");
      return cutConsumed(consumeRequest.operationId);
    });
  }

  /** Estado de la autorización de corte de una operación del técnico actual, sin token. */
  async function lookupCutAuthorization(user: SessionUser, operationId: string): Promise<CutAuthorizationLookupResult> {
    return withTransaction(context.pool, async (client) => {
      const grant = await findGrantStatusByOperationForUpdate(client, operationId, "CUT");
      if (!grant || grant.technician_id !== user.userId) return { status: "not_found" as const, operation_id: operationId, source: PROVISIONAL_SOURCE };
      let status = authorizationStatus(grant.status);
      if (status === "reserved" && Date.parse(grant.expires_at) <= Date.now()) {
        await expireReservedAuthorization(client, grant.authorization_id);
        status = "expired";
      }
      return { status, operation_id: operationId, source: PROVISIONAL_SOURCE };
    });
  }

  return { authorizeCut, authorizeReconnection, consumeReconnectionEnablement, lookupReconnectionEnablement, consumeCutAuthorization: consumeCutAuthorizationGrant, lookupCutAuthorization };
}

function belongsToAnotherCutAuthorization(prior: ExistingCutAuthorization, userId: string): boolean {
  return prior.technician_id !== userId || prior.action !== "CUT";
}

function isEligibleReconnectionOrder(order: OrderRow): boolean {
  return order.status === "EJECUTADO" && order.physical_status === "CONFIRMED";
}

function belongsToAnotherReconnection(prior: ExistingReconnectionAuthorization, request: AuthorizationRequest, userId: string): boolean {
  return prior.technician_id !== userId || prior.order_id !== request.orderId || prior.device_id !== request.deviceId || prior.action !== "RECONNECTION";
}

function hasExpectedBinding(grant: AuthorizationGrant | undefined, action: "CUT" | "RECONNECTION", request: ConsumeCutRequest, userId: string, tokenHash: string): grant is AuthorizationGrant {
  return Boolean(grant && grant.action === action && grant.operation_id === request.operationId && grant.order_id === request.orderId && grant.technician_id === userId && grant.device_id === request.deviceId && grant.order_version === request.version && grant.token_hash === tokenHash);
}

function isCurrentReconnectionOrder(order: OrderState, version: number): boolean {
  return order.status === "EJECUTADO" && order.physical_status === "CONFIRMED" && order.version === version;
}

/** `REJECTED` (reserva reemplazada o con la orden cambiada) tampoco se consumió: se informa como `rejected`. */
function authorizationStatus(status: string): "consumed" | "reserved" | "expired" | "rejected" | "unknown" {
  if (status === "CONSUMED") return "consumed";
  if (status === "RESERVED") return "reserved";
  if (status === "EXPIRED") return "expired";
  if (status === "REJECTED") return "rejected";
  return "unknown";
}

function notAuthorized(operationId: string): CutConsumeResult {
  return { status: "not_authorized", operation_id: operationId, source: PROVISIONAL_SOURCE };
}

function cutConsumed(operationId: string): CutConsumeResult {
  return { status: "consumed", operation_id: operationId, source: PROVISIONAL_SOURCE };
}

function notEnabled(operationId: string): ReconnectionConsumeResult {
  return { status: "not_enabled", operation_id: operationId, source: PROVISIONAL_SOURCE };
}

function consumed(operationId: string): ReconnectionConsumeResult {
  return { status: "consumed", operation_id: operationId, source: PROVISIONAL_SOURCE };
}
