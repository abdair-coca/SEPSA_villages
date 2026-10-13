/**
 * Etiquetas visibles (en español) para acciones, estados de orden, estado físico y sincronización.
 * Solo traduce valores del dominio a texto o tono visual; no decide qué puede hacer el usuario.
 */
import type { ActionKind, SyncStatus, WorkOrder } from "../domain/types";
import type { StoredRecord } from "../ports/repository";
import type { SyncItem } from "../ports/sync";
import { errorGuidance } from "./error-catalog";

export function actionLabel(action: ActionKind): string {
  return action === "VISIT" ? "Visita" : action === "CUT" ? "Corte" : "Reconexión";
}

export function queueActionLabel(action: SyncItem["action"]): string {
  return action === "CUT" ? "Corte ejecutado" : action === "VISIT" ? "Observación de campo" : "Reconexión";
}

export function activityLabel(kind: StoredRecord["kind"]): string {
  return kind === "VISIT" ? "Visita sin ejecución" : kind === "CUT" ? "Corte" : "Reconexión";
}

export function activityDetail(record: StoredRecord): string {
  return "reason" in record
    ? record.reason
    : record.status === "CONFIRMED"
      ? "Resultado confirmado localmente"
      : record.status === "PHYSICAL_UNKNOWN"
        ? "Resultado incierto"
        : "Intento registrado";
}

export function activityException(record: StoredRecord): string | undefined {
  return record.exceptionReason;
}

export function orderStatusLabel(status: WorkOrder["status"]): string {
  return status === "GENERADO"
    ? "Por ejecutar"
    : status === "EJECUTADO"
      ? "Corte ejecutado"
      : status === "RECONEXIÓN"
        ? "Reconectada"
        : "Anulada";
}

export function fieldOrderStatusLabel(order: WorkOrder): string {
  if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "En revisión";
  return order.status === "ANULADO" ? "Anulada" : order.status === "GENERADO" ? "Por ejecutar" : order.status === "RECONEXIÓN" ? "Reconectada" : "Ejecutada";
}

export function physicalStatusLabel(status: WorkOrder["physicalStatus"]): string {
  return status === "NONE"
    ? "Sin ejecución"
    : status === "CLAIMED"
      ? "Reclamado"
      : status === "CONFIRMED"
        ? "Confirmado"
        : "Resultado incierto";
}

export function orderStatusTone(order: WorkOrder): string {
  return order.physicalStatus === "PHYSICAL_UNKNOWN"
    ? "review"
    : order.status === "RECONEXIÓN"
      ? "done"
      : order.status === "EJECUTADO"
        ? "active"
        : order.status === "ANULADO"
          ? "muted"
          : "ready";
}

export function syncStatusLabel(status: SyncStatus): string {
  return status === "pending"
    ? "Pendiente"
    : status === "syncing"
      ? "Sincronizando"
      : status === "synced"
        ? "Sincronizado"
        : "Falló";
}

export function queueReviewMessage(item: Pick<SyncItem, "manualReview" | "uncertain"> & Partial<Pick<SyncItem, "errorCode" | "uncertainCause">>): string | undefined {
  if (item.errorCode === "RECONNECTION_NOT_COMPLETED") return "Habilitación denegada; no se registró una reposición. Puede iniciar una nueva solicitud si corresponde.";
  if (item.manualReview) return "Revisión humana · no reenviar";
  if (item.uncertain) {
    const guidance = errorGuidance(item.uncertainCause ?? item.errorCode, { uncertain: true });
    return guidance ? `Resultado incierto: ${guidance.title}. ${guidance.nextStep}` : "Resultado incierto. No repita la acción; use Verificar estado.";
  }
  return undefined;
}

/** Etiquetas del administrador. Usan textos propios ("Generada", "Físico incierto") distintos a los del técnico. */
export function adminOrderDomainStatusLabel(status: WorkOrder["status"]): string { return status === "GENERADO" ? "Generada" : status === "EJECUTADO" ? "Ejecutada" : status === "RECONEXIÓN" ? "Reconectada" : "Anulada"; }
export function adminOrderStatusLabel(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "Físico incierto"; return adminOrderDomainStatusLabel(order.status); }
export function adminOrderStatusTone(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "review"; return order.status === "GENERADO" ? "ready" : order.status === "EJECUTADO" ? "done" : order.status === "ANULADO" ? "muted" : "active"; }
