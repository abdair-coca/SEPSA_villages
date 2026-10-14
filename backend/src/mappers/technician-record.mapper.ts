/**
 * Fila de `sync_operations` → entrada del registro del técnico. Es una lista blanca: solo sale lo que el técnico
 * registró en campo (fechas, captura, evidencias y motivos) más el estado de la sincronización. Los campos que no
 * están aquí no se copian, aunque estén en el payload guardado (por ejemplo, `authorization_token`).
 */
import type { TechnicianRecordRow } from "../repositories/technician-record.repository.js";

export function toTechnicianRecordEntry(row: TechnicianRecordRow): Record<string, unknown> {
  const payload = row.payload;
  return {
    operation_id: row.operation_id,
    order_id: row.order_id,
    action: row.action,
    status: row.status,
    device_id: row.device_id,
    recorded_at: textOrNull(payload.recorded_at),
    created_at: toIsoString(row.created_at),
    acknowledged_at: row.acknowledged_at === null ? null : toIsoString(row.acknowledged_at),
    conflict_reason: row.conflict_reason,
    order_version: integerOrNull(payload.order_version),
    effective_at: textOrNull(payload.effective_at),
    demora: textOrNull(payload.demora),
    technician_name_snapshot: textOrNull(payload.technician_name_snapshot),
    reason: textOrNull(payload.reason),
    exception_reason: textOrNull(payload.exception_reason),
    evidence_refs: textArray(payload.evidence_refs),
    field_capture: isRecord(payload.field_capture) ? payload.field_capture : null,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integerOrNull(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
