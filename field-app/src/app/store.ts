import {
  executeCut as runCut,
  executeOfflineVisit,
  executeReconnection as runReconnection,
  SyncEngine,
  type CutProcessResult,
  type ReconnectionResult,
} from "../application";
import { DomainError, generateOperationId, type EvidenceReference, type ConnectivityMode, type FieldCapture, type WorkOrder, type WorkPackage } from "../domain";
import type { AuthorizationAdapter, EnablementAdapter } from "../ports/authorization";
import type { CaptureDraftContent, CaptureDraftKey, ConnectivityPort, LocalRepository, StoredRecord } from "../ports";
import type { SyncItem } from "../ports/sync";
import { metadataOnlyEvidence, prepareEvidence, type EvidenceDraft } from "./evidence";

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
}

export interface AppMessage {
  tone: "success" | "info" | "warning" | "error";
  text: string;
  transient?: boolean;
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
  transport: import("../ports").SyncTransport;
  seedPackage?: WorkPackage;
  prepareExternalValidation?: PrepareExternalValidation;
  now?: () => string;
  technicianId?: string;
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
  registerVisit(orderId: string, input?: ActionInput): Promise<void>;
  executeCut(orderId: string, input?: ActionInput): Promise<boolean>;
  executeReconnection(orderId: string, input?: ActionInput): Promise<boolean>;
  sync(): Promise<void>;
}

interface SeedableRepository extends LocalRepository {
  savePackage(workPackage: WorkPackage): Promise<void>;
}

export function createAppStore(dependencies: AppStoreDependencies): AppStore {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const technicianId = dependencies.technicianId ?? DEMO_TECHNICIAN_ID;
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
  let syncInFlight: Promise<void> | undefined;

  const update = (change: Partial<AppState>): void => {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  };

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
      if (wasOffline && mode !== "offline" && snapshot.status === "ready") void requestSync().catch(() => undefined);
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
    async registerVisit(orderId, input = {}) {
      await ensureReady();
      const order = getAssignedOrder(orderId);
      await runWithBusy("VISIT", async () => {
        const operationId = generateOperationId("visit");
        const timestamp = now();
        const evidence = await prepareEvidence(input, order, operationId, technicianId, deviceId);
        const result = await executeOfflineVisit({
          repository: dependencies.repository,
          order,
          operationId,
          technicianId,
          deviceId,
          attemptedAction: order.status === "EJECUTADO" ? "RECONNECTION" : "CUT",
          reason: input.reason ?? "Visita de campo sin ejecución",
          exceptionReason: input.exceptionReason,
          evidence,
          fieldCapture: input.fieldCapture,
          now: timestamp,
        });
        await finishDraftIfCommitted(orderId, "VISIT", result.visit.operationId, input);
        const refreshed = await refreshAfterCommit();
        if (refreshed) update({ message: { tone: result.outcome === "duplicate" ? "info" : "success", text: "Visita guardada en el dispositivo, sin afirmar ejecución física." } });
      });
      await syncAfterLocalAction();
    },
    async executeCut(orderId, input = {}) {
      await ensureReady();
      const order = getAssignedOrder(orderId);
      const completed = await runWithBusy("CUT", async () => {
        const operationId = generateOperationId("cut");
        const timestamp = now();
        const evidence = await prepareEvidence(input, order, operationId, technicianId, deviceId);
        dependencies.prepareExternalValidation?.("CUT", order, operationId, timestamp);
        const result = await runCut({
          repository: dependencies.repository,
          authorization: dependencies.authorization,
          order,
          operationId,
          technicianId,
          deviceId,
          now: timestamp,
          evidence,
          exceptionReason: input.exceptionReason,
          fieldCapture: input.fieldCapture,
        });
        const committed = result.outcome === "executed" || result.outcome === "pending_sync" || (result.outcome === "duplicate" && result.operation.status === "CONFIRMED");
        if (committed) await finishDraftIfCommitted(orderId, "CUT", result.operation.operationId, input);
        const refreshed = await refreshAfterCommit();
        if (refreshed) update({ message: messageForCut(result, snapshot.mode) });
        return committed;
      });
      await syncAfterLocalAction();
      return completed;
    },
    async executeReconnection(orderId, input = {}) {
      await ensureReady();
      const order = getAssignedOrder(orderId);
      const completed = await runWithBusy("RECONNECTION", async () => {
        const operationId = generateOperationId("reconnection");
        const timestamp = now();
        const evidence = await prepareEvidence(input, order, operationId, technicianId, deviceId);
        dependencies.prepareExternalValidation?.("RECONNECTION", order, operationId, timestamp);
        const result = await runReconnection({
          repository: dependencies.repository,
          enablement: dependencies.enablement,
          order,
          operationId,
          technicianId,
          deviceId,
          now: timestamp,
          evidence,
          exceptionReason: input.exceptionReason,
        });
        const committed = result.outcome === "executed" || (result.outcome === "duplicate" && result.operation.status === "CONFIRMED");
        if (committed) await finishDraftIfCommitted(orderId, "RECONNECTION", result.operation.operationId, input);
        const refreshed = await refreshAfterCommit();
        if (refreshed) update({ message: messageForReconnection(result, snapshot.mode) });
        return committed;
      });
      await syncAfterLocalAction();
      return completed;
    },
    async sync() {
      return requestSync();
    },
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

  async function finishDraftIfCommitted(orderId: string, action: ActionKind, operationId: string, input: ActionInput): Promise<void> {
    const record = await dependencies.repository.getRecord(operationId);
    const items = await dependencies.repository.listSyncItems();
    const queued = items.some((item) => item.operationId === operationId && item.orderId === orderId && item.action === action);
    const evidenceExpected = Boolean(input.file || input.evidence);
    const confirmed = record?.kind === "VISIT"
      ? action === "VISIT"
      : Boolean(record && record.kind === action && record.status === "CONFIRMED" && record.physicalStatus === "CONFIRMED");
    const durableCutIntent = action === "CUT" && record?.kind === "CUT" && record.status === "INTENT_PERSISTED" && record.physicalStatus === "CLAIMED";
    if (!record || !queued || record.orderId !== orderId || record.technicianId !== technicianId || record.deviceId !== deviceId || (!confirmed && !durableCutIntent) || (evidenceExpected && !record.evidenceRefs.length) || !(await evidenceIsDurable(record))) {
      throw new Error("No pudimos verificar el guardado local. Revise pendientes antes de repetir la acción.");
    }
    // Draft cleanup is best effort after durable operation, evidence and queue verification.
    await dependencies.repository.deleteCaptureDraft(draftKey(orderId, action)).catch(() => undefined);
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
    await runWithBusy("SYNC", async () => {
      const report = await new SyncEngine(dependencies.repository, dependencies.connectivity, dependencies.transport, { now }).syncOnce();
      await refresh();
      update({ message: report.failed
        ? { tone: "warning", text: "Algunas operaciones requieren revisión; ninguna fue eliminada." }
        : { tone: "success", text: formatSyncMessage(report.synced), transient: true } });
    });
  }

  async function syncAfterLocalAction(): Promise<void> {
    if (snapshot.mode === "offline" || !snapshot.syncItems.some((item) => item.status !== "synced")) return;
    await requestSync();
  }

  return store;
}

