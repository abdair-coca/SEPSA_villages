/**
 * Traduce los resultados de los casos de uso (visita, corte, reconexión) a `ActionResult` y mensajes en
 * español para la UI. Distingue guardado local, confirmado, bloqueado e incierto; nunca presenta un
 * resultado local como confirmado por el servidor.
 */
import { DomainError } from "../domain/errors";
import type { ConnectivityMode } from "../domain/types";
import type { CutProcessResult } from "../use-cases/process";
import type { OfflineVisitResult } from "../use-cases/visit";
import type { ReconnectionResult } from "../use-cases/reconnection";
import type { ActionResult, ActionResultOutcome, AppMessage, AppState } from "./store";
import { errorGuidance } from "../utils/error-catalog";

export function formatSyncMessage(synced: number): string {
  const count = Number.isFinite(synced) ? Math.max(0, Math.trunc(synced)) : 0;
  return `${count} ${count === 1 ? "operación sincronizada" : "operaciones sincronizadas"}`;
}

export function actionResultForVisit(result: OfflineVisitResult, state: AppState): ActionResult {
  const record = result.visit;
  const item = state.syncItems.find((candidate) => candidate.operationId === record.operationId);
  const syncStatus = item?.status ?? record.syncStatus;
  const outcome: ActionResultOutcome = syncStatus === "synced"
    ? "confirmed"
    : item?.manualReview
      ? "review"
      : "saved";
  return {
    requestedAction: "VISIT",
    recordedAction: "VISIT",
    outcome,
    localSaved: true,
    operationId: record.operationId,
    syncStatus,
    reason: record.reason,
  };
}

export function actionResultForCut(result: CutProcessResult, state: AppState): ActionResult {
  const record = "visit" in result ? result.visit : result.operation;
  const operationId = record?.operationId;
  const item = operationId ? state.syncItems.find((candidate) => candidate.operationId === operationId) : undefined;
  const syncStatus = item?.status ?? record?.syncStatus;
  const order = state.orders.find((candidate) => candidate.orderId === record?.orderId);
  const recordedAction = record?.kind === "VISIT" ? "VISIT" : "CUT";
  const localSaved = Boolean(record);
  const serverConfirmed = recordedAction === "CUT"
    && syncStatus === "synced"
    && order?.status === "EJECUTADO"
    && order.physicalStatus === "CONFIRMED";
  let outcome: ActionResultOutcome;
  if (serverConfirmed) outcome = "confirmed";
  else if (result.outcome === "physical_unknown" || result.outcome === "recovery_required" || item?.manualReview || (recordedAction === "CUT" && item?.uncertain && syncStatus === "failed")) outcome = "review";
  else if (result.outcome === "visit_recorded" || result.outcome === "blocked") outcome = "blocked";
  else outcome = "saved";
  return {
    requestedAction: "CUT",
    recordedAction,
    outcome,
    localSaved,
    operationId,
    syncStatus,
    physicalStatus: order?.physicalStatus ?? (record && record.kind !== "VISIT" ? record.physicalStatus : undefined),
    reason: result.outcome === "blocked" ? result.reason : record && "reason" in record ? record.reason : undefined,
  };
}

export function actionResultForReconnection(result: ReconnectionResult, state: AppState): ActionResult {
  const record = result.outcome === "visit_recorded"
    ? result.visit
    : "operation" in result
      ? result.operation
      : undefined;
  const item = record ? state.syncItems.find((candidate) => candidate.operationId === record.operationId) : undefined;
  const syncStatus = item?.status ?? record?.syncStatus;
  const order = record ? state.orders.find((candidate) => candidate.orderId === record.orderId) : undefined;
  const recordedAction = record?.kind === "VISIT" ? "VISIT" : "RECONNECTION";
  const locallySaved = Boolean(record);
  const serverConfirmed = recordedAction === "RECONNECTION"
    && syncStatus === "synced"
    && order?.status === "RECONEXIÓN"
    && order.physicalStatus === "CONFIRMED";
  const uncertain = result.outcome === "physical_unknown"
    || result.outcome === "recovery_required"
    || (item?.manualReview && result.outcome !== "blocked")
    || item?.uncertain;
  const outcome: ActionResultOutcome = serverConfirmed
    ? "confirmed"
    : uncertain
      ? "review"
      : result.outcome === "blocked" || result.outcome === "visit_recorded"
        ? "blocked"
        : "saved";
  return {
    requestedAction: "RECONNECTION",
    recordedAction,
    outcome,
    localSaved: locallySaved,
    operationId: record?.operationId,
    syncStatus,
    physicalStatus: order?.physicalStatus ?? (record && record.kind !== "VISIT" ? record.physicalStatus : undefined),
    reason: result.outcome === "blocked" ? result.reason : record && "reason" in record ? record.reason : undefined,
  };
}

