/**
 * Agrupa los endpoints de autorización de corte y habilitación de reconexión.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "../types.js";
import type { ApplicationContext } from "../shared/application-context.js";
import { authorizeCut } from "./authorizations-cut.controller.js";
import { consumeReconnectionEnablement, lookupReconnectionEnablement } from "./authorizations-reconnection-operations.controller.js";
import { authorizeReconnection } from "./authorizations-reconnection-issue.controller.js";

export interface AuthorizationHandlers {
  authorizeCut(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  authorizeReconnection(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  consumeReconnectionEnablement(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  lookupReconnectionEnablement(response: ServerResponse, user: SessionUser, operationId: string | undefined): Promise<void>;
}

export function createAuthorizationHandlers(context: ApplicationContext): AuthorizationHandlers {
  return {
    authorizeCut: (request, response, user) => authorizeCut(context, request, response, user),
    authorizeReconnection: (request, response, user) => authorizeReconnection(context, request, response, user),
    consumeReconnectionEnablement: (request, response, user) => consumeReconnectionEnablement(context, request, response, user),
    lookupReconnectionEnablement: (response, user, operationId) => lookupReconnectionEnablement(context, response, user, operationId),
  };
}
