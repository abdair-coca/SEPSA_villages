/**
 * Lectura y validación del payload de sync antes de tocar la base: campos obligatorios, captura de corte
 * (lectura final real en kWh, GPS válido o excepción justificada, tipo de corte del catálogo), evidencia o
 * excepción, y datos SC08 de la reconexión (`effective_at`, `demora`).
 */
import { HttpError, isRecord, requiredInteger, requiredString } from "../http/responses.js";
import type { SyncPayload } from "../types.js";

export function parseSyncPayload(body: Record<string, unknown>): SyncPayload {
  const action = requiredString(body.action, "action");
  if (action !== "CUT" && action !== "RECONNECTION" && action !== "VISIT") throw new HttpError(400, "INVALID_ACTION", "La acción no está soportada.");

  const evidence = body.evidence_refs;
  if (!Array.isArray(evidence) || evidence.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "INVALID_REQUEST", "evidence_refs debe ser una lista de textos.");
  }

  const payload: SyncPayload = {
    operation_id: requiredString(body.operation_id, "operation_id"),
    action,
    order_id: requiredString(body.order_id, "order_id"),
    device_id: requiredString(body.device_id, "device_id"),
    recorded_at: requiredString(body.recorded_at, "recorded_at"),
    evidence_refs: evidence,
  };
  if (body.technician_id !== undefined) payload.technician_id = requiredString(body.technician_id, "technician_id");
  if (body.technician_name_snapshot !== undefined) payload.technician_name_snapshot = requiredNonBlankString(body.technician_name_snapshot, "technician_name_snapshot");
  if (body.effective_at !== undefined) payload.effective_at = requiredString(body.effective_at, "effective_at");
  if (body.demora !== undefined) payload.demora = requiredNonBlankString(body.demora, "demora");
  if (body.attempted_action !== undefined && body.attempted_action !== "CUT" && body.attempted_action !== "RECONNECTION") throw new HttpError(400, "INVALID_REQUEST", "attempted_action no es válido.");
  if (body.attempted_action !== undefined) payload.attempted_action = body.attempted_action;
  if (body.order_version !== undefined) payload.order_version = requiredInteger(body.order_version, "order_version");
  if (body.authorization_id !== undefined) payload.authorization_id = requiredString(body.authorization_id, "authorization_id");
  if (body.authorization_token !== undefined) payload.authorization_token = requiredString(body.authorization_token, "authorization_token");
  if (body.field_capture !== undefined) payload.field_capture = body.field_capture;
  if (body.reason !== undefined) payload.reason = requiredString(body.reason, "reason");
  if (body.exception_reason !== undefined) payload.exception_reason = requiredString(body.exception_reason, "exception_reason");
  return payload;
}

export function validateSyncPayload(payload: SyncPayload): void {
  if (!isIsoTimestamp(payload.recorded_at)) throw new HttpError(400, "INVALID_TIMESTAMP", "recorded_at debe ser una fecha ISO.");
  if (payload.action === "VISIT") {
    if (!payload.reason?.trim()) throw new HttpError(400, "VISIT_REASON_REQUIRED", "VISIT requiere un motivo.");
    return;
  }
  if (payload.action === "RECONNECTION") {
    validateReconnectionPayload(payload);
    return;
  }
  validateCutPayload(payload);
}

function validateReconnectionPayload(payload: SyncPayload): void {
  if (!payload.authorization_id || payload.authorization_token !== undefined || payload.order_version === undefined) {
    throw new HttpError(400, "RECONNECTION_ENABLEMENT_REQUIRED", "RECONNECTION requiere el identificador de habilitación consumida y la versión de la orden, y no debe reenviar su token.");
  }
  if (!isIsoTimestamp(payload.effective_at)) throw new HttpError(400, "INVALID_TIMESTAMP", "effective_at debe ser una fecha ISO.");
  if (!payload.technician_name_snapshot?.trim()) throw new HttpError(400, "TECHNICIAN_NAME_REQUIRED", "RECONNECTION requiere la copia del nombre del técnico.");
  if (!payload.demora?.trim() || payload.demora.length > 1000) throw new HttpError(400, "RECONNECTION_DEMORA_INVALID", "demora debe tener entre 1 y 1000 caracteres.");
  requireEvidenceOrException(payload, "RECONNECTION");
}

