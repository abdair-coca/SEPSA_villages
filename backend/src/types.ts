/**
 * Tipos compartidos del backend: rol y usuario de la sesión autenticada.
 */
export type Role = "ADMIN" | "TECHNICIAN";

export interface AuthenticatedUser {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface SessionUser extends AuthenticatedUser {
  sessionId: string;
  roles: Role[];
  expiresAt: string;
}

import type { SyncOperationRequestDto } from "./http/http-contracts.js";

export type SyncPayload = SyncOperationRequestDto;
