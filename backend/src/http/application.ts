/**
 * Punto de entrada de cada petición HTTP: request id, cabeceras de seguridad, CORS, verificación de origen,
 * sesión y enrutado a los controladores de `controllers/`. Todo error se convierte en `{ code, message }` y se
 * registra en el log de seguridad sin cuerpos ni datos personales. Contrato: `docs/api/pilot-contract.md`.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { createAuthHandlers } from "../controllers/auth.controller.js";
import { createOrderHandlers } from "../controllers/orders.controller.js";
import { createDebtorHandlers } from "../controllers/debtors.controller.js";
import { createEvidenceHandlers } from "../controllers/evidence.controller.js";
import { createAuditHandlers } from "../controllers/audit.controller.js";
import { createAuthorizationHandlers } from "../controllers/authorizations.controller.js";
import { createSyncHandlers } from "../controllers/sync.controller.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";
import { sessionBody } from "../mappers/session.mapper.js";
import { setCorsHeaders, setSecurityHeaders, validateOrigin, validRequestId } from "./http-policy.js";
import { type Config } from "../config.js";
import { HttpError, errorBody, sendJson, sendNoContent } from "./responses.js";
import { ConsoleSecurityLogger, type SecurityEvent, type SecurityLogger } from "../logging/security-logger.js";

export class Application {
  private readonly auth: ReturnType<typeof createAuthHandlers>;
  private readonly orders: ReturnType<typeof createOrderHandlers>;
  private readonly debtors: ReturnType<typeof createDebtorHandlers>;
  private readonly evidence: ReturnType<typeof createEvidenceHandlers>;
  private readonly authorizations: ReturnType<typeof createAuthorizationHandlers>;
  private readonly sync: ReturnType<typeof createSyncHandlers>;
  private readonly audit: ReturnType<typeof createAuditHandlers>;

  constructor(
    private readonly pool: Pool,
    private readonly config: Config,
    private readonly securityLogger: SecurityLogger = new ConsoleSecurityLogger(),
  ) {
    const context = {
      pool,
      config,
      logEvent: (event: SecurityEvent["event"], fields: Omit<SecurityEvent, "event">) => this.logEvent(event, fields),
    };
    this.auth = createAuthHandlers(context);
    this.orders = createOrderHandlers(context);
    this.debtors = createDebtorHandlers(context);
    this.evidence = createEvidenceHandlers(context);
    this.authorizations = createAuthorizationHandlers(context);
    this.sync = createSyncHandlers(context);
    this.audit = createAuditHandlers(context);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestId = validRequestId(request.headers["x-request-id"]) ?? randomUUID();
    setSecurityHeaders(response, requestId, this.config.cookieSecure);
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.headers.origin === this.config.corsOrigin) setCorsHeaders(response, this.config.corsOrigin);
      if (request.method === "OPTIONS") {
        if (request.headers.origin !== this.config.corsOrigin) throw new HttpError(403, "CORS_ORIGIN_REJECTED", "Request origin is not allowed.");
        return sendNoContent(response);
      }
      if (request.method === "GET" && url.pathname === "/healthz") return await this.health(response);
      validateOrigin(request, this.config.corsOrigin);
      await this.route(request, response, url);
    } catch (error) {
      const body = errorBody(error);
      this.logEvent("http.request.rejected", { requestId, result: body.code, status: body.status });
      if (body.status === 429) response.setHeader("retry-after", String(this.config.loginRateLimitWindowSeconds ?? 60));
      if (!response.headersSent) sendJson(response, body.status, { code: body.code, message: body.message });
      else response.end();
    }
  }

  private logEvent(event: SecurityEvent["event"], fields: Omit<SecurityEvent, "event">): void {
    this.securityLogger.log({ event, ...fields });
  }

  private async route(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const path = url.pathname;
    if (request.method === "POST" && path === "/v1/auth/login") return await this.auth.login(request, response);
    if (request.method === "POST" && path === "/v1/auth/logout") return await this.auth.logout(request, response);

    const user = await this.auth.requireSession(request);
    if (request.method === "GET" && path === "/v1/auth/session") return sendJson(response, 200, sessionBody(user));
    if (request.method === "POST" && path === "/v1/auth/role") return await this.auth.switchRole(request, response, user);
    if (request.method === "GET" && path === "/v1/technicians") return await this.orders.listTechnicians(response, user);
    if (request.method === "GET" && path === "/v1/debtors") return await this.debtors.listDebtors(response, user, url);
    if (request.method === "GET" && path === "/v1/orders") return await this.orders.listOrders(response, user);
    if (request.method === "POST" && path === "/v1/orders/batch") return await this.orders.createOrdersBatch(request, response, user);
    if (request.method === "POST" && path === "/v1/orders") return await this.orders.createOrder(request, response, user);
    const assignment = /^\/v1\/orders\/([^/]+)\/assignment$/.exec(path);
    if (request.method === "POST" && assignment) return await this.orders.assignOrder(request, response, user, assignment[1]);
    if (request.method === "GET" && path === "/v1/technician/orders") return await this.orders.technicianOrders(response, user, url);
    if (request.method === "POST" && path === "/v1/authorizations/cut") return await this.authorizations.authorizeCut(request, response, user);
    if (request.method === "POST" && path === "/v1/authorizations/reconnection") return await this.authorizations.authorizeReconnection(request, response, user);
    if (request.method === "POST" && path === "/v1/authorizations/reconnection/consume") return await this.authorizations.consumeReconnectionEnablement(request, response, user);
    const reconnectionEnablementLookup = /^\/v1\/authorizations\/reconnection\/([^/]+)$/.exec(path);
    if (request.method === "GET" && reconnectionEnablementLookup) return await this.authorizations.lookupReconnectionEnablement(response, user, reconnectionEnablementLookup[1]);
    if (request.method === "POST" && path === "/v1/evidence/assets") return await this.evidence.uploadEvidence(request, response, user);
    if (request.method === "POST" && path === "/v1/sync/operations") return await this.sync.syncOperation(request, response, user);
    const operationReview = /^\/v1\/sync\/operations\/([^/]+)\/review$/.exec(path);
    if (request.method === "POST" && operationReview) return await this.sync.recordHumanReview(request, response, user, operationReview[1] ?? "");
    const operationLookup = /^\/v1\/sync\/operations\/([^/]+)$/.exec(path);
    if (request.method === "GET" && operationLookup) return await this.sync.lookupOperation(response, user, operationLookup[1]);
    if (request.method === "GET" && path === "/v1/audit") return await this.audit.listAudit(response, user, url);
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
}
