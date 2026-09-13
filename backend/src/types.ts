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

export interface SyncPayload {
  operation_id: string;
  action: "CUT" | "VISIT";
  order_id: string;
  technician_id?: string;
  device_id: string;
  recorded_at: string;
  evidence_refs: string[];
  attempted_action?: "CUT";
  order_version?: number;
  authorization_id?: string;
  authorization_token?: string;
  field_capture?: unknown;
  reason?: string;
  exception_reason?: string;
}
