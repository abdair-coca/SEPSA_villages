import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import { hashToken, verifyPassword, createOpaqueToken } from "./auth.js";
import { withTransaction } from "./db.js";
import { HttpError, errorBody, isRecord, parseBearerToken, parseJsonBody, requiredInteger, requiredString, sendJson, sendNoContent } from "./http.js";
import type { Role, SessionUser, SyncPayload } from "./types.js";
import type { Config } from "./config.js";

interface UserRow { user_id: string; username: string; display_name: string; role: Role; password_hash: string; enabled: boolean; }
interface TechnicianRow { user_id: string; username: string; display_name: string; role: "TECHNICIAN"; enabled: boolean; }
interface SessionRow { session_id: string; user_id: string; username: string; display_name: string; role: Role; }
interface DebtorRow {
  debtor_id: string; account_id: string; supply_id: string; customer_name: string; address: string;
  reference_text: string; meter_id: string; area: string; locality: string; route: string; debt_cents: number;
  months_pending: number; updated_at: string | null; kardex: unknown; circuit: string; customer_ci: string | null;
  contact_phone: string | null; tariff: string; supply_status: string; enabling_title: string | null;
  route_order: number | null; cadastral_latitude: number | null; cadastral_longitude: number | null;
  meter_brand: string | null; meter_index: string | null; meter_multiplier: number | null;
  claims: boolean | null; payment_plan: boolean | null; suspension_date: string | null;
  reconnection_manual: boolean | null; reconnection_date: string | null; reconnection_technician: string | null; context: unknown;
}
interface OrderRow {
  order_id: string; debtor_id: string; account_id: string; supply_id: string; purpose: "CUT";
  status: string; physical_status: string; version: number; created_by: string; assigned_technician_id: string | null;
  created_at: string; context: unknown; cuc: string | null; assigned_technician_name: string | null;
}
interface StoredOperationRow { operation_id: string; technician_id: string; device_id: string; status: string; payload_hash: string; conflict_reason: string | null; }
interface CommandRow { operation_type: string; actor_id: string; request_hash: string; response: unknown; }

const PROVISIONAL_SOURCE = "PILOT_PROVISIONAL";
const NO_DATA_FILTER_VALUE = "__NO_DATA__";
const LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON = "Photo evidence remains pending until its official upload and verification contract is validated with SEPSA.";

