import { executeReconnection as runReconnection, SyncEngine } from "../application";
import type { ActionKind, AppState, AppStoreDependencies } from "./store";
import { formatSyncMessage } from "./store-results";

export interface SyncCoordinatorContext {
  dependencies: AppStoreDependencies;
  technicianId: string;
  now: () => string;
  getSnapshot: () => AppState;
  ensureReady: () => Promise<void>;
  refresh: () => Promise<void>;
  update: (change: Partial<AppState>) => void;
  runWithBusy: <T>(action: ActionKind | "SYNC", operation: () => Promise<T>) => Promise<T>;
}

export interface SyncCoordinator {
  requestSync(): Promise<void>;
  syncAfterLocalAction(): Promise<void>;
  recoverPendingReconnections(): Promise<void>;
}

export function createSyncCoordinator(context: SyncCoordinatorContext): SyncCoordinator {
  const { dependencies, technicianId, now, getSnapshot, ensureReady, refresh, update, runWithBusy } = context;
  let syncInFlight: Promise<void> | undefined;

  function requestSync(): Promise<void> {
    if (syncInFlight) return syncInFlight;
    const operation = runSync().catch(() => {
      update({ message: { tone: "warning", text: "La operación quedó guardada en este dispositivo. No pudimos sincronizar; reintentaremos automáticamente." } });
    }).finally(() => {
      if (syncInFlight === operation) syncInFlight = undefined;
    });
    syncInFlight = operation;
    return operation;
  }

  async function runSync(): Promise<void> {
    await ensureReady();
    if (!dependencies.connectivity.isUsable()) {
      update({ message: { tone: "warning", text: "Sin conexión útil. La cola permanece guardada para después." } });
      return;
    }
    await recoverPendingReconnections();
    await runWithBusy("SYNC", async () => {
      const report = await new SyncEngine(dependencies.repository, dependencies.connectivity, dependencies.transport, { now }, dependencies.evidenceUploader).syncOnce();
      await refresh();
      update({ message: report.failed
        ? { tone: "warning", text: "Algunas operaciones requieren revisión; ninguna fue eliminada." }
        : { tone: "success", text: formatSyncMessage(report.synced), transient: true } });
    });
  }

  async function syncAfterLocalAction(): Promise<void> {
    if (getSnapshot().mode === "offline" || !getSnapshot().syncItems.some((item) => item.status !== "synced")) return;
    await requestSync();
  }

  async function recoverPendingReconnections(): Promise<void> {
    if (!dependencies.connectivity.isUsable()) return;
    const items = await dependencies.repository.listSyncItems();
    for (const item of items) {
      if (item.action !== "RECONNECTION" || item.status === "synced" || item.manualReview) continue;
      const record = await dependencies.repository.getRecord(item.operationId);
      if (!record || record.kind !== "RECONNECTION" || (record.status !== "INTENT_PERSISTED" && record.status !== "PHYSICAL_UNKNOWN")) continue;
      const order = await dependencies.repository.getOrder(record.orderId);
      if (!order || order.assignedTechnicianId !== technicianId) continue;
      try {
        await runReconnection({
          repository: dependencies.repository,
          enablement: dependencies.enablement,
          order,
          operationId: record.operationId,
          technicianId: record.technicianId,
          technicianNameSnapshot: record.technicianNameSnapshot,
          deviceId: record.deviceId,
          now: now(),
          demora: record.demora,
          exceptionReason: record.exceptionReason,
        });
      } catch {
        // Keep the operation durable and uncertain; recovery never invents success.
      }
    }
  }

  return { requestSync, syncAfterLocalAction, recoverPendingReconnections };
}
