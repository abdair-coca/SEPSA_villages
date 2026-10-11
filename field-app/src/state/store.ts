import { DomainError } from "../domain/errors";
import type { EvidenceReference, ConnectivityMode, FieldCapture, WorkOrder, WorkPackage } from "../domain/types";
import type { AuthorizationAdapter, EnablementAdapter } from "../ports/authorization";
import type { CaptureDraftContent, CaptureDraftKey, LocalRepository, StoredRecord } from "../ports/repository";
import type { ConnectivityPort } from "../ports/connectivity";
import type { SyncItem, EvidenceUploadPort } from "../ports/sync";
import { metadataOnlyEvidence, type EvidenceDraft } from "./evidence";
import { createActionCoordinator } from "./store-actions";
import { createSyncCoordinator } from "./store-sync";
import { formatSyncMessage, readableError } from "./store-results";

export { formatSyncMessage } from "./store-results";

export type { EvidenceDraft } from "./evidence";

export const DEMO_TECHNICIAN_ID = "tech-camila";
export const DEMO_DEVICE_ID = "device-rugged-01";
export const DEMO_PACKAGE_ID = "demo-field-package-v1";
export const DEMO_SIMULATION_LABEL = "Simulación, sin conexión a SEPSA";

export type OrderFilter = "ALL" | WorkOrder["status"] | "REVIEW";
export type AppTab = "home" | "orders" | "map" | "queue";
export type ActionKind = "VISIT" | "CUT" | "RECONNECTION";

export interface ActionInput {
  evidence?: EvidenceDraft;
  file?: File;
  exceptionReason?: string;
  reason?: string;
  fieldCapture?: FieldCapture;
  gpsExceptionReason?: string;
  demora?: string;
}

export interface AppMessage {
  tone: "success" | "info" | "warning" | "error";
  text: string;
  transient?: boolean;
}

export type ActionResultOutcome = "confirmed" | "saved" | "blocked" | "review";

export interface ActionResult {
  requestedAction: ActionKind;
  recordedAction: SyncItem["action"];
  outcome: ActionResultOutcome;
  localSaved: boolean;
  operationId?: string;
  syncStatus?: SyncItem["status"];
  physicalStatus?: WorkOrder["physicalStatus"];
  reason?: string;
}

export interface AppState {
  status: "loading" | "ready" | "error";
  error?: string;
  package?: WorkPackage;
  orders: WorkOrder[];
  syncItems: SyncItem[];
  activity: ActivityEntry[];
  selectedOrderId: string | null;
  query: string;
  filter: OrderFilter;
  tab: AppTab;
  mode: ConnectivityMode;
  busyAction?: ActionKind | "SYNC" | "INIT";
  message?: AppMessage;
  lastRefreshAt?: string;
}

export interface ActivityEntry {
  record: StoredRecord;
  evidence: EvidenceReference[];
}

export interface AppStoreDependencies {
  repository: LocalRepository;
  authorization: AuthorizationAdapter;
  enablement: EnablementAdapter;
  connectivity: ConnectivityPort;
  transport: import("../ports/sync").SyncTransport;
  evidenceUploader?: EvidenceUploadPort;
  seedPackage?: WorkPackage;
  prepareExternalValidation?: PrepareExternalValidation;
  now?: () => string;
  technicianId?: string;
  technicianName?: string;
  deviceId?: string;
}

export type PrepareExternalValidation = (action: Exclude<ActionKind, "VISIT">, order: WorkOrder, operationId: string, now: string) => void;

export interface AppStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppState;
  getServerSnapshot(): AppState;
  init(): Promise<void>;
  refresh(): Promise<void>;
  setQuery(query: string): void;
  setFilter(filter: OrderFilter): void;
  setTab(tab: AppTab): void;
  selectOrder(orderId: string | null): void;
  setMode(mode: ConnectivityMode): void;
  loadCaptureDraft(orderId: string, action: ActionKind): Promise<CaptureDraftContent | undefined>;
  saveCaptureDraft(orderId: string, action: ActionKind, content: CaptureDraftContent): Promise<void>;
  registerVisit(orderId: string, input?: ActionInput): Promise<ActionResult>;
  executeCut(orderId: string, input?: ActionInput): Promise<ActionResult>;
  executeReconnection(orderId: string, input?: ActionInput): Promise<ActionResult>;
  sync(): Promise<void>;
}

