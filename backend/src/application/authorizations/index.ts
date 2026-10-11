import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "../../types.js";
import type { ApplicationContext } from "../application-context.js";
import { authorizeCut } from "./cut.js";
import { consumeReconnectionEnablement, lookupReconnectionEnablement } from "./reconnection-operations.js";
import { authorizeReconnection } from "./reconnection-issue.js";

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