export class Application {
  constructor(private readonly pool: Pool, private readonly config: Config) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      this.setCorsHeaders(response);
      if (request.method === "OPTIONS") return sendNoContent(response);
      if (request.method === "GET" && url.pathname === "/healthz") return await this.health(response);
      this.validateOrigin(request);
      await this.route(request, response, url);
    } catch (error) {
      const body = errorBody(error);
      if (!response.headersSent) sendJson(response, body.status, { code: body.code, message: body.message });
      else response.end();
    }
  }

  private setCorsHeaders(response: ServerResponse): void {
    response.setHeader("access-control-allow-origin", this.config.corsOrigin);
    response.setHeader("access-control-allow-headers", "authorization, content-type");
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    response.setHeader("access-control-allow-credentials", "true");
    response.setHeader("vary", "Origin");
  }

  private validateOrigin(request: IncomingMessage): void {
    const origin = request.headers.origin;
    if (request.method === "POST" && origin && origin !== this.config.corsOrigin) throw new HttpError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed.");
  }

  private async route(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const path = url.pathname;
    if (request.method === "POST" && path === "/v1/auth/login") return await this.login(request, response);
    if (request.method === "POST" && path === "/v1/auth/logout") return await this.logout(request, response);

    const user = await this.requireSession(request);
    if (request.method === "GET" && path === "/v1/technicians") return await this.listTechnicians(response, user);
    if (request.method === "GET" && path === "/v1/debtors") return await this.listDebtors(response, user, url);
    if (request.method === "GET" && path === "/v1/orders") return await this.listOrders(response, user);
    if (request.method === "POST" && path === "/v1/orders/batch") return await this.createOrdersBatch(request, response, user);
    if (request.method === "POST" && path === "/v1/orders") return await this.createOrder(request, response, user);
    const assignment = /^\/v1\/orders\/([^/]+)\/assignment$/.exec(path);
    if (request.method === "POST" && assignment) return await this.assignOrder(request, response, user, assignment[1]);
    if (request.method === "GET" && path === "/v1/technician/orders") return await this.technicianOrders(response, user, url);
    if (request.method === "POST" && path === "/v1/authorizations/cut") return await this.authorizeCut(request, response, user);
    if (request.method === "POST" && path === "/v1/sync/operations") return await this.syncOperation(request, response, user);
    const operationLookup = /^\/v1\/sync\/operations\/([^/]+)$/.exec(path);
    if (request.method === "GET" && operationLookup) return await this.lookupOperation(response, user, operationLookup[1]);
    if (request.method === "GET" && path === "/v1/audit") return await this.listAudit(response, user, url);
    throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
  }

  private async health(response: ServerResponse): Promise<void> {
    try {
      await this.pool.query("SELECT 1");
      sendJson(response, 200, { status: "ok", source: PROVISIONAL_SOURCE });
    } catch {
      sendJson(response, 503, { status: "unavailable", source: PROVISIONAL_SOURCE });
    }
  }

  private async login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await parseJsonBody(request, this.config.maxBodyBytes);
    const username = requiredString(body.username, "username");
    const password = requiredString(body.password, "password");
    const result = await this.pool.query<UserRow>(
      "SELECT user_id, username, display_name, role, password_hash, enabled FROM users WHERE username = $1 AND source = $2",
      [username, PROVISIONAL_SOURCE],
    );
    const user = result.rows[0];
    if (!user || !user.enabled || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Username or password is invalid.");
    }
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1000).toISOString();
    const sessionId = cryptoRandomUuid();
    await withTransaction(this.pool, async (client) => {
      await client.query(
        "INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source) VALUES ($1, $2, $3, $4, $5)",
        [sessionId, user.user_id, hashToken(token), expiresAt, PROVISIONAL_SOURCE],
      );
      await insertAudit(client, { actorId: user.user_id, actorRole: user.role, action: "LOGIN", result: "accepted", entityId: sessionId });
    });
    response.setHeader("set-cookie", sessionCookie(token, this.config.sessionTtlSeconds, this.config.corsOrigin));
    sendJson(response, 200, {
      session_id: sessionId,
      expires_at: expiresAt,
      user: { user_id: user.user_id, username: user.username, display_name: user.display_name, role: user.role },
      session_token: token,
      source: PROVISIONAL_SOURCE,
    });
  }

  private async logout(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const user = await this.requireSession(request);
    await withTransaction(this.pool, async (client) => {
      const result = await client.query("UPDATE sessions SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL", [user.sessionId]);
      if (result.rowCount === 1) await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "LOGOUT", result: "accepted", entityId: user.sessionId });
    });
    response.setHeader("set-cookie", clearSessionCookie(this.config.corsOrigin));
    sendNoContent(response);
  }

  private async requireSession(request: IncomingMessage): Promise<SessionUser> {
    const token = parseBearerToken(request.headers.authorization) ?? parseCookie(request.headers.cookie, "sepsa_session");
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Valid bearer session is required.");
    const result = await this.pool.query<SessionRow>(
      `SELECT s.session_id, u.user_id, u.username, u.display_name, u.role
       FROM sessions s JOIN users u ON u.user_id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.enabled = true AND u.source = $2`,
      [hashToken(token), PROVISIONAL_SOURCE],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(401, "UNAUTHENTICATED", "Session is invalid, expired, or revoked.");
    return { sessionId: row.session_id, userId: row.user_id, username: row.username, displayName: row.display_name, role: row.role };
  }

  private requireRole(user: SessionUser, role: Role): void {
    if (user.role !== role) throw new HttpError(403, "FORBIDDEN", `Role ${role} is required.`);
  }

  private async listDebtors(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    this.requireRole(user, "ADMIN");
    const search = (url.searchParams.get("query") ?? "").trim();
    const area = (url.searchParams.get("area") ?? "").trim();
    const locality = (url.searchParams.get("locality") ?? "").trim();
    const route = (url.searchParams.get("route") ?? "").trim();
    const minMonthsText = (url.searchParams.get("min_months_pending") ?? "").trim();
    const minMonthsPending = minMonthsText === "" ? 0 : Number(minMonthsText);
    if (!Number.isSafeInteger(minMonthsPending) || minMonthsPending < 0) throw new HttpError(400, "INVALID_REQUEST", "min_months_pending must be a non-negative integer.");
    const supplyStatus = (url.searchParams.get("supply_status") ?? "").trim();
    const result = await this.pool.query<DebtorRow>(
       `SELECT debtor_id, account_id, supply_id, customer_name, address, reference_text, meter_id, area, locality,
               route, debt_cents, months_pending, updated_at, kardex, circuit, customer_ci, contact_phone, tariff,
                supply_status, enabling_title, route_order, cadastral_latitude, cadastral_longitude, meter_brand,
                meter_index, meter_multiplier, claims, payment_plan, suspension_date, reconnection_manual,
                reconnection_date, reconnection_technician, context
        FROM debtors WHERE source = $1 AND ($2 = '' OR concat_ws(' ', debtor_id, account_id, supply_id, customer_name, address, reference_text,
               meter_id, area, locality, route, debt_cents::text, months_pending::text, updated_at::text, kardex::text, circuit,
               customer_ci, contact_phone, tariff, supply_status, enabling_title, route_order::text, cadastral_latitude::text,
               cadastral_longitude::text, meter_brand, meter_index, meter_multiplier::text, claims::text, payment_plan::text,
               suspension_date::text, reconnection_manual::text, reconnection_date::text, reconnection_technician) ILIKE '%' || $2 || '%')
            AND ($3 = '' OR ($3 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(area), '') IS NULL) OR regexp_replace(LOWER(BTRIM(area)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($3)), '\\s+', ' ', 'g'))
           AND ($4 = '' OR ($4 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(locality), '') IS NULL) OR regexp_replace(LOWER(BTRIM(locality)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($4)), '\\s+', ' ', 'g'))
           AND ($5 = '' OR ($5 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(route), '') IS NULL) OR regexp_replace(LOWER(BTRIM(route)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($5)), '\\s+', ' ', 'g'))
           AND ($6 = 0 OR months_pending >= $6)
           AND ($7 = '' OR ($7 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(supply_status), '') IS NULL) OR regexp_replace(LOWER(BTRIM(supply_status)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($7)), '\\s+', ' ', 'g'))
        ORDER BY updated_at DESC LIMIT 100`,
       [PROVISIONAL_SOURCE, search, area, locality, route, minMonthsPending, supplyStatus],
    );
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, debtors: result.rows.map(toDebtor) });
  }

  private async listTechnicians(response: ServerResponse, user: SessionUser): Promise<void> {
    this.requireRole(user, "ADMIN");
    const result = await this.pool.query<TechnicianRow>(
      "SELECT user_id, username, display_name, role, enabled FROM users WHERE source = $1 AND role = 'TECHNICIAN' AND enabled = true ORDER BY display_name ASC, username ASC",
      [PROVISIONAL_SOURCE],
    );
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, technicians: result.rows.map((technician) => ({ user_id: technician.user_id, username: technician.username, display_name: technician.display_name, role: technician.role, enabled: technician.enabled, source: PROVISIONAL_SOURCE })) });
  }

  private async listOrders(response: ServerResponse, user: SessionUser): Promise<void> {
    this.requireRole(user, "ADMIN");
    const result = await this.pool.query<OrderRow>(orderSelect("o.source = $1", "o.created_at DESC"), [PROVISIONAL_SOURCE]);
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, orders: result.rows.map(toOrder) });
  }

  private async createOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    this.requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, this.config.maxBodyBytes);
    const operationId = requiredString(body.operation_id, "operation_id");
    const debtorId = requiredString(body.debtor_id, "debtor_id");
    const purpose = requiredString(body.purpose, "purpose");
    if (purpose !== "CUT") throw new HttpError(400, "INVALID_PURPOSE", "Only CUT is available in this provisional slice.");
    const requestHash = digest({ operation_id: operationId, debtor_id: debtorId, purpose });
    const result = await withTransaction(this.pool, async (client) => {
      const command = await claimCommand(client, operationId, "CREATE_ORDER", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const debtor = await client.query<DebtorRow>("SELECT * FROM debtors WHERE debtor_id = $1 AND source = $2 FOR UPDATE", [debtorId, PROVISIONAL_SOURCE]);
      if (!debtor.rows[0]) throw new HttpError(404, "DEBTOR_NOT_FOUND", "Debtor was not found.");
      const duplicate = await client.query("SELECT order_id FROM orders WHERE debtor_id = $1 AND purpose = $2 AND status = 'GENERADO' FOR SHARE", [debtorId, purpose]);
      if (duplicate.rows[0]) throw new HttpError(409, "DUPLICATE_ORDER", "An active provisional order already exists for this debtor.");
       const orderId = cryptoRandomUuid();
       const cuc = `CUC-${cryptoRandomUuid()}`;
       await client.query(
         `INSERT INTO orders(order_id, cuc, debtor_id, purpose, status, physical_status, version, created_by, source)
          VALUES ($1, $2, $3, $4, 'GENERADO', 'NONE', 1, $5, $6)`,
         [orderId, cuc, debtorId, purpose, user.userId, PROVISIONAL_SOURCE],
      );
      const inserted = await client.query<OrderRow>(orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC"), [orderId, PROVISIONAL_SOURCE]);
      const insertedOrder = inserted.rows[0];
      if (!insertedOrder) throw new Error("Created provisional order could not be read.");
      const order = toOrder(insertedOrder);
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CREATE_ORDER", result: "accepted", entityId: orderId, orderId, operationId });
      await client.query("UPDATE command_operations SET status = 'completed', response = $2 WHERE operation_id = $1", [operationId, order]);
      return order;
    });
    sendJson(response, 201, result);
  }

  private async createOrdersBatch(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    this.requireRole(user, "ADMIN");
    const body = await parseJsonBody(request, this.config.maxBodyBytes);
    const batchId = requiredString(body.batch_id, "batch_id");
    const purpose = requiredString(body.purpose, "purpose");
    const rawDebtorIds = body.debtor_ids;
    if (!Array.isArray(rawDebtorIds) || rawDebtorIds.some((value) => typeof value !== "string")) throw new HttpError(400, "INVALID_REQUEST", "debtor_ids must be an array of strings.");
    const debtorIds = [...new Set(rawDebtorIds.map((value) => value.trim()).filter(Boolean))];
    if (!debtorIds.length || debtorIds.length > 500) throw new HttpError(400, "INVALID_REQUEST", "debtor_ids must contain between 1 and 500 items.");
    if (purpose !== "CUT") throw new HttpError(400, "INVALID_PURPOSE", "Only CUT is available in this provisional slice.");
    const requestHash = digest({ batch_id: batchId, debtor_ids: debtorIds, purpose });
    const result = await withTransaction(this.pool, async (client) => {
      const command = await claimCommand(client, batchId, "CREATE_ORDER_BATCH", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const debtors = await client.query<DebtorRow>("SELECT * FROM debtors WHERE debtor_id = ANY($1::text[]) AND source = $2 FOR UPDATE", [debtorIds, PROVISIONAL_SOURCE]);
      const debtorById = new Map(debtors.rows.map((debtor) => [debtor.debtor_id, debtor]));
      const created: Record<string, unknown>[] = [];
      const skipped: Array<{ debtor_id: string; reason: "ACTIVE_ORDER_EXISTS" | "DEBTOR_NOT_FOUND" | "SUPPLY_ID_REQUIRED"; message: string }> = [];
      for (const debtorId of debtorIds) {
        const debtor = debtorById.get(debtorId);
        if (!debtor) { skipped.push({ debtor_id: debtorId, reason: "DEBTOR_NOT_FOUND", message: "Suministro no encontrado." }); continue; }
        if (!debtor.supply_id.trim()) { skipped.push({ debtor_id: debtorId, reason: "SUPPLY_ID_REQUIRED", message: "Suministro sin identificador confirmado." }); continue; }
        const duplicate = await client.query("SELECT o.order_id FROM orders o JOIN debtors d ON d.debtor_id = o.debtor_id WHERE d.account_id = $1 AND o.purpose = $2 AND o.status = 'GENERADO' FOR SHARE", [debtor.account_id, purpose]);
        if (duplicate.rows[0]) { skipped.push({ debtor_id: debtorId, reason: "ACTIVE_ORDER_EXISTS", message: "Ya existe una orden activa para esta cuenta." }); continue; }
        const orderId = cryptoRandomUuid();
        const cuc = `CUC-${cryptoRandomUuid()}`;
        await client.query(
          `INSERT INTO orders(order_id, cuc, debtor_id, purpose, status, physical_status, version, created_by, source)
           VALUES ($1, $2, $3, $4, 'GENERADO', 'NONE', 1, $5, $6)`,
          [orderId, cuc, debtorId, purpose, user.userId, PROVISIONAL_SOURCE],
        );
        const inserted = await client.query<OrderRow>(orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC"), [orderId, PROVISIONAL_SOURCE]);
        const order = inserted.rows[0];
        if (!order) throw new Error("Created provisional batch order could not be read.");
        created.push(toOrder(order));
        await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CREATE_ORDER", result: "accepted", entityId: orderId, orderId, operationId: `${batchId}:${debtorId}` });
      }
      const responseValue = { batch_id: batchId, requested_debtor_ids: debtorIds, created, skipped };
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "CREATE_ORDER_BATCH", result: "accepted", entityId: batchId, operationId: batchId, metadata: { requested: debtorIds.length, created: created.length, skipped: skipped.length } });
      await client.query("UPDATE command_operations SET status = 'completed', response = $2 WHERE operation_id = $1", [batchId, responseValue]);
      return responseValue;
    });
    sendJson(response, 201, result);
  }

  private async assignOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser, orderId: string | undefined): Promise<void> {
    this.requireRole(user, "ADMIN");
    if (!orderId) throw new HttpError(400, "INVALID_REQUEST", "order_id is required.");
    const body = await parseJsonBody(request, this.config.maxBodyBytes);
    const operationId = requiredString(body.operation_id, "operation_id");
    const technicianId = requiredString(body.technician_id, "technician_id");
    const expectedVersion = requiredInteger(body.expected_version, "expected_version");
    const requestHash = digest({ operation_id: operationId, order_id: orderId, technician_id: technicianId, expected_version: expectedVersion });
    const result = await withTransaction(this.pool, async (client) => {
      const command = await claimCommand(client, operationId, "ASSIGN_ORDER", user.userId, requestHash);
      if (!command.claimed) return command.replay;
      const technician = await client.query("SELECT user_id FROM users WHERE user_id = $1 AND role = 'TECHNICIAN' AND enabled = true AND source = $2", [technicianId, PROVISIONAL_SOURCE]);
      if (!technician.rows[0]) throw new HttpError(404, "TECHNICIAN_NOT_FOUND", "Technician was not found.");
      const current = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [orderId, PROVISIONAL_SOURCE]);
      const order = current.rows[0];
      if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found.");
      if (order.version !== expectedVersion) throw new HttpError(409, "VERSION_CONFLICT", "Order version is stale.");
      if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_ASSIGNABLE", "Only GENERADO orders can be assigned.");
      const nextVersion = order.version + 1;
      const updateResult = await client.query(
        `UPDATE orders SET assigned_technician_id = $2, version = $3, updated_at = now()
         WHERE order_id = $1 AND version = $4`,
        [orderId, technicianId, nextVersion, expectedVersion],
      );
      if (updateResult.rowCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Order changed during assignment.");
      const updated = await client.query<OrderRow>(orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC"), [orderId, PROVISIONAL_SOURCE]);
      const updatedOrder = updated.rows[0];
      if (!updatedOrder) throw new Error("Updated provisional order could not be read.");
      const next = toOrder(updatedOrder);
      await client.query(
        "INSERT INTO order_assignments(assignment_id, order_id, technician_id, assigned_by, from_technician_id, version, source) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [cryptoRandomUuid(), orderId, technicianId, user.userId, order.assigned_technician_id, nextVersion, PROVISIONAL_SOURCE],
      );
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "ASSIGN_ORDER", result: "accepted", entityId: orderId, orderId, operationId, transition: { before: order.assigned_technician_id, after: technicianId, version: nextVersion } });
      await client.query("UPDATE command_operations SET status = 'completed', response = $2 WHERE operation_id = $1", [operationId, next]);
      return next;
    });
    sendJson(response, 200, result);
  }

  private async technicianOrders(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    this.requireRole(user, "TECHNICIAN");
    const deviceId = requiredString(url.searchParams.get("device_id"), "device_id");
    const result = await this.pool.query<OrderRow>(orderSelect("o.assigned_technician_id = $1 AND o.source = $2", "o.updated_at DESC"), [user.userId, PROVISIONAL_SOURCE]);
    const orders = result.rows.map(toOrder);
    const packageValue = { package_id: cryptoRandomUuid(), technician_id: user.userId, device_id: deviceId, version: Date.now(), downloaded_at: new Date().toISOString(), orders, source: PROVISIONAL_SOURCE };
    const checksum = digest(packageValue);
    await withTransaction(this.pool, async (client) => {
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "DOWNLOAD_ASSIGNED", result: "accepted", deviceId, metadata: { package_id: packageValue.package_id, technician_id: packageValue.technician_id, device_id: packageValue.device_id, version: packageValue.version, downloaded_at: packageValue.downloaded_at, order_ids: orders.map((order) => order.order_id) } });
    });
    sendJson(response, 200, { package: packageValue, authenticity: PROVISIONAL_SOURCE, integrity: PROVISIONAL_SOURCE, validation: "PILOT_PROVISIONAL_VALID", checksum });
  }

  private async authorizeCut(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    this.requireRole(user, "TECHNICIAN");
    const body = await parseJsonBody(request, this.config.maxBodyBytes);
    const operationId = requiredString(body.operation_id, "operation_id");
    const orderId = requiredString(body.order_id, "order_id");
    const deviceId = requiredString(body.device_id, "device_id");
    const orderVersion = requiredInteger(body.order_version, "order_version");
    const result = await withTransaction(this.pool, async (client) => {
      const existing = await client.query<{ authorization_id: string; expires_at: string; technician_id: string }>("SELECT authorization_id, expires_at, technician_id FROM cut_authorizations WHERE operation_id = $1", [operationId]);
      if (existing.rows[0]) {
        if (existing.rows[0].technician_id !== user.userId) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Authorization operation identifier is bound to another technician.");
        throw new HttpError(409, "AUTHORIZATION_OPERATION_REPLAY", "Authorization operation already has a reservation; use saved response.");
      }
      const orderResult = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [orderId, PROVISIONAL_SOURCE]);
      const order = orderResult.rows[0];
      if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found.");
      if (order.assigned_technician_id !== user.userId) throw new HttpError(403, "ORDER_NOT_ASSIGNED", "Order is not assigned to current technician.");
      if (order.version !== orderVersion) throw new HttpError(409, "VERSION_CONFLICT", "Order version is stale.");
      if (order.status !== "GENERADO") throw new HttpError(409, "ORDER_NOT_ELIGIBLE", "Order is not eligible for a cut authorization.");
      const authorizationId = cryptoRandomUuid();
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + this.config.authorizationTtlSeconds * 1000).toISOString();
      await client.query(
        `INSERT INTO cut_authorizations(authorization_id, operation_id, order_id, technician_id, device_id, order_version, token_hash, status, expires_at, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED', $8, $9)`,
        [authorizationId, operationId, orderId, user.userId, deviceId, orderVersion, hashToken(token), expiresAt, PROVISIONAL_SOURCE],
      );
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "AUTHORIZE_CUT", result: "accepted", entityId: authorizationId, orderId, operationId, deviceId });
      return { authorization_id: authorizationId, token, order_id: orderId, technician_id: user.userId, device_id: deviceId, operation_id: operationId, version: orderVersion, issued_at: new Date().toISOString(), expires_at: expiresAt, source: PROVISIONAL_SOURCE };
    });
    sendJson(response, 200, result);
  }

  private async syncOperation(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    this.requireRole(user, "TECHNICIAN");
    const body = await parseJsonBody(request, this.config.maxBodyBytes);
    const payload = parseSyncPayload(body);
    validateSyncPayload(payload);
    if (payload.technician_id && payload.technician_id !== user.userId) throw new HttpError(403, "TECHNICIAN_SCOPE", "Payload technician does not match session.");
    payload.technician_id = user.userId;
    const result = await withTransaction(this.pool, async (client) => this.applySync(client, user, payload));
    if (result.status === "conflict") {
      sendJson(response, 409, { code: "CONFLICT", message: result.message, operation_id: payload.operation_id });
      return;
    }
    sendJson(response, 200, { status: "acknowledged", operation_id: payload.operation_id, source: PROVISIONAL_SOURCE });
  }

  private async applySync(client: PoolClient, user: SessionUser, payload: SyncPayload): Promise<{ status: "acknowledged" } | { status: "conflict"; message: string }> {
    const existing = await client.query<StoredOperationRow>("SELECT operation_id, technician_id, device_id, status, payload_hash, conflict_reason FROM sync_operations WHERE operation_id = $1 FOR UPDATE", [payload.operation_id]);
    const replay = existing.rows[0] ? syncReplay(existing.rows[0], user.userId, payload) : undefined;
    if (replay) return replay;
    const retryingLegacyLocalEvidence = existing.rows[0]?.status === "pending" && existing.rows[0].conflict_reason === LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON;
    if (!existing.rows[0]) {
      const inserted = await client.query(
        "INSERT INTO sync_operations(operation_id, technician_id, device_id, order_id, action, payload, payload_hash, status, source) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) ON CONFLICT (operation_id) DO NOTHING",
        [payload.operation_id, user.userId, payload.device_id, payload.order_id, payload.action, safeSyncPayload(payload), digest(payload), PROVISIONAL_SOURCE],
      );
      if (inserted.rowCount !== 1) {
        const concurrent = await client.query<StoredOperationRow>("SELECT operation_id, technician_id, device_id, status, payload_hash, conflict_reason FROM sync_operations WHERE operation_id = $1 FOR UPDATE", [payload.operation_id]);
        return concurrent.rows[0] ? syncReplay(concurrent.rows[0], user.userId, payload) ?? { status: "conflict", message: "Operation is already in progress." } : { status: "conflict", message: "Operation is already in progress." };
      }
    } else if (!retryingLegacyLocalEvidence) {
      return { status: "conflict", message: "Operation remains unresolved and requires review." };
    }
    const orderResult = await client.query<OrderRow>(`${orderSelect("o.order_id = $1 AND o.source = $2", "o.created_at DESC")} FOR UPDATE OF o, d`, [payload.order_id, PROVISIONAL_SOURCE]);
    const order = orderResult.rows[0];
    if (!order) return await rejectSync(client, user, payload, "Order was not found.");
    if (order.assigned_technician_id !== user.userId) return await rejectSync(client, user, payload, "Order is not assigned to current technician.");
    if (payload.action === "CUT") validateCaptureMeter(payload.field_capture, order.context);
    if (payload.action === "VISIT") {
      await client.query("UPDATE sync_operations SET status = 'acknowledged', conflict_reason = NULL, acknowledged_at = now() WHERE operation_id = $1", [payload.operation_id]);
       await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_VISIT", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload) });
      return { status: "acknowledged" };
    }
    if (order.status !== "GENERADO") return await rejectSync(client, user, payload, "Only GENERADO orders can be cut.");
    if (!payload.authorization_id || !payload.authorization_token || payload.order_version === undefined) return await rejectSync(client, user, payload, "Cut requires authorization, token, and order version.");
    if (order.version !== payload.order_version) return await rejectSync(client, user, payload, "Order version is stale.");
    const authorization = await client.query<{ authorization_id: string; operation_id: string; token_hash: string; status: string; expires_at: string; order_id: string; technician_id: string; device_id: string; order_version: number }>("SELECT authorization_id, operation_id, token_hash, status, expires_at, order_id, technician_id, device_id, order_version FROM cut_authorizations WHERE authorization_id = $1 FOR UPDATE", [payload.authorization_id]);
    const grant = authorization.rows[0];
    if (!grant || grant.operation_id !== payload.operation_id || grant.order_id !== payload.order_id || grant.technician_id !== user.userId || grant.device_id !== payload.device_id || grant.order_version !== payload.order_version || grant.status !== "RESERVED" || grant.token_hash !== hashToken(payload.authorization_token)) return await rejectSync(client, user, payload, "Authorization is invalid, expired, consumed, or not bound to this operation.");
    if (new Date(grant.expires_at).getTime() <= Date.now()) {
      const recovery = retryingLegacyLocalEvidence
        ? await client.query<{ eligible: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM audit_events authorization_audit
             WHERE authorization_audit.action = 'AUTHORIZE_CUT'
               AND authorization_audit.result = 'accepted'
               AND authorization_audit.entity_id = $1
               AND authorization_audit.order_id = $2
               AND authorization_audit.operation_id = $3
               AND authorization_audit.actor_id = $4
               AND authorization_audit.device_id = $5
               AND EXISTS (
                 SELECT 1 FROM audit_events rejected_audit
                 WHERE rejected_audit.action IN ('SYNC_CUT', 'SYNC_OPERATION')
                   AND rejected_audit.result = 'rejected'
                   AND rejected_audit.operation_id = $3
                   AND rejected_audit.order_id = $2
                   AND rejected_audit.actor_id = $4
                   AND rejected_audit.device_id = $5
                   AND rejected_audit.reason = $6
                   AND rejected_audit.metadata = $7::jsonb
                   AND rejected_audit.occurred_at > authorization_audit.occurred_at
                   AND rejected_audit.occurred_at <= authorization_audit.occurred_at + ($8 * INTERVAL '1 second')
               )
           ) AS eligible`,
          [grant.authorization_id, payload.order_id, payload.operation_id, user.userId, payload.device_id, LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON, JSON.stringify(safeSyncPayload(payload)), this.config.authorizationTtlSeconds],
        )
        : { rows: [], rowCount: 0 };
      if (recovery.rows[0]?.eligible !== true) return await rejectSync(client, user, payload, "Authorization is invalid, expired, consumed, or not bound to this operation.");
    }
    await client.query("UPDATE cut_authorizations SET status = 'CONSUMED', consumed_at = now(), consumed_operation_id = $2 WHERE authorization_id = $1 AND status = 'RESERVED'", [grant.authorization_id, payload.operation_id]);
    const updatedOrder = await client.query("UPDATE orders SET status = 'EJECUTADO', physical_status = 'CONFIRMED', version = version + 1, updated_at = now() WHERE order_id = $1 AND version = $2", [payload.order_id, payload.order_version]);
    if (updatedOrder.rowCount !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Order changed while consuming authorization.");
    await client.query("UPDATE sync_operations SET status = 'acknowledged', conflict_reason = NULL, acknowledged_at = now() WHERE operation_id = $1", [payload.operation_id]);
    await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_CUT", result: "accepted", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, metadata: safeSyncPayload(payload), transition: { before: order.status, after: "EJECUTADO", version: payload.order_version + 1 } });
    return { status: "acknowledged" };
  }

  private async lookupOperation(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void> {
    this.requireRole(user, "TECHNICIAN");
    if (!operationId) throw new HttpError(400, "INVALID_REQUEST", "operation_id is required.");
    const result = await this.pool.query<{ status: string }>("SELECT status FROM sync_operations WHERE operation_id = $1 AND technician_id = $2", [operationId, user.userId]);
    const status = result.rows[0]?.status;
    if (!status) return sendJson(response, 200, { status: "not_found", operation_id: operationId });
    if (status === "acknowledged") return sendJson(response, 200, { status: "confirmed", operation_id: operationId });
    sendJson(response, 200, { status: "unknown", operation_id: operationId, error_code: "CONFLICT_REQUIRES_REVIEW" });
  }

  private async listAudit(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    this.requireRole(user, "ADMIN");
    const orderId = url.searchParams.get("order_id");
    if (orderId && !isUuid(orderId)) throw new HttpError(400, "INVALID_REQUEST", "order_id must be a UUID.");
    const result = await this.pool.query<{ audit_id: string; actor_id: string; actor_role: Role | null; action: string; entity_id: string | null; order_id: string | null; operation_id: string | null; result: string; reason: string | null; device_id: string | null; occurred_at: string; transition: unknown; metadata: unknown }>(
      `SELECT audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, reason, device_id, occurred_at, transition, metadata
       FROM audit_events WHERE source = $1 AND ($2::uuid IS NULL OR order_id = $2::uuid) ORDER BY occurred_at ASC LIMIT 1000`,
      [PROVISIONAL_SOURCE, orderId],
    );
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, audit: result.rows });
  }
}

async function claimCommand(client: PoolClient, operationId: string, operationType: string, actorId: string, requestHash: string): Promise<{ claimed: true } | { claimed: false; replay: unknown }> {
  const inserted = await client.query(
    "INSERT INTO command_operations(operation_id, operation_type, actor_id, request_hash, status, source) VALUES ($1, $2, $3, $4, 'pending', $5) ON CONFLICT (operation_id) DO NOTHING",
    [operationId, operationType, actorId, requestHash, PROVISIONAL_SOURCE],
  );
  if (inserted.rowCount === 1) return { claimed: true };
  const replay = await commandReplay(client, operationId, operationType, actorId, requestHash);
  if (replay === undefined) throw new HttpError(409, "OPERATION_IN_PROGRESS", "Operation is already in progress.");
  return { claimed: false, replay };
}

async function commandReplay(client: PoolClient, operationId: string, operationType: string, actorId: string, requestHash: string): Promise<unknown | undefined> {
  const result = await client.query<CommandRow>("SELECT operation_type, actor_id, request_hash, response FROM command_operations WHERE operation_id = $1 FOR UPDATE", [operationId]);
  const row = result.rows[0];
  if (!row) return undefined;
  if (row.operation_type !== operationType || row.actor_id !== actorId || row.request_hash !== requestHash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Operation identifier is already bound to another command.");
  if (row.response === null || row.response === undefined) throw new HttpError(409, "OPERATION_IN_PROGRESS", "Operation is already in progress.");
  return row.response;
}

async function rejectSync(client: PoolClient, user: SessionUser, payload: SyncPayload, message: string): Promise<{ status: "conflict"; message: string }> {
  await client.query("UPDATE sync_operations SET status = 'conflict', conflict_reason = $2 WHERE operation_id = $1", [payload.operation_id, message]);
  await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "SYNC_OPERATION", result: "rejected", entityId: payload.operation_id, orderId: payload.order_id, operationId: payload.operation_id, deviceId: payload.device_id, reason: message, metadata: safeSyncPayload(payload) });
  return { status: "conflict", message };
}

function syncReplay(row: StoredOperationRow, technicianId: string, payload: SyncPayload): { status: "acknowledged" } | { status: "conflict"; message: string } | undefined {
  if (row.technician_id !== technicianId || row.device_id !== payload.device_id || row.payload_hash !== digest(payload)) return { status: "conflict", message: "Operation identifier is bound to another payload or device." };
  if (row.status === "acknowledged") return { status: "acknowledged" };
  if (row.status === "pending" && row.conflict_reason === LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON) return undefined;
  return { status: "conflict", message: "Operation remains unresolved and requires review." };
}

function safeSyncPayload(payload: SyncPayload): Record<string, unknown> {
  const { authorization_token: _authorizationToken, ...safe } = payload;
  return payload.evidence_refs.length > 0 ? { ...safe, evidence_storage: "LOCAL_ONLY" } : safe;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseSyncPayload(body: Record<string, unknown>): SyncPayload {
  const action = requiredString(body.action, "action");
  if (action !== "CUT" && action !== "VISIT") throw new HttpError(400, "INVALID_ACTION", "Only CUT and VISIT are supported.");
  const evidence = body.evidence_refs;
  if (!Array.isArray(evidence) || evidence.some((item) => typeof item !== "string")) throw new HttpError(400, "INVALID_REQUEST", "evidence_refs must be an array of strings.");
  const payload: SyncPayload = {
    operation_id: requiredString(body.operation_id, "operation_id"), action, order_id: requiredString(body.order_id, "order_id"),
    device_id: requiredString(body.device_id, "device_id"), recorded_at: requiredString(body.recorded_at, "recorded_at"), evidence_refs: evidence,
  };
  if (body.technician_id !== undefined) payload.technician_id = requiredString(body.technician_id, "technician_id");
  if (body.attempted_action !== undefined && body.attempted_action !== "CUT") throw new HttpError(400, "INVALID_REQUEST", "attempted_action must be CUT.");
  if (body.attempted_action !== undefined) payload.attempted_action = "CUT";
  if (body.order_version !== undefined) payload.order_version = requiredInteger(body.order_version, "order_version");
  if (body.authorization_id !== undefined) payload.authorization_id = requiredString(body.authorization_id, "authorization_id");
  if (body.authorization_token !== undefined) payload.authorization_token = requiredString(body.authorization_token, "authorization_token");
  if (body.field_capture !== undefined) payload.field_capture = body.field_capture;
  if (body.reason !== undefined) payload.reason = requiredString(body.reason, "reason");
  if (body.exception_reason !== undefined) payload.exception_reason = requiredString(body.exception_reason, "exception_reason");
  return payload;
}

function validateSyncPayload(payload: SyncPayload): void {
  if (!isIsoTimestamp(payload.recorded_at)) throw new HttpError(400, "INVALID_TIMESTAMP", "recorded_at must be an ISO timestamp.");
  if (payload.action === "VISIT") {
    if (!payload.reason?.trim()) throw new HttpError(400, "VISIT_REASON_REQUIRED", "VISIT requires a reason.");
    return;
  }
  if (payload.evidence_refs.length === 0 && !hasControlledException(payload.exception_reason, "saltar_control_fotos")) throw new HttpError(400, "EVIDENCE_REQUIRED", "CUT requires evidence_refs or a controlled photo exception.");
  const capture = isRecord(payload.field_capture) ? payload.field_capture : undefined;
  const reading = capture && isRecord(capture.reading) ? capture.reading : undefined;
  if (!reading || reading.status !== "CAPTURED" || typeof reading.value !== "number" || !Number.isFinite(reading.value) || reading.value < 0 || typeof reading.meterId !== "string" || !reading.meterId.trim() || reading.unit !== "kWh" || !isIsoTimestamp(reading.recordedAt)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requires a valid final meter reading.");
  const location = capture && isRecord(capture.location) ? capture.location : undefined;
  if (!location) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requires GPS capture or a controlled exception.");
  if (location.status === "CAPTURED") {
    if (typeof location.latitude !== "number" || !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 || typeof location.longitude !== "number" || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180 || typeof location.accuracyMeters !== "number" || !Number.isFinite(location.accuracyMeters) || location.accuracyMeters < 0 || !isIsoTimestamp(location.recordedAt)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT GPS capture is invalid.");
  } else if (location.status !== "BYPASSED" || !hasControlledException(location.exceptionReason, "saltar_control_coordenadas")) {
    throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requires GPS capture or a controlled exception.");
  }
  if (location.status === "BYPASSED" && !isIsoTimestamp(location.recordedAt)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT GPS exception timestamp is invalid.");
  if (!isRecord(capture) || !["RED", "MEDIDOR", "BARRAS", "PROTECCION", "ACOMETIDA", "FUSIBLES"].includes(String(capture.cutType)) || typeof capture.nearbyMeters !== "boolean") throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT field capture catalog values are invalid.");
}

function hasControlledException(value: unknown, code: string): boolean {
  return typeof value === "string" && value.trim().startsWith(`${code}:`) && value.trim().slice(code.length + 1).trim().length > 0;
}

function isIsoTimestamp(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function validateCaptureMeter(rawCapture: unknown, rawContext: unknown): void {
  const capture = isRecord(rawCapture) ? rawCapture : undefined;
  const reading = capture && isRecord(capture.reading) ? capture.reading : undefined;
  const context = isRecord(rawContext) ? rawContext : undefined;
  const expectedMeterId = context && typeof context.meter_id === "string" ? context.meter_id : undefined;
  if (expectedMeterId && reading && reading.meterId !== expectedMeterId) throw new HttpError(400, "METER_READING_MISMATCH", "Final meter reading does not match order meter.");
}

function orderColumns(alias: string): string {
  return `${alias}.order_id, ${alias}.cuc, ${alias}.debtor_id, d.account_id, d.supply_id, ${alias}.purpose, ${alias}.status, ${alias}.physical_status, ${alias}.version, ${alias}.created_by, ${alias}.assigned_technician_id, assigned_technician.display_name AS assigned_technician_name, ${alias}.created_at,
    jsonb_build_object('debtor_id', d.debtor_id, 'account_id', d.account_id, 'supply_id', d.supply_id, 'customer_name', d.customer_name, 'address', d.address, 'references', d.reference_text, 'meter_id', d.meter_id, 'area', d.area, 'area_name', NULLIF(BTRIM(d.context->>'area_name'), ''), 'locality', d.locality, 'route', d.route, 'route_name', NULLIF(BTRIM(d.context->>'ruta_name'), ''), 'debt_cents', d.debt_cents, 'months_pending', d.months_pending, 'updated_at', d.updated_at, 'kardex', d.kardex, 'source', d.source, 'circuit', d.circuit, 'customer_ci', d.customer_ci, 'contact_phone', d.contact_phone, 'tariff', d.tariff, 'supply_status', d.supply_status, 'enabling_title', d.enabling_title, 'route_order', d.route_order, 'cadastral_latitude', d.cadastral_latitude, 'cadastral_longitude', d.cadastral_longitude, 'meter_brand', d.meter_brand, 'meter_index', d.meter_index, 'meter_multiplier', d.meter_multiplier, 'claims', d.claims, 'payment_plan', d.payment_plan, 'suspension_date', d.suspension_date, 'reconnection_manual', d.reconnection_manual, 'reconnection_date', d.reconnection_date, 'reconnection_technician', d.reconnection_technician, 'provisional_metadata', d.context) AS context`;
}

function orderSelect(where: string, order: string): string {
  return `SELECT ${orderColumns("o")} FROM orders o JOIN debtors d ON d.debtor_id = o.debtor_id LEFT JOIN users assigned_technician ON assigned_technician.user_id = o.assigned_technician_id AND assigned_technician.role = 'TECHNICIAN' WHERE ${where} ORDER BY ${order}`;
}

function toDebtor(row: DebtorRow): Record<string, unknown> {
  return { debtor_id: row.debtor_id, account_id: row.account_id, supply_id: row.supply_id, customer_name: row.customer_name, address: row.address, references: row.reference_text, meter_id: row.meter_id, area: row.area, area_name: contextString(row.context, "area_name"), locality: row.locality, route: row.route, route_name: contextString(row.context, "ruta_name"), debt_cents: row.debt_cents, months_pending: row.months_pending, updated_at: row.updated_at, kardex: row.kardex, source: PROVISIONAL_SOURCE, circuit: row.circuit, customer_ci: row.customer_ci, contact_phone: row.contact_phone, tariff: row.tariff, supply_status: row.supply_status, enabling_title: row.enabling_title, route_order: row.route_order, cadastral_latitude: row.cadastral_latitude, cadastral_longitude: row.cadastral_longitude, meter_brand: row.meter_brand, meter_index: row.meter_index, meter_multiplier: row.meter_multiplier, claims: row.claims, payment_plan: row.payment_plan, suspension_date: row.suspension_date, reconnection_manual: row.reconnection_manual, reconnection_date: row.reconnection_date, reconnection_technician: row.reconnection_technician };
}

function contextString(context: unknown, key: string): string | undefined {
  const value = isRecord(context) ? context[key] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toOrder(row: OrderRow): Record<string, unknown> {
  return { order_id: row.order_id, cuc: row.cuc, debtor_id: row.debtor_id, account_id: row.account_id, supply_id: row.supply_id, purpose: row.purpose, status: row.status, physical_status: row.physical_status, version: row.version, created_by: row.created_by, assigned_technician_id: row.assigned_technician_id, assigned_technician_name: row.assigned_technician_name, created_at: row.created_at, context: row.context, source: PROVISIONAL_SOURCE };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cryptoRandomUuid(): string {
  return randomUUID();
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}

function sessionCookie(token: string, maxAge: number, corsOrigin: string): string {
  const secure = corsOrigin.startsWith("https://") ? "; Secure" : "";
  return `sepsa_session=${encodeURIComponent(token)}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Path=/${secure}`;
}

function clearSessionCookie(corsOrigin: string): string {
  const secure = corsOrigin.startsWith("https://") ? "; Secure" : "";
  return `sepsa_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/${secure}`;
}

interface AuditInput { actorId: string; actorRole: Role; action: string; result: "accepted" | "rejected"; entityId?: string; orderId?: string; operationId?: string; deviceId?: string; reason?: string; transition?: { before: string | null; after: string; version: number }; metadata?: unknown; }

async function insertAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `INSERT INTO audit_events(audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, reason, device_id, transition, metadata, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [cryptoRandomUuid(), input.actorId, input.actorRole, input.action, input.entityId ?? null, input.orderId ?? null, input.operationId ?? null, input.result, input.reason ?? null, input.deviceId ?? null, input.transition ?? null, input.metadata ?? null, PROVISIONAL_SOURCE],
  );
}
