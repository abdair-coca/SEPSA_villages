import type { BatchOrderSkip } from "../../domain";

export interface PilotLoginResponseDto { session_id: string; expires_at: string; user: { user_id: string; username: string; display_name: string; role: "ADMIN" | "TECHNICIAN" }; }
export interface PilotOrderResponseDto {
  order_id: string; cuc?: string; debtor_id: string; account_id?: string; supply_id?: string; purpose?: "CUT";
  status: "GENERADO" | "EJECUTADO" | "RECONEXIÓN" | "ANULADO";
  physical_status: "NONE" | "CLAIMED" | "CONFIRMED" | "PHYSICAL_UNKNOWN"; version: number;
  created_by: string; assigned_technician_id: string | null; assigned_technician_name: string | null;
  created_at: string; context?: Record<string, unknown>; source?: "PILOT_PROVISIONAL";
}
export interface PilotBatchOrderResponseDto { batch_id: string; requested_debtor_ids: string[]; created: PilotOrderResponseDto[]; skipped: Array<{ debtor_id: string; reason: BatchOrderSkip["reason"]; message: string }>; }
export interface PilotAuthorizationResponseDto { authorization_id: string; token: string; order_id: string; technician_id: string; technician_name_snapshot?: string; device_id: string; operation_id: string; version: number; issued_at: string; expires_at: string; source?: "PILOT_PROVISIONAL"; }
export interface PilotReconnectionEnablementResponseDto { enablement_id: string; token: string; order_id: string; technician_id: string; technician_name_snapshot: string; device_id: string; operation_id: string; version: number; issued_at: string; expires_at: string; source: "PILOT_PROVISIONAL"; }
export interface PilotReconnectionConsumeResponseDto { status: "consumed" | "already_consumed" | "not_enabled" | "unknown"; operation_id: string; source: "PILOT_PROVISIONAL"; }
export interface PilotReconnectionEnablementLookupDto { status: "reserved" | "consumed" | "expired" | "not_found" | "unknown"; operation_id: string; error_code?: string; source: "PILOT_PROVISIONAL"; }
export interface PilotSyncResponseDto { status: "acknowledged"; operation_id: string; source: "PILOT_PROVISIONAL"; order_id: string; technician_id: string; technician_name_snapshot?: string; device_id: string; order_version?: number; action: "CUT" | "RECONNECTION" | "VISIT"; recorded_at: string; effective_at?: string; demora?: string; evidence_refs: string[]; field_capture?: import("../../domain").FieldCapture; }
export interface PilotEvidenceUploadRequestDto { evidence_id: string; order_id: string; operation_id: string; technician_id: string; device_id: string; mime_type: "image/jpeg" | "image/png"; content_hash: string; content_base64: string; }
export interface PilotEvidenceUploadResponseDto { status: "verified"; evidence_id: string; content_hash: string; source: "PILOT_PROVISIONAL"; }
export interface PilotPackageResponseDto { package: { package_id: string; technician_id: string; device_id: string; version: number; downloaded_at: string; orders: PilotOrderResponseDto[] }; checksum: string; }
export interface PilotTechnicianResponseDto { technicians: unknown[]; }
export interface PilotLookupResponseDto { status: "confirmed" | "not_found" | "unknown"; operation_id: string; error_code?: string; order_id?: string; technician_id?: string; technician_name_snapshot?: string; device_id?: string; order_version?: number; action?: "CUT" | "RECONNECTION" | "VISIT"; recorded_at?: string; effective_at?: string; demora?: string; evidence_refs?: string[]; field_capture?: import("../../domain").FieldCapture; }
export interface PilotPageDto { limit?: number; offset?: number; total?: number; next_cursor?: string | null; }
export interface PilotAuditResponseDto extends PilotPageDto { audit: unknown[]; }
export interface PilotDebtorsResponseDto extends PilotPageDto { debtors: unknown[]; }
