import type { IncomingMessage, ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import { withTransaction } from "../../db.js";
import { HttpError, parseJsonBody, requiredInteger, requiredString, sendJson } from "../../http.js";
import type { SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { randomUUID } from "node:crypto";
import { insertAudit } from "../audit/record.js";
import { claimCommand } from "../shared/command-idempotency.js";
import { digestJson } from "../shared/json-digest.js";
import { debtorColumns, type DebtorRow } from "../projections/debtor.js";
import { orderSelect, toOrder, type OrderRow } from "../projections/order.js";
import { requireRole } from "../shared/request-validation.js";

export interface OrderCommandHandlers {
  createOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  createOrdersBatch(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  assignOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser, orderId: string | undefined): Promise<void>;
}

export function createOrderCommandHandlers(context: ApplicationContext): OrderCommandHandlers {
  async function createOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const operationId = requiredString(body.operation_id, "operation_id");
    const debtorId = requiredString(body.debtor_id, "debtor_id");
    const purpose = requiredString(body.purpose, "purpose");
    if (purpose !== "CUT") throw new HttpError(400, "INVALID_PURPOSE", "Only CUT is available in this provisional slice.");
    const requestHash = digestJson({ operation_id: operationId, debtor_id: debtorId, purpose });
    const result = await withTransaction(context.pool, async (client) => {
      const command = await claimCommand(client, operationId, "CREATE_ORDER", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const debtor = await client.query<DebtorRow>(`SELECT ${debtorColumns()} FROM debtors WHERE debtor_id = $1 AND source = $2 FOR UPDATE`, [debtorId, PROVISIONAL_SOURCE]);
      if (!debtor.rows[0]) throw new HttpError(404, "DEBTOR_NOT_FOUND", "Debtor was not found.");
      const duplicate = await client.query("SELECT order_id FROM orders WHERE debtor_id = $1 AND purpose = $2 AND status = 'GENERADO' FOR SHARE", [debtorId, purpose]);
      if (duplicate.rows[0]) throw new HttpError(409, "DUPLICATE_ORDER", "An active provisional order already exists for this debtor.");
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
      await client.query("UPDATE command_operations SET status = 'completed', response = $2 WHERE operation_id = $1", [operationId, order]);
      return order;
    });
    sendJson(response, 201, result);
  }

  async function createOrdersBatch(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const batchId = requiredString(body.batch_id, "batch_id");
    const purpose = requiredString(body.purpose, "purpose");
    const rawDebtorIds = body.debtor_ids;
    if (!Array.isArray(rawDebtorIds) || rawDebtorIds.some((value) => typeof value !== "string")) throw new HttpError(400, "INVALID_REQUEST", "debtor_ids must be an array of strings.");
    const debtorIds = [...new Set(rawDebtorIds.map((value) => value.trim()).filter(Boolean))];
    if (!debtorIds.length || debtorIds.length > 500) throw new HttpError(400, "INVALID_REQUEST", "debtor_ids must contain between 1 and 500 items.");
    if (purpose !== "CUT") throw new HttpError(400, "INVALID_PURPOSE", "Only CUT is available in this provisional slice.");
    const requestHash = digestJson({ batch_id: batchId, debtor_ids: debtorIds, purpose });
    const result = await withTransaction(context.pool, async (client) => {
      const command = await claimCommand(client, batchId, "CREATE_ORDER_BATCH", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const debtors = await client.query<DebtorRow>(`SELECT ${debtorColumns()} FROM debtors WHERE debtor_id = ANY($1::text[]) AND source = $2 FOR UPDATE`, [debtorIds, PROVISIONAL_SOURCE]);
      const debtorById = new Map(debtors.rows.map((debtor) => [debtor.debtor_id, debtor]));
      const created: Record<string, unknown>[] = [];
      const skipped: Array<{ debtor_id: string; reason: "ACTIVE_ORDER_EXISTS" | "DEBTOR_NOT_FOUND" | "SUPPLY_ID_REQUIRED"; message: string }> = [];
      for (const debtorId of debtorIds) {
        const debtor = debtorById.get(debtorId);
        if (!debtor) { skipped.push({ debtor_id: debtorId, reason: "DEBTOR_NOT_FOUND", message: "Suministro no encontrado." }); continue; }
        if (!debtor.supply_id.trim()) { skipped.push({ debtor_id: debtorId, reason: "SUPPLY_ID_REQUIRED", message: "Suministro sin identificador confirmado." }); continue; }
        const duplicate = await client.query("SELECT o.order_id FROM orders o JOIN debtors d ON d.debtor_id = o.debtor_id WHERE d.account_id = $1 AND o.purpose = $2 AND o.status = 'GENERADO' FOR SHARE", [debtor.account_id, purpose]);
        if (duplicate.rows[0]) { skipped.push({ debtor_id: debtorId, reason: "ACTIVE_ORDER_EXISTS", message: "Ya existe una orden activa para esta cuenta." }); continue; }
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
      await client.query("UPDATE command_operations SET status = 'completed', response = $2 WHERE operation_id = $1", [batchId, responseValue]);
      return responseValue;
    });
    sendJson(response, 201, result);
  }

  async function assignOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser, orderId: string | undefined): Promise<void> {
    requireRole(user, "ADMIN");
    if (!orderId) throw new HttpError(400, "INVALID_REQUEST", "order_id is required.");
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const operationId = requiredString(body.operation_id, "operation_id");
    const technicianId = requiredString(body.technician_id, "technician_id");
    const expectedVersion = requiredInteger(body.expected_version, "expected_version");
    const requestHash = digestJson({ operation_id: operationId, order_id: orderId, technician_id: technicianId, expected_version: expectedVersion });
    const result = await withTransaction(context.pool, async (client) => {
      const command = await claimCommand(client, operationId, "ASSIGN_ORDER", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const technician = await client.query("SELECT user_id FROM users WHERE user_id = $1 AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = users.user_id AND g.role = 'TECHNICIAN') AND enabled = true AND source = $2", [technicianId, PROVISIONAL_SOURCE]);
      if (!technician.rows[0]) throw new HttpError(404, "TECHNICIAN_NOT_FOUND", "Technician was not found.");
      const current = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [orderId, PROVISIONAL_SOURCE]);
      const order = current.rows[0];
      if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found.");
      if (order.version !== expectedVersion) throw new HttpError(409, "VERSION_CONFLICT", "Order version is stale.");
      if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_ASSIGNABLE", "Only GENERADO orders can be assigned.");
      const nextVersion = order.version + 1;
      const updateResult = await client.query("UPDATE orders SET assigned_technician_id = $2, version = $3, updated_at = now() WHERE order_id = $1 AND version = $4", [orderId, technicianId, nextVersion, expectedVersion]);
      if (updateResult.rowCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Order changed during assignment.");
      const updated = await client.query<OrderRow>(orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC"), [orderId, PROVISIONAL_SOURCE]);
      const updatedOrder = updated.rows[0];
      if (!updatedOrder) throw new Error("Updated provisional order could not be read.");
      const next = toOrder(updatedOrder);
      await client.query("INSERT INTO order_assignments(assignment_id, order_id, technician_id, assigned_by, from_technician_id, version, source) VALUES ($1, $2, $3, $4, $5, $6, $7)", [randomUUID(), orderId, technicianId, user.userId, order.assigned_technician_id, nextVersion, PROVISIONAL_SOURCE]);
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "ASSIGN_ORDER", result: "accepted", entityId: orderId, orderId, operationId, transition: { before: order.assigned_technician_id, after: technicianId, version: nextVersion } });
      await client.query("UPDATE command_operations SET status = 'completed', response = $2 WHERE operation_id = $1", [operationId, next]);
      return next;
    });
    sendJson(response, 200, result);
  }

  return { createOrder, createOrdersBatch, assignOrder };
}

interface InsertOrderOptions {
  orderId: string;
  cuc: string;
  debtorId: string;
  purpose: string;
  createdBy: string;
  missingMessage: string;
}

async function insertOrderAndRead(client: PoolClient, options: InsertOrderOptions): Promise<Record<string, unknown>> {
  await client.query(
    `INSERT INTO orders(order_id, cuc, debtor_id, purpose, status, physical_status, version, created_by, source)
     VALUES ($1, $2, $3, $4, 'GENERADO', 'NONE', 1, $5, $6)`,
    [options.orderId, options.cuc, options.debtorId, options.purpose, options.createdBy, PROVISIONAL_SOURCE],
  );
  const inserted = await client.query<OrderRow>(orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC"), [options.orderId, PROVISIONAL_SOURCE]);
  const order = inserted.rows[0];
  if (!order) throw new Error(options.missingMessage);
  return toOrder(order);
}
