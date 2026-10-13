/**
 * Sincronización desde el store. Evita dos sincronizaciones simultáneas (`syncInFlight`), no hace nada sin
 * conexión útil (la cola se conserva) y antes de sincronizar intenta recuperar reconexiones y cortes que
 * quedaron a medias. Un fallo nunca borra operaciones: solo deja un aviso.
 */
import { recoverReconnection } from "../use-cases/reconnection";
import { recoverCut } from "../use-cases/process";
import { SyncEngine } from "../use-cases/sync";
import type { AppState, AppStoreDependencies } from "./store";
import { formatSyncMessage } from "./store-results";
import type { ActionKind } from "../domain/types";

export interface SyncCoordinatorContext {
  dependencies: AppStoreDependencies;
  technicianId: string;
  deviceId: string;
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
  recoverPendingOperations(): Promise<void>;
}

export function createSyncCoordinator(context: SyncCoordinatorContext): SyncCoordinator {
  const { dependencies, technicianId, deviceId, now, getSnapshot, ensureReady, refresh, update, runWithBusy } = context;
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
    await recoverPendingOperations();
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

  async function recoverPendingOperations(): Promise<void> {
    if (!dependencies.connectivity.isUsable()) return;
    const items = await dependencies.repository.listSyncItems();
    for (const item of items) {
      if (item.status === "synced" || item.manualReview) continue;
      try {
        if (item.action === "RECONNECTION") await recoverReconnection({ repository: dependencies.repository, enablement: dependencies.enablement, operationId: item.operationId, technicianId, deviceId, now: now() });
        if (item.action === "CUT") await recoverCut({ repository: dependencies.repository, authorization: dependencies.authorization, operationId: item.operationId, technicianId, deviceId, now: now() });
      } catch {
        // La operación sigue guardada e incierta; la recuperación nunca inventa un éxito.
      }
    }
  }

  return { requestSync, syncAfterLocalAction, recoverPendingOperations };
}
