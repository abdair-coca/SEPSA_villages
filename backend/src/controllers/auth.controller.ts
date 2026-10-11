/**
 * HTTP de autenticación: login (con límite de intentos), logout, sesión actual, cambio de rol activo y la
 * extracción de la sesión de cada petición. La sesión se acepta por cookie o `Authorization: Bearer`.
 * Lee y valida la forma de la petición, maneja la cookie `sepsa_session`, emite el log de seguridad y
 * delega las reglas en `services/auth.service.ts`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { clearSessionCookie, parseCookie, sessionCookie } from "../http/cookies.js";
import { HttpError, parseBearerToken, parseJsonBody, requiredString, sendJson, sendNoContent } from "../http/responses.js";
import { sessionBody } from "../mappers/session.mapper.js";
import { createAuthService } from "../services/auth.service.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { createLoginRateLimiter } from "../shared/rate-limiter.js";
import type { Role, SessionUser } from "../types.js";

export interface AuthHandlers {
  login(request: IncomingMessage, response: ServerResponse): Promise<void>;
  logout(request: IncomingMessage, response: ServerResponse): Promise<void>;
  requireSession(request: IncomingMessage): Promise<SessionUser>;
  currentSession(response: ServerResponse, user: SessionUser): Promise<void>;
  switchRole(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
}

export function createAuthHandlers(context: ApplicationContext): AuthHandlers {
  const loginRateLimiter = createLoginRateLimiter(context.config);
  const service = createAuthService(context);

  async function login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const username = requiredString(body.username, "username");
    const password = requiredString(body.password, "password");
    loginRateLimiter.enforce(request, username);
    const session = await service.login(username, password);
    if (!session) {
      context.logEvent("auth.login", { requestId: String(response.getHeader("x-request-id")), result: "rejected" });
      throw new HttpError(401, "INVALID_CREDENTIALS", "Username or password is invalid.");
    }
    response.setHeader("set-cookie", sessionCookie(session.token, context.config.sessionTtlSeconds, context.config.cookieSecure === true));
    context.logEvent("auth.login", { requestId: String(response.getHeader("x-request-id")), result: "accepted" });
    sendJson(response, 200, {
      session_id: session.sessionId, expires_at: session.expiresAt,
      user: { user_id: session.user.user_id, username: session.user.username, display_name: session.user.display_name, role: session.user.role, roles: session.user.roles },
      source: PROVISIONAL_SOURCE,
    });
  }

  async function logout(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const user = await requireSession(request);
    await service.logout(user);
    response.setHeader("set-cookie", clearSessionCookie(context.config.cookieSecure === true));
    context.logEvent("auth.logout", { requestId: String(response.getHeader("x-request-id")), result: "accepted" });
    sendNoContent(response);
  }

  async function requireSession(request: IncomingMessage): Promise<SessionUser> {
    const token = parseBearerToken(request.headers.authorization) ?? parseCookie(request.headers.cookie, "sepsa_session");
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Valid session is required.");
    return service.resolveSession(token);
  }

  async function currentSession(response: ServerResponse, user: SessionUser): Promise<void> {
    sendJson(response, 200, sessionBody(user));
  }

  async function switchRole(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const role = requiredString(body.role, "role");
    if (!isSupportedRole(role)) throw new HttpError(400, "INVALID_ROLE", "Seleccione Administrador o Técnico.");
    const next = await service.switchRole(user, role);
    sendJson(response, 200, sessionBody(next));
  }

  return { login, logout, requireSession, currentSession, switchRole };
}

function isSupportedRole(value: string): value is Role {
  return value === "ADMIN" || value === "TECHNICIAN";
}