function validateCutPayload(payload: SyncPayload): void {
  requireEvidenceOrException(payload, "CUT");
  const capture = isRecord(payload.field_capture) ? payload.field_capture : undefined;
  const reading = capture && isRecord(capture.reading) ? capture.reading : undefined;
  if (!isValidFinalReading(reading)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requiere una lectura final válida del medidor.");

  const location = capture && isRecord(capture.location) ? capture.location : undefined;
  if (!location) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requiere captura GPS o una excepción controlada.");
  if (location.status === "CAPTURED") {
    if (!isValidCapturedLocation(location)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "La captura GPS de CUT no es válida.");
  } else if (!isBypassedLocation(location)) {
    throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requiere captura GPS o una excepción controlada.");
  }
  if (location.status === "BYPASSED" && !isIsoTimestamp(location.recordedAt)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "La fecha de la excepción GPS de CUT no es válida.");
  if (!isValidCutCatalog(capture)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "Los valores de catálogo de la captura de CUT no son válidos.");
}

function requireEvidenceOrException(payload: SyncPayload, action: "CUT" | "RECONNECTION"): void {
  if (payload.evidence_refs.length === 0 && !hasControlledException(payload.exception_reason, "saltar_control_fotos")) {
    throw new HttpError(400, "EVIDENCE_REQUIRED", `${action} requires evidence_refs or a controlled photo exception.`);
  }
}

function isValidFinalReading(reading: Record<string, unknown> | undefined): boolean {
  return Boolean(
    reading &&
    reading.status === "CAPTURED" &&
    typeof reading.value === "number" &&
    Number.isFinite(reading.value) &&
    reading.value >= 0 &&
    typeof reading.meterId === "string" &&
    reading.meterId.trim() &&
    reading.unit === "kWh" &&
    isIsoTimestamp(reading.recordedAt),
  );
}

function isValidCapturedLocation(location: Record<string, unknown>): boolean {
  return Boolean(
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    typeof location.accuracyMeters === "number" &&
    Number.isFinite(location.accuracyMeters) &&
    location.accuracyMeters >= 0 &&
    isIsoTimestamp(location.recordedAt),
  );
}

function isBypassedLocation(location: Record<string, unknown>): boolean {
  return location.status === "BYPASSED" && hasControlledException(location.exceptionReason, "saltar_control_coordenadas");
}

function isValidCutCatalog(capture: Record<string, unknown> | undefined): boolean {
  return Boolean(
    capture &&
    ["RED", "MEDIDOR", "BARRAS", "PROTECCION", "ACOMETIDA", "FUSIBLES"].includes(String(capture.cutType)) &&
    typeof capture.nearbyMeters === "boolean",
  );
}

function hasControlledException(value: unknown, code: string): boolean {
  return typeof value === "string" && value.trim().startsWith(`${code}:`) && value.trim().slice(code.length + 1).trim().length > 0;
}

function isIsoTimestamp(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function requiredNonBlankString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "INVALID_REQUEST", `${field} is required.`);
  return value;
}

export function validateCaptureMeter(rawCapture: unknown, rawContext: unknown): void {
  const capture = isRecord(rawCapture) ? rawCapture : undefined;
  const reading = capture && isRecord(capture.reading) ? capture.reading : undefined;
  const context = isRecord(rawContext) ? rawContext : undefined;
  const expectedMeterId = context && typeof context.meter_id === "string" ? context.meter_id : undefined;
  if (expectedMeterId && reading && reading.meterId !== expectedMeterId) throw new HttpError(400, "METER_READING_MISMATCH", "La lectura final no corresponde al medidor de la orden.");
}