interface SeedableRepository extends LocalRepository {
  savePackage(workPackage: WorkPackage): Promise<void>;
}

export function createAppStore(dependencies: AppStoreDependencies): AppStore {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const technicianId = dependencies.technicianId ?? DEMO_TECHNICIAN_ID;
  const technicianName = dependencies.technicianName ?? technicianId;
  const deviceId = dependencies.deviceId ?? DEMO_DEVICE_ID;
  const listeners = new Set<() => void>();
  let snapshot: AppState = {
    status: "loading",
    orders: [],
    syncItems: [],
    activity: [],
    selectedOrderId: null,
    query: "",
    filter: "ALL",
    tab: "home",
    mode: dependencies.connectivity.getMode(),
  };
  let initPromise: Promise<void> | undefined;
  const update = (change: Partial<AppState>): void => {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  };
  const syncCoordinator = createSyncCoordinator({
    dependencies,
    technicianId,
    now,
    getSnapshot: () => snapshot,
    ensureReady,
    refresh,
    update,
    runWithBusy,
  });
  const actionCoordinator = createActionCoordinator({
    dependencies,
    technicianId,
    technicianName,
    deviceId,
    now,
    getSnapshot: () => snapshot,
    ensureReady,
    getAssignedOrder,
    runWithBusy,
    finishDraftIfCommitted,
    refreshAfterCommit,
    syncAfterLocalAction: syncCoordinator.syncAfterLocalAction,
    update,
  });

  async function refresh(): Promise<void> {
    const workPackage = await dependencies.repository.loadAssignedPackage();
    assertPackageScope(workPackage, dependencies);
    const syncItems = await dependencies.repository.listSyncItems();
    const activity = await deriveActivity(syncItems);
    const selected = snapshot.selectedOrderId && workPackage.orders.some((order) => order.orderId === snapshot.selectedOrderId)
      ? snapshot.selectedOrderId
      : null;
    update({ package: workPackage, orders: workPackage.orders, syncItems, activity, selectedOrderId: selected, lastRefreshAt: now() });
  }

  async function deriveActivity(syncItems: SyncItem[]): Promise<ActivityEntry[]> {
    const entries = await Promise.all(syncItems.map(async (item) => {
      const record = await dependencies.repository.getRecord(item.operationId);
      if (!record) return undefined;
      const evidence = dependencies.repository.getEvidence
        ? (await Promise.all(record.evidenceRefs.map((evidenceId) => dependencies.repository.getEvidence?.(evidenceId)))).filter((candidate): candidate is EvidenceReference => Boolean(candidate)).map(metadataOnlyEvidence)
        : [];
      return { record, evidence };
    }));
    return entries.filter((entry): entry is ActivityEntry => Boolean(entry));
  }

  async function loadOrSeed(): Promise<WorkPackage> {
    try {
      return await dependencies.repository.loadAssignedPackage();
    } catch (error) {
      const seedable = dependencies.repository as Partial<SeedableRepository>;
      if (!seedable.savePackage || !dependencies.seedPackage) throw error;
      await seedable.savePackage(dependencies.seedPackage);
      return dependencies.repository.loadAssignedPackage();
    }
  }

  const store: AppStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => snapshot,
    async init() {
      if (initPromise) return initPromise;
      initPromise = (async () => {
        update({ status: "loading", busyAction: "INIT", error: undefined });
        try {
          await dependencies.repository.recoverInFlight?.(now());
          const workPackage = await loadOrSeed();
          assertPackageScope(workPackage, dependencies);
          await syncCoordinator.recoverPendingReconnections();
          await refresh();
         update({ status: "ready", busyAction: undefined, message: undefined });
        } catch (error) {
          update({ status: "error", busyAction: undefined, error: readableError(error) });
          initPromise = undefined;
        }
      })();
      return initPromise;
    },
    async refresh() {
      await refresh();
    },
    setQuery(query) {
      update({ query });
    },
    setFilter(filter) {
      update({ filter });
    },
    setTab(tab) {
      update({ tab });
    },
    selectOrder(orderId) {
      if (orderId !== null && !snapshot.orders.some((candidate) => candidate.orderId === orderId)) return;
      update({ selectedOrderId: orderId, tab: orderId ? "orders" : snapshot.tab, message: undefined });
    },
    setMode(mode) {
      const wasOffline = snapshot.mode === "offline";
      setAdapterMode(dependencies.connectivity, mode);
      setAdapterMode(dependencies.authorization, mode);
      setAdapterMode(dependencies.enablement, mode);
      setAdapterMode(dependencies.transport, mode);
      update({ mode, message: mode === "offline" ? { tone: "warning", text: "Trabajo local activo. Validaciones externas quedan bloqueadas." } : undefined });
      if (wasOffline && mode !== "offline" && snapshot.status === "ready") void syncCoordinator.requestSync().catch(() => undefined);
    },
    async loadCaptureDraft(orderId, action) {
      await ensureReady();
      getAssignedOrder(orderId);
      const key = draftKey(orderId, action);
      const draft = await dependencies.repository.getCaptureDraft(key);
      if (!draft) return undefined;
      // A crash may happen after the atomic operation commit but before draft removal.
      const items = await dependencies.repository.listSyncItems();
      for (const item of items) {
        if (item.orderId !== orderId || item.action !== action) continue;
        const record = await dependencies.repository.getRecord(item.operationId);
        if (!record || record.technicianId !== technicianId || record.deviceId !== deviceId || Date.parse(record.recordedAt) < Date.parse(draft.updatedAt)) continue;
        if (action !== "VISIT" && (record.kind !== action || record.status !== "CONFIRMED")) continue;
        if (action === "VISIT" && record.kind !== "VISIT") continue;
        if (!(await evidenceIsDurable(record))) continue;
        await dependencies.repository.deleteCaptureDraft(key).catch(() => undefined);
        return undefined;
      }
      return draft.content;
    },
    async saveCaptureDraft(orderId, action, content) {
      await ensureReady();
      getAssignedOrder(orderId);
      await dependencies.repository.saveCaptureDraft({ ...draftKey(orderId, action), updatedAt: now(), content });
    },
    registerVisit: actionCoordinator.registerVisit,
    executeCut: actionCoordinator.executeCut,
    executeReconnection: actionCoordinator.executeReconnection,
    sync: syncCoordinator.requestSync,
  };

  async function ensureReady(): Promise<void> {
    await store.init();
    if (snapshot.status !== "ready") throw new Error(snapshot.error ?? "El paquete local no está disponible.");
  }

  function getAssignedOrder(orderId: string): WorkOrder {
    const order = snapshot.orders.find((candidate) => candidate.orderId === orderId);
    if (!order || order.assignedTechnicianId !== technicianId) throw new DomainError("Order is not assigned to this technician.", "ORDER_NOT_ASSIGNED");
    return order;
  }

  function draftKey(orderId: string, action: ActionKind): CaptureDraftKey {
    return { technicianId, deviceId, orderId, action };
  }

  async function evidenceIsDurable(record: StoredRecord): Promise<boolean> {
    for (const evidenceId of record.evidenceRefs) {
      const evidence = await dependencies.repository.getEvidence?.(evidenceId);
      if (!evidence?.content || evidence.operationId !== record.operationId) return false;
    }
    return true;
  }

  async function finishDraftIfCommitted(
    orderId: string,
    action: ActionKind,
    operationId: string,
    input: ActionInput,
    options: { recordedAction?: SyncItem["action"]; cleanupDraft?: boolean } = {},
  ): Promise<void> {
    const record = await dependencies.repository.getRecord(operationId);
    const items = await dependencies.repository.listSyncItems();
    const recordedAction = options.recordedAction ?? action;
    const queued = items.some((item) => item.operationId === operationId && item.orderId === orderId && item.action === recordedAction);
    const evidenceExpected = Boolean(input.file || input.evidence);
    const confirmed = record?.kind === "VISIT"
      ? recordedAction === "VISIT"
      : Boolean(record && record.kind === action && record.status === "CONFIRMED" && record.physicalStatus === "CONFIRMED");
    const durableCutIntent = recordedAction === "CUT" && record?.kind === "CUT" && record.status === "INTENT_PERSISTED" && record.physicalStatus === "CLAIMED";
    if (!record || !queued || record.orderId !== orderId || record.technicianId !== technicianId || record.deviceId !== deviceId || (!confirmed && !durableCutIntent) || (evidenceExpected && !record.evidenceRefs.length) || !(await evidenceIsDurable(record))) {
      throw new Error("No pudimos verificar el guardado local. Revise pendientes antes de repetir la acción.");
    }
    // Draft cleanup is best effort after durable operation, evidence and queue verification.
    if (options.cleanupDraft !== false) await dependencies.repository.deleteCaptureDraft(draftKey(orderId, action)).catch(() => undefined);
  }

  async function refreshAfterCommit(): Promise<boolean> {
    try {
      await refresh();
      return true;
    } catch {
      update({ message: { tone: "warning", text: "No pudimos actualizar la vista. Revise pendientes y vuelva a abrir la jornada antes de otra acción." } });
      return false;
    }
  }

  async function runWithBusy<T>(action: ActionKind | "SYNC", operation: () => Promise<T>): Promise<T> {
    update({ busyAction: action });
    try {
      return await operation();
    } catch (error) {
      update({ message: { tone: "error", text: readableError(error) } });
      throw error;
    } finally {
      update({ busyAction: undefined });
    }
  }

  return store;
}

