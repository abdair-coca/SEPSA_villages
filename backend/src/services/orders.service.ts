/**
 * Reglas de negocio de órdenes: crear (individual y en lote), asignar a un técnico, listar y armar el paquete
 * de trabajo del técnico. No conoce HTTP ni escribe SQL (`repositories/orders.repository.ts`).
 * - Cada comando es idempotente por `operation_id` (`claimCommand`), corre en una transacción y queda auditado.
 * - No se crea una segunda orden activa para el mismo deudor (o cuenta, en lote); la asignación exige la
 *   versión esperada y que la orden esté `GENERADO`.
 * - El paquete de trabajo usa una versión monótona por técnico y dispositivo (nunca menor que la conocida
 *   por el cliente), con checksum y auditoría en una segunda transacción.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../db.js";
import { HttpError } from "../http/responses.js";
import { toOrder, type OrderRow } from "../mappers/order.mapper.js";
import type { TechnicianRow } from "../mappers/session.mapper.js";
import { findDebtorForUpdate, findDebtorsForUpdate } from "../repositories/debtors.repository.js";
import { insertAudit } from "../repositories/audit.repository.js";
import { completeCommand } from "../repositories/commands.repository.js";
import {
  ensureWorkPackageVersion,
  findOrderById,
  findOrderForUpdate,
  hasActiveOrderForAccountShared,
  hasActiveOrderForDebtorShared,
  insertOrder,
  insertOrderAssignment,
  isEnabledTechnician,
  listEnabledTechnicians,
  listOrders,
  listOrdersAssignedTo,
  lockWorkPackageLastVersion,
  updateOrderAssignment,
  updateWorkPackageVersion,
} from "../repositories/orders.repository.js";
import { PROVISIONAL_SOURCE, type ServiceContext } from "../shared/application-context.js";
import { digestJson } from "../shared/json-digest.js";
import type { SessionUser } from "../types.js";
import { claimCommand } from "./command-idempotency.service.js";

export interface CreateOrderInput {
  operationId: string;
  debtorId: string;
  purpose: string;
}

export interface CreateOrdersBatchInput {
  batchId: string;
  debtorIds: string[];
  purpose: string;
}

export interface AssignOrderInput {
  orderId: string;
  operationId: string;
  technicianId: string;
  expectedVersion: number;
}

export interface WorkPackageResult {
  package: {
    package_id: string;
    technician_id: string;
    device_id: string;
    version: number;
    downloaded_at: string;
    orders: Record<string, unknown>[];
    source: string;
  };
  checksum: string;
}

export interface OrderService {
  listTechnicians(): Promise<TechnicianRow[]>;
  listOrders(): Promise<OrderRow[]>;
  createOrder(user: SessionUser, input: CreateOrderInput): Promise<unknown>;
  createOrdersBatch(user: SessionUser, input: CreateOrdersBatchInput): Promise<unknown>;
  assignOrder(user: SessionUser, input: AssignOrderInput): Promise<unknown>;
  buildWorkPackage(user: SessionUser, deviceId: string, knownVersion: number): Promise<WorkPackageResult>;
}

export function createOrderService(context: ServiceContext): OrderService {
  async function createOrder(user: SessionUser, input: CreateOrderInput): Promise<unknown> {
    const { operationId, debtorId, purpose } = input;
    if (purpose !== "CUT") throw new HttpError(400, "INVALID_PURPOSE", "Only CUT is available in this provisional slice.");
    const requestHash = digestJson({ operation_id: operationId, debtor_id: debtorId, purpose });
    return withTransaction(context.pool, async (client) => {
      const command = await claimCommand(client, operationId, "CREATE_ORDER", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const debtor = await findDebtorForUpdate(client, debtorId);
      if (!debtor) throw new HttpError(404, "DEBTOR_NOT_FOUND", "Debtor was not found.");
      if (await hasActiveOrderForDebtorShared(client, debtorId, purpose)) throw new HttpError(409, "DUPLICATE_ORDER", "An active provisional order already exists for this debtor.");
      const orderId = randomUUID();
      const cuc = `CUC-${randomUUID()}`;
      const order = await insertOrderAndRead(client, {
        orderId,
        cuc,
        debtorId,
        purpose,
        createdBy: user.userId,
        missingMessage: "Created provisional order could not be read.",
      });
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CREATE_ORDER", result: "accepted", entityId: orderId, orderId, operationId });
      await completeCommand(client, operationId, order);
      return order;
    });
  }

  async function createOrdersBatch(user: SessionUser, input: CreateOrdersBatchInput): Promise<unknown> {
    const { batchId, debtorIds, purpose } = input;
    if (purpose !== "CUT") throw new HttpError(400, "INVALID_PURPOSE", "Only CUT is available in this provisional slice.");
    const requestHash = digestJson({ batch_id: batchId, debtor_ids: debtorIds, purpose });
    return withTransaction(context.pool, async (client) => {
      const command = await claimCommand(client, batchId, "CREATE_ORDER_BATCH", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const debtors = await findDebtorsForUpdate(client, debtorIds);
      const debtorById = new Map(debtors.map((debtor) => [debtor.debtor_id, debtor]));
      const created: Record<string, unknown>[] = [];
      const skipped: Array<{ debtor_id: string; reason: "ACTIVE_ORDER_EXISTS" | "DEBTOR_NOT_FOUND" | "SUPPLY_ID_REQUIRED"; message: string }> = [];
      for (const debtorId of debtorIds) {
        const debtor = debtorById.get(debtorId);
        if (!debtor) { skipped.push({ debtor_id: debtorId, reason: "DEBTOR_NOT_FOUND", message: "Suministro no encontrado." }); continue; }
        if (!debtor.supply_id.trim()) { skipped.push({ debtor_id: debtorId, reason: "SUPPLY_ID_REQUIRED", message: "Suministro sin identificador confirmado." }); continue; }
        if (await hasActiveOrderForAccountShared(client, debtor.account_id, purpose)) { skipped.push({ debtor_id: debtorId, reason: "ACTIVE_ORDER_EXISTS", message: "Ya existe una orden activa para esta cuenta." }); continue; }
        const orderId = randomUUID();
        const cuc = `CUC-${randomUUID()}`;
        created.push(await insertOrderAndRead(client, {
          orderId,
          cuc,
          debtorId,
          purpose,
          createdBy: user.userId,
          missingMessage: "Created provisional batch order could not be read.",
        }));
        await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CREATE_ORDER", result: "accepted", entityId: orderId, orderId, operationId: `${batchId}:${debtorId}` });
      }
      const responseValue = { batch_id: batchId, requested_debtor_ids: debtorIds, created, skipped };
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CREATE_ORDER_BATCH", result: "accepted", entityId: batchId, operationId: batchId, metadata: { requested: debtorIds.length, created: created.length, skipped: skipped.length } });
      await completeCommand(client, batchId, responseValue);
      return responseValue;
    });
  }

  async function assignOrder(user: SessionUser, input: AssignOrderInput): Promise<unknown> {
    const { orderId, operationId, technicianId, expectedVersion } = input;
    const requestHash = digestJson({ operation_id: operationId, order_id: orderId, technician_id: technicianId, expected_version: expectedVersion });
    return withTransaction(context.pool, async (client) => {
      const command = await claimCommand(client, operationId, "ASSIGN_ORDER", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      if (!await isEnabledTechnician(client, technicianId)) throw new HttpError(404, "TECHNICIAN_NOT_FOUND", "Technician was not found.");
      const order = await findOrderForUpdate(client, orderId);
      if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found.");
      if (order.version !== expectedVersion) throw new HttpError(409, "VERSION_CONFLICT", "Order version is stale.");
      if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_ASSIGNABLE", "Only GENERADO orders can be assigned.");
      const nextVersion = order.version + 1;
      const updatedCount = await updateOrderAssignment(client, orderId, technicianId, nextVersion, expectedVersion);
      if (updatedCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Order changed during assignment.");
      const updatedOrder = await findOrderById(client, orderId);
      if (!updatedOrder) throw new Error("Updated provisional order could not be read.");
      const next = toOrder(updatedOrder);
      await insertOrderAssignment(client, { assignmentId: randomUUID(), orderId, technicianId, assignedBy: user.userId, fromTechnicianId: order.assigned_technician_id, version: nextVersion });
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "ASSIGN_ORDER", result: "accepted", entityId: orderId, orderId, operationId, transition: { before: order.assigned_technician_id, after: technicianId, version: nextVersion } });
      await completeCommand(client, operationId, next);
      return next;
    });
  }

  async function buildWorkPackage(user: SessionUser, deviceId: string, knownVersion: number): Promise<WorkPackageResult> {
    const packageValue = await withTransaction(context.pool, async (client) => {
      await ensureWorkPackageVersion(client, user.userId, deviceId);
      const lastVersion = await lockWorkPackageLastVersion(client, user.userId, deviceId);
      const nextVersion = Math.max(Date.now(), lastVersion + 1, knownVersion + 1);
      if (!Number.isSafeInteger(nextVersion)) throw new HttpError(400, "INVALID_REQUEST", "known_version exceeds safe integer range.");
      const orders = (await listOrdersAssignedTo(client, user.userId)).map(toOrder);
      const generatedAt = new Date().toISOString();
      await updateWorkPackageVersion(client, user.userId, deviceId, nextVersion);
      return { package_id: randomUUID(), technician_id: user.userId, device_id: deviceId, version: nextVersion, downloaded_at: generatedAt, orders, source: PROVISIONAL_SOURCE };
    });
    const checksum = digestJson(packageValue);
    await withTransaction(context.pool, async (client) => {
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "DOWNLOAD_ASSIGNED", result: "accepted", deviceId, metadata: { package_id: packageValue.package_id, technician_id: packageValue.technician_id, device_id: packageValue.device_id, version: packageValue.version, downloaded_at: packageValue.downloaded_at, order_ids: packageValue.orders.map((order) => order.order_id) } });
    });
    return { package: packageValue, checksum };
  }

  return {
    listTechnicians: () => listEnabledTechnicians(context.pool),
    listOrders: () => listOrders(context.pool),
    createOrder,
    createOrdersBatch,
    assignOrder,
    buildWorkPackage,
  };
}

interface InsertOrderAndReadOptions {
  orderId: string;
  cuc: string;
  debtorId: string;
  purpose: string;
  createdBy: string;
  missingMessage: string;
}

async function insertOrderAndRead(client: PoolClient, options: InsertOrderAndReadOptions): Promise<Record<string, unknown>> {
  await insertOrder(client, { orderId: options.orderId, cuc: options.cuc, debtorId: options.debtorId, purpose: options.purpose, createdBy: options.createdBy });
  const order = await findOrderById(client, options.orderId);
  if (!order) throw new Error(options.missingMessage);
  return toOrder(order);
}
