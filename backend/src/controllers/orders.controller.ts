/**
 * HTTP de órdenes: lista de técnicos (`GET /v1/technicians`), lista y comandos de órdenes para el ADMIN
 * (crear, crear en lote, asignar) y paquete de trabajo del técnico (`GET /v1/technician/orders`).
 * Solo lee y valida la forma de la petición, comprueba el rol, llama a `services/orders.service.ts` y envía
 * la respuesta; las reglas y el SQL no viven aquí.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../http/responses.js";
import { toOrder } from "../mappers/order.mapper.js";
import { toTechnician } from "../mappers/session.mapper.js";
import { createOrderService } from "../services/orders.service.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { parseNonNegativeInteger, requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface OrderHandlers {
  listTechnicians(response: ServerResponse, user: SessionUser): Promise<void>;
  listOrders(response: ServerResponse, user: SessionUser): Promise<void>;
  createOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  createOrdersBatch(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  assignOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser, orderId: string | undefined): Promise<void>;
  technicianOrders(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
}

export function createOrderHandlers(context: ApplicationContext): OrderHandlers {
  const service = createOrderService(context);

  async function listTechnicians(response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const technicians = await service.listTechnicians();
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, technicians: technicians.map(toTechnician) });
  }

  async function listOrders(response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const orders = await service.listOrders();
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, orders: orders.map(toOrder) });
  }

  async function createOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const operationId = requiredString(body.operation_id, "operation_id");
    const debtorId = requiredString(body.debtor_id, "debtor_id");
    const purpose = requiredString(body.purpose, "purpose");
    const result = await service.createOrder(user, { operationId, debtorId, purpose });
    sendJson(response, 201, result);
  }

  async function createOrdersBatch(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const batchId = requiredString(body.batch_id, "batch_id");
    const purpose = requiredString(body.purpose, "purpose");
    const rawDebtorIds = body.debtor_ids;
    if (!Array.isArray(rawDebtorIds) || rawDebtorIds.some((value) => typeof value !== "string")) throw new HttpError(400, "INVALID_REQUEST", "debtor_ids debe ser una lista de textos.");
    const debtorIds = [...new Set(rawDebtorIds.map((value) => value.trim()).filter(Boolean))];
    if (!debtorIds.length || debtorIds.length > 500) throw new HttpError(400, "INVALID_REQUEST", "debtor_ids debe contener entre 1 y 500 elementos.");
    const result = await service.createOrdersBatch(user, { batchId, debtorIds, purpose });
    sendJson(response, 201, result);
  }

  async function assignOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser, orderId: string | undefined): Promise<void> {
    requireRole(user, "ADMIN");
    if (!orderId) throw new HttpError(400, "INVALID_REQUEST", "order_id es obligatorio.");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const operationId = requiredString(body.operation_id, "operation_id");
    const technicianId = requiredString(body.technician_id, "technician_id");
    const expectedVersion = requiredInteger(body.expected_version, "expected_version");
    const result = await service.assignOrder(user, { orderId, operationId, technicianId, expectedVersion });
    sendJson(response, 200, result);
  }

  async function technicianOrders(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const deviceId = requiredString(url.searchParams.get("device_id"), "device_id");
    const knownVersionText = url.searchParams.get("known_version");
    const knownVersion = knownVersionText === null ? 0 : parseNonNegativeInteger(knownVersionText, "known_version");
    const { package: packageValue, checksum } = await service.buildWorkPackage(user, deviceId, knownVersion);
    sendJson(response, 200, { package: packageValue, authenticity: PROVISIONAL_SOURCE, integrity: PROVISIONAL_SOURCE, validation: "PILOT_PROVISIONAL_VALID", checksum });
  }

  return { listTechnicians, listOrders, createOrder, createOrdersBatch, assignOrder, technicianOrders };
}