export function createUnavailableAppStore(): AppStore {
  const snapshot: AppState = { status: "error", error: "IndexedDB no está disponible en este dispositivo.", orders: [], syncItems: [], activity: [], selectedOrderId: null, query: "", filter: "ALL", tab: "home", mode: "offline" };
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => snapshot,
    init: async () => undefined,
    refresh: async () => undefined,
    setQuery: () => undefined,
    setFilter: () => undefined,
    setTab: () => undefined,
    selectOrder: () => undefined,
    setMode: () => undefined,
    loadCaptureDraft: async () => undefined,
    saveCaptureDraft: async () => { throw new Error("IndexedDB no está disponible en este dispositivo."); },
    registerVisit: async () => ({ requestedAction: "VISIT", recordedAction: "VISIT", outcome: "review", localSaved: false }),
    executeCut: async () => ({ requestedAction: "CUT", recordedAction: "CUT", outcome: "review", localSaved: false }),
    executeReconnection: async () => ({ requestedAction: "RECONNECTION", recordedAction: "RECONNECTION", outcome: "review", localSaved: false }),
    sync: async () => undefined,
  };
}

export function selectVisibleOrders(state: AppState): WorkOrder[] {
  const query = state.query.trim().toLocaleLowerCase();
  return state.orders.filter((order) => {
    const matchesQuery =
      !query ||
      order.orderId.toLocaleLowerCase().includes(query) ||
      (order.cuc && order.cuc.toLocaleLowerCase().includes(query)) ||
      (order.accountId && order.accountId.toLocaleLowerCase().includes(query)) ||
      (order.supplyId && order.supplyId.toLocaleLowerCase().includes(query)) ||
      (order.context?.accountId && order.context.accountId.toLocaleLowerCase().includes(query)) ||
      (order.context?.supplyId && order.context.supplyId.toLocaleLowerCase().includes(query)) ||
      (order.context?.meterId && order.context.meterId.toLocaleLowerCase().includes(query)) ||
      (order.context?.customerName && order.context.customerName.toLocaleLowerCase().includes(query)) ||
      (order.context?.address && order.context.address.toLocaleLowerCase().includes(query)) ||
      (order.context?.route && order.context.route.toLocaleLowerCase().includes(query)) ||
      (order.context?.routeName && order.context.routeName.toLocaleLowerCase().includes(query)) ||
      (order.context?.routeOrder !== undefined && String(order.context.routeOrder).includes(query));
    const matchesFilter = state.filter === "ALL" || (state.filter === "REVIEW" ? order.physicalStatus === "PHYSICAL_UNKNOWN" : order.status === state.filter);
    return Boolean(matchesQuery && matchesFilter);
  });
}

function assertPackageScope(workPackage: WorkPackage, dependencies: AppStoreDependencies): void {
  if (workPackage.technicianId !== (dependencies.technicianId ?? DEMO_TECHNICIAN_ID) || workPackage.deviceId !== (dependencies.deviceId ?? DEMO_DEVICE_ID)) throw new Error("El paquete local pertenece a otra identidad.");
  if (!Number.isFinite(workPackage.version) || workPackage.version < 1) throw new Error("El paquete local no tiene una versión válida.");
  if (workPackage.orders.some((order) => order.assignedTechnicianId !== (dependencies.technicianId ?? DEMO_TECHNICIAN_ID))) throw new Error("El paquete contiene órdenes fuera de asignación.");
}

function setAdapterMode(adapter: unknown, mode: ConnectivityMode): void {
  if (adapter && typeof adapter === "object" && "setMode" in adapter && typeof adapter.setMode === "function") adapter.setMode(mode);
}
