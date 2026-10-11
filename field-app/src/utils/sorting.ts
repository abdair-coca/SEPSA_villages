/**
 * Orden y conteo de listas para mostrar: órdenes de la jornada, actividad local y cola de sincronización.
 * Nunca modifica las listas recibidas; devuelve copias ordenadas.
 */
import type { WorkOrder } from "../domain/types";
import type { SyncItem } from "../ports/sync";
import type { ActivityEntry } from "../state/store";

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

export function pendingCount(items: SyncItem[]): number {
  return items.filter((item) => item.status !== "synced").length;
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
