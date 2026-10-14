/**
 * Tabla única de rutas del backend: método + patrón (`/v1/orders/:order_id/assignment`) → controlador.
 * Hace tres cosas:
 * - Declara qué rutas son públicas (health, login, logout) y cuáles exigen sesión; `Application` resuelve
 *   primero las públicas y, si ninguna coincide, exige sesión antes de buscar en las demás.
 * - Resuelve un método y una ruta a su entrada y a sus parámetros (`Router.match`).
 * - Se compara contra `openapi/pilot-provisional.openapi.json` en `test/router.test.ts`.
 * No abre transacciones ni contiene reglas de negocio: solo delega en los controladores.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "../types.js";
import type { AuditHandlers } from "../controllers/audit.controller.js";
import type { AuthHandlers } from "../controllers/auth.controller.js";
import type { AuthorizationHandlers } from "../controllers/authorizations.controller.js";
import type { DebtorHandlers } from "../controllers/debtors.controller.js";
import type { EvidenceHandlers } from "../controllers/evidence.controller.js";
import type { OrderHandlers } from "../controllers/orders.controller.js";
import type { SyncHandlers } from "../controllers/sync.controller.js";
import type { TechnicianRecordHandlers } from "../controllers/technician-record.controller.js";

export type RouteParams = Record<string, string | undefined>;

export interface PublicRouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
}

export interface SessionRouteContext extends PublicRouteContext {
  user: SessionUser;
  params: RouteParams;
}

export type HttpMethod = "GET" | "POST";

export type Route =
  | { method: HttpMethod; pattern: string; access: "public"; handler: (context: PublicRouteContext) => Promise<void> }
  | { method: HttpMethod; pattern: string; access: "session"; handler: (context: SessionRouteContext) => Promise<void> };

export interface RouteControllers {
  auth: AuthHandlers;
  orders: OrderHandlers;
  debtors: DebtorHandlers;
  evidence: EvidenceHandlers;
  authorizations: AuthorizationHandlers;
  sync: SyncHandlers;
  technicianRecord: TechnicianRecordHandlers;
  audit: AuditHandlers;
  health(response: ServerResponse): Promise<void>;
}

/** El orden de la tabla es el orden de evaluación; los patrones no se solapan para un mismo método. */
export function createRoutes(c: RouteControllers): Route[] {
  return [
    { method: "GET", pattern: "/healthz", access: "public", handler: ({ response }) => c.health(response) },
    { method: "POST", pattern: "/v1/auth/login", access: "public", handler: ({ request, response }) => c.auth.login(request, response) },
    { method: "POST", pattern: "/v1/auth/logout", access: "public", handler: ({ request, response }) => c.auth.logout(request, response) },

    { method: "GET", pattern: "/v1/auth/session", access: "session", handler: ({ response, user }) => c.auth.currentSession(response, user) },
    { method: "POST", pattern: "/v1/auth/role", access: "session", handler: ({ request, response, user }) => c.auth.switchRole(request, response, user) },
    { method: "GET", pattern: "/v1/technicians", access: "session", handler: ({ response, user }) => c.orders.listTechnicians(response, user) },
    { method: "GET", pattern: "/v1/debtors", access: "session", handler: ({ response, user, url }) => c.debtors.listDebtors(response, user, url) },
    { method: "GET", pattern: "/v1/orders", access: "session", handler: ({ response, user }) => c.orders.listOrders(response, user) },
    { method: "POST", pattern: "/v1/orders/batch", access: "session", handler: ({ request, response, user }) => c.orders.createOrdersBatch(request, response, user) },
    { method: "POST", pattern: "/v1/orders", access: "session", handler: ({ request, response, user }) => c.orders.createOrder(request, response, user) },
    { method: "POST", pattern: "/v1/orders/:order_id/assignment", access: "session", handler: ({ request, response, user, params }) => c.orders.assignOrder(request, response, user, params.order_id) },
    { method: "GET", pattern: "/v1/technician/orders", access: "session", handler: ({ response, user, url }) => c.orders.technicianOrders(response, user, url) },
    { method: "GET", pattern: "/v1/technician/record", access: "session", handler: ({ response, user, url }) => c.technicianRecord.listRecord(response, user, url) },
    { method: "POST", pattern: "/v1/authorizations/cut", access: "session", handler: ({ request, response, user }) => c.authorizations.authorizeCut(request, response, user) },
    { method: "POST", pattern: "/v1/authorizations/cut/consume", access: "session", handler: ({ request, response, user }) => c.authorizations.consumeCutAuthorization(request, response, user) },
    { method: "GET", pattern: "/v1/authorizations/cut/:operation_id", access: "session", handler: ({ response, user, params }) => c.authorizations.lookupCutAuthorization(response, user, params.operation_id) },
    { method: "POST", pattern: "/v1/authorizations/reconnection", access: "session", handler: ({ request, response, user }) => c.authorizations.authorizeReconnection(request, response, user) },
    { method: "POST", pattern: "/v1/authorizations/reconnection/consume", access: "session", handler: ({ request, response, user }) => c.authorizations.consumeReconnectionEnablement(request, response, user) },
    { method: "GET", pattern: "/v1/authorizations/reconnection/:operation_id", access: "session", handler: ({ response, user, params }) => c.authorizations.lookupReconnectionEnablement(response, user, params.operation_id) },
    { method: "POST", pattern: "/v1/evidence/assets", access: "session", handler: ({ request, response, user }) => c.evidence.uploadEvidence(request, response, user) },
    { method: "POST", pattern: "/v1/sync/operations", access: "session", handler: ({ request, response, user }) => c.sync.syncOperation(request, response, user) },
    { method: "POST", pattern: "/v1/sync/operations/:operation_id/review", access: "session", handler: ({ request, response, user, params }) => c.sync.recordHumanReview(request, response, user, params.operation_id ?? "") },
    { method: "GET", pattern: "/v1/sync/operations/:operation_id", access: "session", handler: ({ response, user, params }) => c.sync.lookupOperation(response, user, params.operation_id) },
    { method: "GET", pattern: "/v1/audit", access: "session", handler: ({ response, user, url }) => c.audit.listAudit(response, user, url) },
    { method: "GET", pattern: "/v1/admin/reconciliation", access: "session", handler: ({ response, user }) => c.audit.listReconciliation(response, user) },
  ];
}

interface CompiledRoute {
  route: Route;
  regex: RegExp;
  keys: string[];
}

export interface RouteMatch {
  route: Route;
  params: RouteParams;
}

export class Router {
  private readonly compiled: CompiledRoute[];

  constructor(readonly routes: Route[]) {
    this.compiled = routes.map((route) => {
      const keys: string[] = [];
      const source = route.pattern.split("/").map((segment) => {
        if (!segment.startsWith(":")) return segment;
        keys.push(segment.slice(1));
        return "([^/]+)";
      }).join("/");
      return { route, regex: new RegExp(`^${source}$`), keys };
    });
  }

  /** Primera ruta de la tabla con ese acceso, método y ruta, con sus parámetros sin decodificar. */
  match(method: string | undefined, path: string, access: Route["access"]): RouteMatch | undefined {
    for (const { route, regex, keys } of this.compiled) {
      if (route.access !== access || route.method !== method) continue;
      const found = regex.exec(path);
      if (!found) continue;
      return { route, params: Object.fromEntries(keys.map((key, index) => [key, found[index + 1]])) };
    }
    return undefined;
  }
}
