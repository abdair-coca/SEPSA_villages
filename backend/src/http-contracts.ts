export type PilotRole = "ADMIN" | "TECHNICIAN";
export type PilotSource = "PILOT_PROVISIONAL";

export interface LoginRequestDto { username: string; password: string; }
export interface LoginResponseDto {
  session_id: string;
  expires_at: string;
  user: { user_id: string; username: string; display_name: string; role: PilotRole };
  source: PilotSource;
}
export interface CreateOrderRequestDto { operation_id: string; debtor_id: string; purpose: "CUT"; }
export interface AssignOrderRequestDto { operation_id: string; technician_id: string; expected_version: number; }
export interface PilotOrderDto {
  order_id: string; cuc: string; debtor_id: string; account_id: string; supply_id: string; purpose: "CUT";
  status: "GENERADO" | "EJECUTADO" | "RECONEXIÓN" | "ANULADO";
  physical_status: "NONE" | "CLAIMED" | "CONFIRMED" | "PHYSICAL_UNKNOWN"; version: number; created_by: string;
  assigned_technician_id: string | null; assigned_technician_name: string | null; created_at: string;
  context: Record<string, unknown>; source: PilotSource;
}
export interface AuthorizationRequestDto { operation_id: string; order_id: string; device_id: string; order_version: number; }
export interface AuthorizationResponseDto {
  authorization_id: string; token: string; order_id: string; technician_id: string; technician_name_snapshot: string; device_id: string;
  operation_id: string; version: number; issued_at: string; expires_at: string; source: PilotSource;
}
export interface ReconnectionEnablementRequestDto { operation_id: string; order_id: string; device_id: string; order_version: number; }
export interface ReconnectionEnablementResponseDto {
  enablement_id: string; token: string; order_id: string; technician_id: string; technician_name_snapshot: string; device_id: string;
  operation_id: string; version: number; issued_at: string; expires_at: string; source: PilotSource;
}
export interface ReconnectionEnablementConsumeRequestDto {
  enablement_id: string; token: string; order_id: string; technician_id: string; device_id: string; operation_id: string; version: number;
}
export interface ReconnectionEnablementConsumeResponseDto { status: "consumed" | "not_enabled"; operation_id: string; source: PilotSource; }
export interface ReconnectionEnablementLookupDto { status: "reserved" | "consumed" | "expired" | "not_found" | "unknown"; operation_id: string; error_code?: string; source: PilotSource; }
export interface SyncOperationRequestDto {
  operation_id: string; action: "CUT" | "RECONNECTION" | "VISIT"; order_id: string; technician_id?: string; technician_name_snapshot?: string; device_id: string;
  recorded_at: string; effective_at?: string; demora?: string; evidence_refs: string[]; attempted_action?: "CUT" | "RECONNECTION"; order_version?: number;
  authorization_id?: string; authorization_token?: string; field_capture?: unknown; reason?: string; exception_reason?: string;
}
export interface EvidenceUploadRequestDto { evidence_id: string; order_id: string; operation_id: string; technician_id?: string; device_id: string; mime_type: "image/jpeg" | "image/png"; content_hash: string; content_base64: string; }
export interface EvidenceUploadResponseDto { status: "verified"; evidence_id: string; content_hash: string; source: PilotSource; }
export interface EvidenceWireDto { evidence_refs: string[]; evidence_storage?: "LOCAL_ONLY"; }
export interface SyncResponseDto { status: "acknowledged"; operation_id: string; source: PilotSource; order_id: string; technician_id: string; technician_name_snapshot?: string; device_id: string; order_version?: number; action: "CUT" | "RECONNECTION" | "VISIT"; recorded_at: string; effective_at?: string; demora?: string; evidence_refs: string[]; field_capture?: unknown; }
export interface SyncConflictDto { code: "CONFLICT"; message: string; operation_id: string; }
export interface OperationLookupDto {
  status: "confirmed" | "not_found" | "unknown"; operation_id: string; error_code?: string; order_id?: string; technician_id?: string; technician_name_snapshot?: string;
  device_id?: string; order_version?: number; action?: "CUT" | "RECONNECTION" | "VISIT"; recorded_at?: string; effective_at?: string; demora?: string; evidence_refs?: string[]; field_capture?: unknown;
}
export interface HumanReviewRequestDto { order_id: string; technician_id: string; device_id: string; expected_version: number; reason: string; }
export interface HumanReviewResponseDto { status: "recorded"; order_id: string; operation_id: string; physical_status: "PHYSICAL_UNKNOWN"; version: number; source: PilotSource; }
export interface AuditEventDto {
  audit_id: string; actor_id: string; actor_role: PilotRole | null; action: string; entity_id: string | null;
  order_id: string | null; operation_id: string | null; result: "accepted" | "rejected"; reason: string | null;
  device_id: string | null; occurred_at: string; transition: unknown; metadata: unknown;
}
