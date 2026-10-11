/**
 * Filas de usuario/sesión y el cuerpo JSON de la sesión que recibe el cliente.
 */
import type { Role, SessionUser } from "../types.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";

export interface UserRow {
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
  roles: Role[];
  password_hash: string;
  enabled: boolean;
}

export interface TechnicianRow {
  user_id: string;
  username: string;
  display_name: string;
  role: "TECHNICIAN";
  enabled: boolean;
}

export interface SessionRow {
  session_id: string;
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
  roles: Role[];
  expires_at: string;
}

export function toTechnician(technician: TechnicianRow): Record<string, unknown> {
  return {
    user_id: technician.user_id,
    username: technician.username,
    display_name: technician.display_name,
    role: technician.role,
    enabled: technician.enabled,
    source: PROVISIONAL_SOURCE,
  };
}

export function sessionBody(user: SessionUser): Record<string, unknown> {
  return {
    session_id: user.sessionId,
    expires_at: user.expiresAt,
    source: PROVISIONAL_SOURCE,
    user: {
      user_id: user.userId,
      username: user.username,
      display_name: user.displayName,
      role: user.role,
      roles: user.roles,
    },
  };
}
