/**
 * SQL de usuarios y sesiones (`users`, `user_role_grants`, `sessions`). Solo ejecuta consultas y devuelve
 * filas; la validación de credenciales, el hash de tokens y las decisiones de sesión viven en
 * `services/auth.service.ts`.
 */
import type { Queryable } from "../db.js";
import type { SessionRow, UserRow } from "../mappers/session.mapper.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";
import type { Role } from "../types.js";

export async function findUserByUsername(db: Queryable, username: string): Promise<UserRow | undefined> {
  const result = await db.query<UserRow>(
    `SELECT user_id, username, display_name, role, password_hash, enabled,
              ARRAY(SELECT role FROM user_role_grants g WHERE g.user_id = users.user_id ORDER BY role) AS roles
       FROM users WHERE username = $1 AND source = $2`,
    [username, PROVISIONAL_SOURCE],
  );
  return result.rows[0];
}

export async function insertSession(client: Queryable, input: { sessionId: string; userId: string; tokenHash: string; expiresAt: string; activeRole: Role }): Promise<void> {
  await client.query(
    "INSERT INTO sessions(session_id, user_id, token_hash, expires_at, source, active_role) VALUES ($1, $2, $3, $4, $5, $6)",
    [input.sessionId, input.userId, input.tokenHash, input.expiresAt, PROVISIONAL_SOURCE, input.activeRole],
  );
}

/** Revoca la sesión si seguía activa; devuelve las filas afectadas. */
export async function revokeSession(client: Queryable, sessionId: string): Promise<number | null> {
  const result = await client.query("UPDATE sessions SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL", [sessionId]);
  return result.rowCount;
}

/** Sesión vigente (no revocada, no vencida, usuario habilitado y rol activo concedido) a partir del hash del token. */
export async function findActiveSessionByTokenHash(db: Queryable, tokenHash: string): Promise<SessionRow | undefined> {
  const result = await db.query<SessionRow>(
    `SELECT s.session_id, u.user_id, u.username, u.display_name, s.active_role AS role, s.expires_at,
              ARRAY(SELECT role FROM user_role_grants g WHERE g.user_id = u.user_id ORDER BY role) AS roles
       FROM sessions s JOIN users u ON u.user_id = s.user_id
       JOIN user_role_grants active_grant ON active_grant.user_id = u.user_id AND active_grant.role = s.active_role
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.enabled = true AND u.source = $2`,
    [tokenHash, PROVISIONAL_SOURCE],
  );
  return result.rows[0];
}

export async function lockSessionActiveRole(client: Queryable, sessionId: string): Promise<Role | undefined> {
  const previous = await client.query<{ active_role: Role }>("SELECT active_role FROM sessions WHERE session_id = $1 FOR UPDATE", [sessionId]);
  return previous.rows[0]?.active_role;
}

/** Cambia el rol activo solo si la cuenta tiene ambos roles, está habilitada y la sesión sigue vigente. */
export async function updateSessionActiveRole(client: Queryable, sessionId: string, role: Role): Promise<{ active_role: Role; expires_at: string } | undefined> {
  const result = await client.query<{ active_role: Role; expires_at: string }>(
    `UPDATE sessions s SET active_role = $2 FROM users u
         WHERE s.session_id = $1 AND u.user_id = s.user_id AND u.enabled = true
           AND s.revoked_at IS NULL AND s.expires_at > now() AND u.source = $3
           AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = u.user_id AND g.role = 'ADMIN')
           AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = u.user_id AND g.role = 'TECHNICIAN')
         RETURNING s.active_role, s.expires_at`,
    [sessionId, role, PROVISIONAL_SOURCE],
  );
  return result.rows[0];
}
