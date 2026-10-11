import type { IncomingMessage, ServerResponse } from "node:http";
import { hashToken, verifyPassword, createOpaqueToken } from "../../auth.js";
import { withTransaction } from "../../db.js";
import { HttpError, parseBearerToken, parseJsonBody, requiredString, sendJson, sendNoContent } from "../../http.js";
import type { Role, SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { insertAudit } from "../audit/record.js";
import { sessionBody, type SessionRow, type UserRow } from "../projections/session.js";
import { clearSessionCookie, parseCookie, sessionCookie } from "./cookies.js";
import { createLoginRateLimiter } from "./rate-limiter.js";
import { randomUUID } from "node:crypto";

export interface AuthHandlers {
  login(request: IncomingMessage, response: ServerResponse): Promise<void>;
  logout(request: IncomingMessage, response: ServerResponse): Promise<void>;
  requireSession(request: IncomingMessage): Promise<SessionUser>;
  switchRole(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
}

export function createAuthHandlers(context: ApplicationContext): AuthHandlers {
  const loginRateLimiter = createLoginRateLimiter(context.config);

  async function login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const username = requiredString(body.username, "username");
    const password = requiredString(body.password, "password");
    loginRateLimiter.enforce(request, username);
    const result = await context.pool.query<UserRow>(
      `SELECT user_id, username, display_name, role, password_hash, enabled,
              ARRAY(SELECT role FROM user_role_grants g WHERE g.user_id = users.user_id ORDER BY role) AS roles
       FROM users WHERE username = $1 AND source = $2`,
      [username, PROVISIONAL_SOURCE],
    );
    const user = result.rows[0];
    const authenticatedUser = await findValidLoginUser(user, password);
    if (!authenticatedUser) {
      context.logEvent("auth.login", { requestId: String(response.getHeader("x-request-id")), result: "rejected" });
      throw new HttpError(401, "INVALID_CREDENTIALS", "Username or password is invalid.");
    }
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + context.config.sessionTtlSeconds * 1000).toISOString();
    const sessionId = randomUUID();
    await withTransaction(context.pool, async (client) => {
      await client.query(
        "INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source, active_role) VALUES ($1, $2, $3, $4, $5, $6)",
        [sessionId, authenticatedUser.user_id, hashToken(token), expiresAt, PROVISIONAL_SOURCE, authenticatedUser.role],
      );
      await insertAudit(client, { actorId: authenticatedUser.user_id, actorRole: authenticatedUser.role, action: "LOGIN", result: "accepted", entityId: sessionId });
    });
    response.setHeader("set-cookie", sessionCookie(token, context.config.sessionTtlSeconds, context.config.cookieSecure === true));
    context.logEvent("auth.login", { requestId: String(response.getHeader("x-request-id")), result: "accepted" });
    sendJson(response, 200, {
      session_id: sessionId, expires_at: expiresAt,
      user: { user_id: authenticatedUser.user_id, username: authenticatedUser.username, display_name: authenticatedUser.display_name, role: authenticatedUser.role, roles: authenticatedUser.roles },
      source: PROVISIONAL_SOURCE,
    });
  }

  async function logout(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const user = await requireSession(request);
    await withTransaction(context.pool, async (client) => {
      const result = await client.query("UPDATE sessions SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL", [user.sessionId]);
      if (result.rowCount === 1) await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "LOGOUT", result: "accepted", entityId: user.sessionId });
    });
    response.setHeader("set-cookie", clearSessionCookie(context.config.cookieSecure === true));
    context.logEvent("auth.logout", { requestId: String(response.getHeader("x-request-id")), result: "accepted" });
    sendNoContent(response);
  }

  async function requireSession(request: IncomingMessage): Promise<SessionUser> {
    const token = parseBearerToken(request.headers.authorization) ?? parseCookie(request.headers.cookie, "sepsa_session");
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Valid session is required.");
    const result = await context.pool.query<SessionRow>(
      `SELECT s.session_id, u.user_id, u.username, u.display_name, s.active_role AS role, s.expires_at,
              ARRAY(SELECT role FROM user_role_grants g WHERE g.user_id = u.user_id ORDER BY role) AS roles
       FROM sessions s JOIN users u ON u.user_id = s.user_id
       JOIN user_role_grants active_grant ON active_grant.user_id = u.user_id AND active_grant.role = s.active_role
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.enabled = true AND u.source = $2`,
      [hashToken(token), PROVISIONAL_SOURCE],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(401, "UNAUTHENTICATED", "Session is invalid, expired, or revoked.");
    return { sessionId: row.session_id, userId: row.user_id, username: row.username, displayName: row.display_name, role: row.role, roles: row.roles, expiresAt: row.expires_at };
  }

  async function switchRole(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void> {
    const body = await parseJsonBody(request, context.config.maxBodyBytes);
    const role = requiredString(body.role, "role");
    if (!isSupportedRole(role)) throw new HttpError(400, "INVALID_ROLE", "Seleccione Administrador o Técnico.");
    const next = await withTransaction(context.pool, async (client) => {
      const previous = await client.query<{ active_role: Role }>("SELECT active_role FROM sessions WHERE session_id = $1 FOR UPDATE", [user.sessionId]);
      const previousRole = previous.rows[0]?.active_role;
      if (!previousRole) throw new HttpError(401, "UNAUTHENTICATED", "Session is invalid, expired, or revoked.");
      const result = await client.query<{ active_role: Role; expires_at: string }>(
        `UPDATE sessions s SET active_role = $2 FROM users u
         WHERE s.session_id = $1 AND u.user_id = s.user_id AND u.enabled = true
           AND s.revoked_at IS NULL AND s.expires_at > now() AND u.source = $3
           AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = u.user_id AND g.role = 'ADMIN')
           AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = u.user_id AND g.role = 'TECHNICIAN')
         RETURNING s.active_role, s.expires_at`,
        [user.sessionId, role, PROVISIONAL_SOURCE],
      );
      const row = result.rows[0];
      if (!row) throw new HttpError(403, "ROLE_NOT_GRANTED", "Esta cuenta no tiene ambos roles habilitados. Solicite los permisos al administrador.");
      await insertAudit(client, { actorId: user.userId, actorRole: role, action: "SWITCH_ROLE", result: "accepted", entityId: user.sessionId, metadata: { previous_role: previousRole, active_role: role } });
      return { ...user, role: row.active_role, expiresAt: row.expires_at, roles: ["ADMIN", "TECHNICIAN"] as Role[] };
    });
    sendJson(response, 200, sessionBody(next));
  }

  return { login, logout, requireSession, switchRole };
}

async function findValidLoginUser(user: UserRow | undefined, password: string): Promise<UserRow | undefined> {
  if (!user || !user.enabled || !user.roles.includes(user.role)) return undefined;
  return (await verifyPassword(password, user.password_hash)) ? user : undefined;
}

function isSupportedRole(value: string): value is Role {
  return value === "ADMIN" || value === "TECHNICIAN";
}
