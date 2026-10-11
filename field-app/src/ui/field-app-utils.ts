import type { ConnectivityMode, SyncStatus, WorkOrder } from "../domain/types";
import type { ActivityEntry, ActionKind } from "../app/store";
import type { StoredRecord } from "../ports/repository";
import type { SyncItem } from "../ports/sync";

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

export function shortHash(hash?: string): string {
  return hash ? `${hash.slice(0, 10)}…` : "disponible";
}

export function sortActivityEntries(entries: readonly ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((left, right) =>
    compareRecentTimestamps(activityTimestamp(left.record), activityTimestamp(right.record))
    || left.record.operationId.localeCompare(right.record.operationId),
  );
}

export function sortSyncItemsForDisplay(items: readonly SyncItem[], activity: readonly ActivityEntry[] = []): SyncItem[] {
  const activityByOperation = activityTimestampsByOperation(activity);
  return [...items].sort((left, right) =>
    Number(right.status !== "synced") - Number(left.status !== "synced")
    || compareRecentTimestamps(syncItemTimestamp(left, activityByOperation), syncItemTimestamp(right, activityByOperation))
    || left.operationId.localeCompare(right.operationId),
  );
}

export function sortOrdersForNext(orders: readonly WorkOrder[]): WorkOrder[] {
  return [...orders].sort((left, right) => orderPriority(left) - orderPriority(right));
}

export function orderJourneyOrders(orders: readonly WorkOrder[]): WorkOrder[] {
  return sortOrdersForNext(orders);
}

export function adjacentJourneyOrder(orders: readonly WorkOrder[], currentIndex: number, direction: -1 | 1): WorkOrder | undefined {
  return orders[currentIndex + direction];
}

export function hasCadastralCoordinates(context?: WorkOrder["context"]): boolean {
  return typeof context?.cadastralLatitude === "number"
    && Number.isFinite(context.cadastralLatitude)
    && typeof context?.cadastralLongitude === "number"
    && Number.isFinite(context.cadastralLongitude);
}

export function displayValue(value?: string | number): string | number {
  return value === undefined || value === "" ? "Dato no disponible" : value;
}

export function formatDebt(cents?: number): string | undefined {
  return cents === undefined ? undefined : `Bs ${(cents / 100).toFixed(2)}`;
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

export function isManualVisitAllowed(order: WorkOrder): boolean {
  return order.status === "GENERADO" && order.physicalStatus === "NONE";
}

export function pendingCount(items: SyncItem[]): number {
  return items.filter((item) => item.status !== "synced").length;
}

export function isUsable(mode: ConnectivityMode): boolean {
  return mode !== "offline";
}

export function formatDate(value?: string): string {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin datos"
    : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatActivityTime(value?: string): string {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin datos"
    : new Intl.DateTimeFormat("es-BO", { timeStyle: "short" }).format(date);
}

export function shortTechnicalId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-4)}`;
}

export function formatLastUpdate(value?: string, nowMs = Date.now()): { relative: string; exact: string } {
  if (!value) return { relative: "Sin datos", exact: "" };
  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return { relative: "Sin datos", exact: "" };

  const exact = new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);

  const diffSec = Math.floor(Math.max(0, nowMs - time) / 1000);
  if (diffSec < 45) return { relative: "hace instantes", exact };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { relative: `Hace ${diffMin} min`, exact };
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return { relative: `Hace ${diffHours} h`, exact };
  const dateStr = new Intl.DateTimeFormat("es-BO", { dateStyle: "short" }).format(date);
  return { relative: dateStr, exact };
}

function orderPriority(order: WorkOrder): number {
  if (order.status === "GENERADO" && order.physicalStatus === "NONE") return 0;
  if (order.physicalStatus === "PHYSICAL_UNKNOWN") return 1;
  if (order.status === "EJECUTADO" || order.status === "RECONEXIÓN") return 2;
  return 3;
}

export function activityTimestampsByOperation(activity: readonly ActivityEntry[]): Map<string, string | undefined> {
  return new Map(activity.map((entry) => [entry.record.operationId, activityTimestamp(entry.record)]));
}

export function syncItemTimestamp(item: SyncItem, activityByOperation: ReadonlyMap<string, string | undefined>): string | undefined {
  return isValidTimestamp(item.updatedAt) ? item.updatedAt : activityByOperation.get(item.operationId);
}

export function activityTimestamp(record: ActivityEntry["record"]): string | undefined {
  const effectiveAt = "effectiveAt" in record ? record.effectiveAt : undefined;
  return isValidTimestamp(effectiveAt) ? effectiveAt : record.recordedAt;
}

function isValidTimestamp(value?: string): value is string {
  return value !== undefined && Number.isFinite(Date.parse(value));
}

function compareRecentTimestamps(left?: string, right?: string): number {
  const leftTimestamp = timestampValue(left);
  const rightTimestamp = timestampValue(right);
  if (leftTimestamp === rightTimestamp) return 0;
  return rightTimestamp > leftTimestamp ? 1 : -1;
}

function timestampValue(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function queueReviewMessage(item: Pick<SyncItem, "manualReview" | "uncertain"> & Partial<Pick<SyncItem, "errorCode">>): string | undefined {
  if (item.errorCode === "RECONNECTION_NOT_COMPLETED") return "Habilitación denegada; no se registró una reposición. Puede iniciar una nueva solicitud si corresponde.";
  if (item.manualReview) return "Revisión humana · no reenviar";
  if (item.uncertain) return "Resultado incierto: verificar estado podría continuar sincronización según el motor.";
  return undefined;
}

export function orderActivityReviewPages(entries: readonly ActivityEntry[]): Array<{ title: string; text: string }> {
  return entries.flatMap((entry) => {
    const pages: Array<{ title: string; text: string }> = [];
    const appendText = (title: string, text: string) => {
      const chunks = splitReviewText(text);
      chunks.forEach((chunk, index) => pages.push({
        title: chunks.length > 1 ? `${title} · parte ${index + 1} de ${chunks.length}` : title,
        text: chunk,
      }));
    };
    const kind = activityLabel(entry.record.kind);
    appendText(kind, `${formatDate(entry.record.recordedAt)} · ${activityDetail(entry.record)}`);
    const exception = activityException(entry.record);
    if (exception) appendText("Excepción", exception);
    entry.evidence.forEach((evidence, index) => {
      appendText(`Evidencia ${index + 1}`, `${evidence.mimeType} · ${evidence.width} × ${evidence.height} · Guardada localmente · SHA-256 ${evidence.contentHash}`);
    });
    return pages;
  });
}

export function splitReviewText(value: string, maxLength = 120): string[] {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt <= 0) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining || chunks.length === 0) chunks.push(remaining);
  return chunks;
}
