/**
 * Comandos de la app de campo que combinan varias llamadas al store.
 */
import type { AppStore } from "./store";

export async function syncThenRefreshAssigned(store: AppStore, refreshAssigned: () => Promise<void>): Promise<void> {
  const hasPending = store.getSnapshot().syncItems.some((item) => item.status !== "synced");
  if (hasPending) await store.sync();
  const remaining = store.getSnapshot().syncItems.filter((item) => item.status !== "synced");
  if (remaining.length) {
    const code = remaining.find((item) => item.errorCode)?.errorCode;
    throw new Error(code
      ? `El servidor no confirmó ${remaining.length} operación(es) pendiente(s) (${code}). Los registros y evidencias siguen guardados en este dispositivo.`
      : `El servidor no confirmó ${remaining.length} operación(es) pendiente(s). Los registros y evidencias siguen guardados en este dispositivo.`);
  }
  await refreshAssigned();
}

export function openOrderMap(store: AppStore, orderId?: string): void {
  if (orderId) store.selectOrder(orderId);
  store.setTab("map");
}