export function formatSyncMessage(synced: number): string {
  const count = Number.isFinite(synced) ? Math.max(0, Math.trunc(synced)) : 0;
  return `${count} ${count === 1 ? "operación sincronizada" : "operaciones sincronizadas"}`;
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
    registerVisit: async () => undefined,
    executeCut: async () => false,
    executeReconnection: async () => false,
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
      (order.context?.route && order.context.route.toLocaleLowerCase().includes(query));
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

function readableError(error: unknown): string {
  if (error instanceof DomainError) {
    const messages: Record<string, string> = {
      ORDER_NOT_EXECUTED: "La orden debe estar ejecutada antes de preparar reconexión.",
      ORDER_STATUS_INVALID: "La orden no está lista para esta acción.",
      CUT_ALREADY_CLAIMED: "Esta orden ya tiene una ejecución reclamada.",
      CUT_STATUS_INVALID: "La orden necesita estado físico confirmado.",
      EVIDENCE_REQUIRED: "Adjunte JPEG/PNG preparado o marque excepción con justificación.",
      EVIDENCE_FORMAT_INVALID: "La evidencia debe ser JPEG o PNG.",
      EVIDENCE_NOT_OPTIMIZED: "La evidencia debe quedar preparada en cinco megapíxeles o menos.",
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
    };
    return messages[error.code] ?? "La operación no pudo continuar. Revise datos locales.";
  }
  return error instanceof Error ? error.message : "La operación no pudo continuar.";
}

function messageForCut(result: CutProcessResult, mode: ConnectivityMode): AppMessage {
  if (result.outcome === "pending_sync") return { tone: "info", text: "Corte guardado localmente; el servidor debe confirmarlo al sincronizar." };
  if (result.outcome === "executed") return { tone: "success", text: mode === "offline" ? "Corte guardado localmente." : "Corte registrado localmente y pendiente de sincronización." };
  if (result.outcome === "visit_recorded") return { tone: "info", text: "Visita guardada; corte bloqueado por validación externa." };
  if (result.outcome === "physical_unknown" || result.outcome === "recovery_required") return { tone: "warning", text: "Resultado incierto. Revisión humana requerida; no repetir esta acción." };
  if (result.outcome === "duplicate") return { tone: "info", text: "Operación ya registrada; no se creó duplicado." };
  return { tone: "warning", text: "Corte bloqueado por validación externa; visita conservada si correspondía." };
}

function messageForReconnection(result: ReconnectionResult, mode: ConnectivityMode): AppMessage {
  if (result.outcome === "executed") return { tone: "success", text: mode === "offline" ? "Reconexión guardada localmente." : "Reconexión registrada localmente y pendiente de sincronización." };
  if (result.outcome === "visit_recorded") return { tone: "info", text: "Visita guardada; reconexión bloqueada por habilitación externa." };
  if (result.outcome === "physical_unknown" || result.outcome === "recovery_required") return { tone: "warning", text: "Resultado incierto. Revisión humana requerida; no repetir esta acción." };
  if (result.outcome === "duplicate") return { tone: "info", text: "Operación ya registrada; no se creó duplicado." };
  return { tone: "warning", text: "Reconexión bloqueada por habilitación externa; visita conservada si correspondía." };
}