export function readableError(error: unknown): string {
  if (error instanceof DomainError) {
    const messages: Record<string, string> = {
      ORDER_NOT_EXECUTED: "La orden debe estar ejecutada antes de preparar reconexión.",
      ORDER_STATUS_INVALID: "La orden no está lista para esta acción.",
      CUT_ALREADY_CLAIMED: "Esta orden ya tiene una ejecución reclamada.",
      CUT_STATUS_INVALID: "La orden necesita estado físico confirmado.",
      EVIDENCE_REQUIRED: "Adjunte JPEG/PNG preparado o marque excepción con justificación.",
      EVIDENCE_FORMAT_INVALID: "La evidencia debe ser JPEG o PNG.",
      EVIDENCE_NOT_OPTIMIZED: "La evidencia debe quedar preparada en cinco megapíxeles o menos.",
      EVIDENCE_TOO_LARGE: "No pudimos reducir la foto lo suficiente. Tome otra foto con menos resolución.",
      VISIT_REASON_REQUIRED: "Escriba un motivo para registrar la visita.",
      FIELD_CAPTURE_REQUIRED: "Complete lectura, tipo de corte, GPS y verificación de medidores.",
      METER_READING_REQUIRED: "Ingrese lectura final válida del medidor.",
      METER_READING_INVALID: "La lectura debe estar asociada al medidor descargado.",
      GPS_REQUIRED: "Capture GPS o registre una excepción controlada.",
      GPS_COORDINATES_INVALID: "Las coordenadas GPS no son válidas.",
      GPS_ACCURACY_INVALID: "La precisión GPS no es válida.",
      CUT_TYPE_INVALID: "Seleccione tipo de corte válido.",
      NEARBY_METERS_REQUIRED: "Indique si verificó medidores cercanos.",
      VISIT_NOT_ALLOWED_AFTER_CUT: "Esta orden ya tiene una ejecución o revisión registrada.",
      ACTIVE_ORDER_EXISTS: "Ya existe una orden activa para este suministro.",
      AUTHENTICATION_EXPIRED: "La sesión expiró. Ingrese nuevamente.",
      AUTHENTICATION_FAILED: "Las credenciales no son válidas.",
      AUTHENTICATION_REQUIRED: "Ingrese con su usuario para continuar.",
      AUTHORIZATION_REQUIRED: "Se requiere una autorización técnica vigente para esta acción.",
      BATCH_REQUEST_INVALID: "El lote necesita un identificador y al menos un deudor.",
      DEVICE_ID_REQUIRED: "Falta el identificador de este dispositivo.",
      DEVICE_NOT_PROVISIONED: "Este dispositivo no tiene un paquete técnico válido. Avise al administrador.",
      DEVICE_OWNERSHIP_CONFLICT: "Este dispositivo ya pertenece a otro técnico. Avise al administrador.",
      EVIDENCE_BINDING_MISMATCH: "La foto pertenece a otra operación.",
      EVIDENCE_CONTENT_INVALID: "El contenido de la foto no es válido.",
      EVIDENCE_CONTENT_REQUIRED: "Falta el contenido preparado de la foto.",
      EVIDENCE_CONTENT_TYPE_INVALID: "El tipo de la foto no coincide con sus datos.",
      EVIDENCE_DIMENSIONS_INVALID: "Las dimensiones de la foto no son válidas.",
      EVIDENCE_HASH_INVALID: "La verificación de la foto no es válida.",
      EVIDENCE_HASH_MISMATCH: "La foto no coincide con su verificación. Vuelva a prepararla.",
      EVIDENCE_HASH_REQUIRED: "Falta la verificación de la foto guardada.",
      EVIDENCE_ID_REQUIRED: "Falta el identificador de la foto.",
      FORBIDDEN: "Su usuario no puede realizar esta acción.",
      IDEMPOTENCY_CONFLICT: "Esta operación ya existe con datos distintos. No se creó duplicado.",
      METER_READING_MISMATCH: "La lectura corresponde a otro medidor.",
      OPERATION_BINDING_MISMATCH: "El identificador de la operación ya pertenece a otro corte o reconexión.",
      OPERATION_ID_INVALID: "El identificador de la operación no es válido.",
      OPERATION_ID_REQUIRED: "Falta el identificador de la operación.",
      OPERATION_IMMUTABLE: "Una operación ya registrada no puede cambiar su identificador.",
      ORDER_ALREADY_ASSIGNED: "La orden ya está asignada a este técnico.",
      ORDER_CLAIM_REJECTED: "No se pudo reservar la orden. Revise la orden y vuelva a intentarlo.",
      ORDER_NOT_ASSIGNED: "La orden no está asignada a este técnico.",
      ORDER_NOT_FOUND: "La orden no existe en este dispositivo.",
      ORDER_STATE_INVALID: "La orden no está en un estado válido para esta acción.",
      ORDER_TRANSITION_INVALID: "La orden no puede pasar a ese estado.",
      ORDER_VERSION_CONFLICT: "La orden cambió. Descargue las órdenes de nuevo y revise la orden.",
      ORDER_VERSION_REQUIRED: "Falta la versión de la orden. Descargue las órdenes de nuevo.",
      RECONNECTION_DEMORA_REQUIRED: "Ingrese una observación de demora o Sin demora.",
      RECONNECTION_DEMORA_TOO_LONG: "La observación de demora no puede superar 1000 caracteres.",
      RECONNECTION_ENABLEMENT_MISSING: "La habilitación de reconexión no se guardó en este dispositivo.",
      ROLE_NOT_RECOGNIZED: "El rol de este usuario no es reconocido. Avise al administrador.",
      SUPPLY_ID_REQUIRED: "Falta el identificador de suministro confirmado.",
      TECHNICIAN_NAME_REQUIRED: "Ingrese el nombre del técnico.",
      TECHNICIAN_REQUIRED: "Seleccione un técnico habilitado.",
      VISIT_CLAIM_REJECTED: "No se pudo guardar la visita. Intente nuevamente.",
    };
    return messages[error.code] ?? "La operación no pudo continuar. Revise datos locales.";
  }
  return error instanceof Error ? error.message : "La operación no pudo continuar.";
}

