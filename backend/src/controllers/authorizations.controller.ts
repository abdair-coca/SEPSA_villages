/**
 * HTTP de las autorizaciones: corte (`POST /v1/authorizations/cut`), habilitación de reconexión (emitir,
 * consumir y consultar). Todas son solo TECHNICIAN. Lee y valida la forma del cuerpo, comprueba el rol y que el
 * técnico del cuerpo sea el de la sesión, emite el log de seguridad y delega las reglas (un solo uso, vencimiento,
 * vínculos, auditoría) en `services/authorizations.service.ts`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../http/responses.js";
import { createAuthorizationService, type AuthorizationRequest, type ConsumeReconnectionRequest } from "../services/authorizations.service.js";
import type { ApplicationContext } from "../shared/application-context.js";
import { isUuid, requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface AuthorizationHandlers {
  authorizeCut(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  authorizeReconnection(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  consumeReconnectionEnablement(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  lookupReconnectionEnablement(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void>;
}

export function createAuthorizationHandlers(context: ApplicationContext): AuthorizationHandlers {
  const service = createAuthorizationService(context);

  async function authorizeCut(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const authorizationRequest = await readAuthorizationRequest(request, context.config.maxBodyBytes);
    const result = await service.authorizeCut(user, authorizationRequest);
    context.logEvent("authorization.cut", { requestId: String(response.getHeader("x-request-id")), result: "reserved" });
    sendJson(response, 200, result);
  }

  async function authorizeReconnection(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const authorizationRequest = await readAuthorizationRequest(request, context.config.maxBodyBytes);
    if (!isUuid(authorizationRequest.orderId) || authorizationRequest.orderVersion < 1) throw new HttpError(400, "INVALID_REQUEST", "order_id y order_version no son válidos.");
    const result = await service.authorizeReconnection(user, authorizationRequest);
    context.logEvent("authorization.reconnection", { requestId: String(response.getHeader("x-request-id")), result: "reserved" });
    sendJson(response, 200, result);
  }

  async function consumeReconnectionEnablement(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const consumeRequest = await readConsumeRequest(request, context.config.maxBodyBytes);
    if (consumeRequest.technicianId !== user.userId) throw new HttpError(403, "TECHNICIAN_SCOPE", "El técnico de la habilitación no coincide con la sesión.");
    if (!isUuid(consumeRequest.orderId) || consumeRequest.version < 1) throw new HttpError(400, "INVALID_REQUEST", "order_id y version no son válidos.");
    const result = await service.consumeReconnectionEnablement(user, consumeRequest);
    context.logEvent("authorization.reconnection", { requestId: String(response.getHeader("x-request-id")), result: "consumed" });
    sendJson(response, 200, result);
  }

  async function lookupReconnectionEnablement(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void> {
    requireRole(user, "TECHNICIAN");
    if (!operationId) throw new HttpError(400, "INVALID_REQUEST", "operation_id es obligatorio.");
    const result = await service.lookupReconnectionEnablement(user, operationId);
    sendJson(response, 200, result);
  }

  return { authorizeCut, authorizeReconnection, consumeReconnectionEnablement, lookupReconnectionEnablement };
}

async function readAuthorizationRequest(request: IncomingMessage, maxBodyBytes: number): Promise<AuthorizationRequest> {
  const body = await parseJsonBody(request, maxBodyBytes);
  return {
    operationId: requiredString(body.operation_id, "operation_id"),
    orderId: requiredString(body.order_id, "order_id"),
    deviceId: requiredString(body.device_id, "device_id"),
    orderVersion: requiredInteger(body.order_version, "order_version"),
  };
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
