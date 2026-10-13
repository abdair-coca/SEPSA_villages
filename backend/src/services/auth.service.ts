/**
 * Reglas de autenticación: validar credenciales, abrir y revocar sesiones, resolver la sesión de un token y
 * cambiar el rol activo. No conoce HTTP (cookies, cabeceras, respuestas) ni escribe SQL
 * (`repositories/users.repository.ts`).
 * - Login: el usuario debe existir, estar habilitado y tener concedido su rol; la contraseña se verifica con scrypt.
 *   De la sesión solo se guarda el hash SHA-256 del token, nunca el token.
 * - Resolución de sesión: se busca por el hash del token y debe estar vigente, no revocada y con el usuario habilitado.
 */
import { randomUUID } from "node:crypto";
import { withTransaction } from "../db.js";
import { HttpError } from "../http/responses.js";
import type { UserRow } from "../mappers/session.mapper.js";
import { insertAudit } from "../repositories/audit.repository.js";
import {
  findActiveSessionByTokenHash,
  findUserByUsername,
  insertSession,
  lockSessionActiveRole,
  revokeSession,
  updateSessionActiveRole,
} from "../repositories/users.repository.js";
import type { ServiceContext } from "../shared/application-context.js";
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from "../shared/auth-crypto.js";
import type { Role, SessionUser } from "../types.js";

export interface LoginResult {
  token: string;
  sessionId: string;
  expiresAt: string;
  user: UserRow;
}

export interface AuthService {
  /** Devuelve `undefined` si las credenciales no son válidas; el controlador decide cómo responder. */
  login(username: string, password: string): Promise<LoginResult | undefined>;
  logout(user: SessionUser): Promise<void>;
  resolveSession(token: string): Promise<SessionUser>;
  switchRole(user: SessionUser, role: Role): Promise<SessionUser>;
}

export function createAuthService(context: ServiceContext): AuthService {
  async function login(username: string, password: string): Promise<LoginResult | undefined> {
    const user = await findUserByUsername(context.pool, username);
    const authenticatedUser = await findValidLoginUser(user, password);
    if (!authenticatedUser) return undefined;
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + context.config.sessionTtlSeconds * 1000).toISOString();
    const sessionId = randomUUID();
    await withTransaction(context.pool, async (client) => {
      await insertSession(client, { sessionId, userId: authenticatedUser.user_id, tokenHash: hashToken(token), expiresAt, activeRole: authenticatedUser.role });
      await insertAudit(client, { actorId: authenticatedUser.user_id, actorRole: authenticatedUser.role, action: "LOGIN", result: "accepted", entityId: sessionId });
    });
    return { token, sessionId, expiresAt, user: authenticatedUser };
  }

  async function logout(user: SessionUser): Promise<void> {
    await withTransaction(context.pool, async (client) => {
      const revokedCount = await revokeSession(client, user.sessionId);
      if (revokedCount === 1) await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "LOGOUT", result: "accepted", entityId: user.sessionId });
    });
  }

  async function resolveSession(token: string): Promise<SessionUser> {
    const row = await findActiveSessionByTokenHash(context.pool, hashToken(token));
    if (!row) throw new HttpError(401, "UNAUTHENTICATED", "La sesión no es válida, venció o fue revocada.");
    return { sessionId: row.session_id, userId: row.user_id, username: row.username, displayName: row.display_name, role: row.role, roles: row.roles, expiresAt: row.expires_at };
  }

  async function switchRole(user: SessionUser, role: Role): Promise<SessionUser> {
    return withTransaction(context.pool, async (client) => {
      const previousRole = await lockSessionActiveRole(client, user.sessionId);
      if (!previousRole) throw new HttpError(401, "UNAUTHENTICATED", "La sesión no es válida, venció o fue revocada.");
      const row = await updateSessionActiveRole(client, user.sessionId, role);
      if (!row) throw new HttpError(403, "ROLE_NOT_GRANTED", "Esta cuenta no tiene ambos roles habilitados. Solicite los permisos al administrador.");
      await insertAudit(client, { actorId: user.userId, actorRole: role, action: "SWITCH_ROLE", result: "accepted", entityId: user.sessionId, metadata: { previous_role: previousRole, active_role: role } });
      return { ...user, role: row.active_role, expiresAt: row.expires_at, roles: ["ADMIN", "TECHNICIAN"] as Role[] };
    });
  }

  return { login, logout, resolveSession, switchRole };
}

/** Hash válido de una contraseña que nadie conoce: iguala el tiempo de respuesta cuando el usuario no puede entrar. */
const decoyPasswordHash = hashPassword(randomUUID());

async function findValidLoginUser(user: UserRow | undefined, password: string): Promise<UserRow | undefined> {
  if (!user || !user.enabled || !user.roles.includes(user.role)) {
    await verifyPassword(password, await decoyPasswordHash);
    return undefined;
  }
  return (await verifyPassword(password, user.password_hash)) ? user : undefined;
}