export function messageForCut(result: CutProcessResult, mode: ConnectivityMode): AppMessage {
  if (result.outcome === "pending_sync") return { tone: "info", text: "Corte guardado localmente; el servidor debe confirmarlo al sincronizar." };
  if (result.outcome === "executed") return { tone: "success", text: mode === "offline" ? "Corte guardado localmente." : "Corte registrado localmente y pendiente de sincronización." };
  if (result.outcome === "visit_recorded") return { tone: "info", text: "Visita guardada; corte bloqueado por validación externa." };
  if (result.outcome === "physical_unknown" || result.outcome === "recovery_required") return { tone: "warning", text: "Resultado incierto. Revisión humana requerida; no repetir esta acción." };
  if (result.outcome === "duplicate") return { tone: "info", text: "Operación ya registrada; no se creó duplicado." };
  return { tone: "warning", text: "Corte bloqueado por validación externa; visita conservada si correspondía." };
}

/** Mensaje tras verificar una reconexión con el servidor. Nunca presenta una consulta no concluyente como confirmada. */
export function messageForReconnectionVerification(result: ReconnectionResult | undefined): AppMessage {
  if (!result) return { tone: "info", text: "No hay una reconexión pendiente de verificar en este dispositivo." };
  if (result.outcome === "executed") return { tone: "success", text: "Reconexión confirmada por el servidor. Se enviará con la sincronización." };
  if (result.outcome === "duplicate") return { tone: "info", text: "La reconexión ya estaba confirmada." };
  if (result.outcome === "physical_unknown") {
    const guidance = errorGuidance(result.errorCode ?? result.operation.errorCode, { uncertain: true });
    return { tone: "warning", text: guidance ? `Resultado incierto: ${guidance.title}. ${guidance.nextStep}` : "No se pudo verificar la reconexión. No repita la acción." };
  }
  return { tone: "info", text: "La reconexión no requiere verificación." };
}

export function messageForReconnection(result: ReconnectionResult, mode: ConnectivityMode): AppMessage {
  if (result.outcome === "executed") return { tone: "success", text: mode === "offline" ? "Reconexión guardada localmente." : "Reconexión registrada localmente y pendiente de sincronización." };
  if (result.outcome === "visit_recorded") return { tone: "info", text: "Visita guardada; reconexión bloqueada por habilitación externa." };
  if (result.outcome === "physical_unknown" || result.outcome === "recovery_required") return { tone: "warning", text: "Resultado incierto. Revisión humana requerida; no repetir esta acción." };
  if (result.outcome === "duplicate") return { tone: "info", text: "Operación ya registrada; no se creó duplicado." };
  return { tone: "warning", text: "Reconexión bloqueada por habilitación externa; visita conservada si correspondía." };
}
