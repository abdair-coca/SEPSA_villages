import { HttpError, isRecord, requiredInteger, requiredString } from "../../http.js";
import type { SyncPayload } from "../../types.js";

export function parseSyncPayload(body: Record<string, unknown>): SyncPayload {
  const action = requiredString(body.action, "action");
  if (action !== "CUT" && action !== "RECONNECTION" && action !== "VISIT") throw new HttpError(400, "INVALID_ACTION", "Action is not supported.");

  const evidence = body.evidence_refs;
  if (!Array.isArray(evidence) || evidence.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "INVALID_REQUEST", "evidence_refs must be an array of strings.");
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
  if (body.attempted_action !== undefined && body.attempted_action !== "CUT" && body.attempted_action !== "RECONNECTION") throw new HttpError(400, "INVALID_REQUEST", "attempted_action is invalid.");
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
  if (!isIsoTimestamp(payload.recorded_at)) throw new HttpError(400, "INVALID_TIMESTAMP", "recorded_at must be an ISO timestamp.");
  if (payload.action === "VISIT") {
    if (!payload.reason?.trim()) throw new HttpError(400, "VISIT_REASON_REQUIRED", "VISIT requires a reason.");
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
    throw new HttpError(400, "RECONNECTION_ENABLEMENT_REQUIRED", "RECONNECTION requires its consumed enablement id and order version, and must not resend its token.");
  }
  if (!isIsoTimestamp(payload.effective_at)) throw new HttpError(400, "INVALID_TIMESTAMP", "effective_at must be an ISO timestamp.");
  if (!payload.technician_name_snapshot?.trim()) throw new HttpError(400, "TECHNICIAN_NAME_REQUIRED", "RECONNECTION requires the technician name snapshot.");
  if (!payload.demora?.trim() || payload.demora.length > 1000) throw new HttpError(400, "RECONNECTION_DEMORA_INVALID", "demora must contain 1 to 1000 characters.");
  requireEvidenceOrException(payload, "RECONNECTION");
}

function validateCutPayload(payload: SyncPayload): void {
  requireEvidenceOrException(payload, "CUT");
  const capture = isRecord(payload.field_capture) ? payload.field_capture : undefined;
  const reading = capture && isRecord(capture.reading) ? capture.reading : undefined;
  if (!isValidFinalReading(reading)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requires a valid final meter reading.");

  const location = capture && isRecord(capture.location) ? capture.location : undefined;
  if (!location) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requires GPS capture or a controlled exception.");
  if (location.status === "CAPTURED") {
    if (!isValidCapturedLocation(location)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT GPS capture is invalid.");
  } else if (!isBypassedLocation(location)) {
    throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT requires GPS capture or a controlled exception.");
  }
  if (location.status === "BYPASSED" && !isIsoTimestamp(location.recordedAt)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT GPS exception timestamp is invalid.");
  if (!isValidCutCatalog(capture)) throw new HttpError(400, "FIELD_CAPTURE_INVALID", "CUT field capture catalog values are invalid.");
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
  if (expectedMeterId && reading && reading.meterId !== expectedMeterId) throw new HttpError(400, "METER_READING_MISMATCH", "Final meter reading does not match order meter.");
}
