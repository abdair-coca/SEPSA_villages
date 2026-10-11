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
import { setCorsHeaders, setSecurityHeaders, validateOrigin, validRequestId } from "./http-policy.js";
import { type Config } from "../config.js";
import { HttpError, errorBody, sendJson, sendNoContent } from "./responses.js";
import { Router, createRoutes, type RouteControllers, type SessionRouteContext } from "./router.js";
import { ConsoleSecurityLogger, type SecurityEvent, type SecurityLogger } from "../logging/security-logger.js";

export class Application {
  private readonly auth: ReturnType<typeof createAuthHandlers>;
  private readonly orders: ReturnType<typeof createOrderHandlers>;
  private readonly debtors: ReturnType<typeof createDebtorHandlers>;
  private readonly evidence: ReturnType<typeof createEvidenceHandlers>;
  private readonly authorizations: ReturnType<typeof createAuthorizationHandlers>;
  private readonly sync: ReturnType<typeof createSyncHandlers>;
  private readonly audit: ReturnType<typeof createAuditHandlers>;
  readonly router: Router;

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
    const controllers: RouteControllers = {
      auth: this.auth, orders: this.orders, debtors: this.debtors, evidence: this.evidence,
      authorizations: this.authorizations, sync: this.sync, audit: this.audit,
      health: (response) => this.health(response),
    };
    this.router = new Router(createRoutes(controllers));
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestId = validRequestId(request.headers["x-request-id"]) ?? randomUUID();
    setSecurityHeaders(response, requestId, this.config.cookieSecure);
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.headers.origin === this.config.corsOrigin) setCorsHeaders(response, this.config.corsOrigin);
      if (request.method === "OPTIONS") {
        if (request.headers.origin !== this.config.corsOrigin) throw new HttpError(403, "CORS_ORIGIN_REJECTED", "El origen de la solicitud no está permitido.");
        return sendNoContent(response);
      }
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
    const publicRoute = this.router.match(request.method, path, "public");
    if (publicRoute?.route.access === "public") return await publicRoute.route.handler({ request, response, url });

    const user = await this.auth.requireSession(request);
    const sessionRoute = this.router.match(request.method, path, "session");
    if (sessionRoute?.route.access === "session") {
      const context: SessionRouteContext = { request, response, url, user, params: sessionRoute.params };
      return await sessionRoute.route.handler(context);
    }
    throw new HttpError(404, "NOT_FOUND", "No se encontró el endpoint.");
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
