export type Role = "ADMIN" | "TECHNICIAN";

export interface AuthenticatedUser {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface SessionUser extends AuthenticatedUser {
  sessionId: string;
}

import type { SyncOperationRequestDto } from "./http-contracts.js";

export type SyncPayload = SyncOperationRequestDto;
