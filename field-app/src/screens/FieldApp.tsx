import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ActionKind, AppMessage, AppStore, AppState, OrderFilter } from "../state/store";
import { selectVisibleOrders } from "../state/store";
import { downloadRouteMap, isRouteMapCached, type CacheProgress } from "../services/map-cache";
import { BrowserConnectivity } from "../adapters/browser/connectivity";
import type { ConnectivityMode, WorkOrder } from "../domain/types";
import { AppHeader, type AppHeaderRoleSwitch } from "../components/AppHeader";
import { FieldMap } from "../components/FieldMap";
import { IconAlertTriangle, IconBan, IconCheck, IconCheckCircle, IconClock, IconCrosshair, IconDatabase, IconDevice, IconDocument, IconDownload, IconExpand, IconMap, IconPin, IconRefresh, IconRoute, IconUser } from "../components/common/Icons";
import { NOTIFICATION_AUTO_DISMISS_MS, Notification, shouldAutoDismissNotification } from "../components/common/Notification";
import { SearchField } from "../components/common/SearchField";
import { PaginationControls } from "../components/common/PaginationControls";
import { AppStateCard } from "../components/common/UiState";
import { OrderDetail } from "../components/OrderDetail";
import { QueuePanel } from "../components/SyncQueue";
import { activityLabel, activityTimestamp, adjacentJourneyOrder, displayValue, fieldOrderStatusLabel, formatActivityTime, formatDebt, formatLastUpdate, hasCadastralCoordinates, isManualVisitAllowed, orderJourneyOrders, orderStatusTone, pendingCount, shortTechnicalId, sortActivityEntries, sortOrdersForNext, sortSyncItemsForDisplay } from "../utils/field-app-utils";

export { ActionCompletionDialog, cutCompletionOutcome, OrderReviewMap, orderActivityReviewPages, paginateReviewFields } from "../components/OrderDetail";
export { EvidencePicker, captureDraftCanAdvance, captureSubmitError, captureWizardSteps, loadCaptureDraftSafely, restoreEvidenceFile } from "../components/CaptureForm";
export { QueuePanel, queuePageItem, queueReviewMessage } from "../components/SyncQueue";
export { adjacentJourneyOrder, fieldOrderStatusLabel, orderJourneyOrders, sortActivityEntries, sortOrdersForNext, sortSyncItemsForDisplay } from "../utils/field-app-utils";

export interface FieldAppProps {
  store: AppStore;
  technicianId?: string;
  technicianName?: string;
  deviceId?: string;
  enableReconnection?: boolean;
  onRefreshAssigned?: () => Promise<void>;
  onLogout?: () => void;
  roleSwitch?: AppHeaderRoleSwitch;
}

type NavigationTab = "home" | "orders" | "map" | "queue";
const navigationItems: Array<{ tab: NavigationTab; label: string; icon: ReactNode }> = [
  { tab: "home", label: "Inicio", icon: <IconRoute /> },
  { tab: "orders", label: "Mis órdenes", icon: <IconDocument /> },
  { tab: "map", label: "Mapa", icon: <IconMap /> },
  { tab: "queue", label: "Pendientes", icon: <IconRefresh /> },
];

export function FieldApp({
  store,
  technicianId = "tech-camila",
  technicianName,
  deviceId = "device-rugged-01",
  enableReconnection = true,
  onRefreshAssigned,
  onLogout,
  roleSwitch,
}: FieldAppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const pending = pendingCount(state.syncItems);
  const [isProbingNetwork, setIsProbingNetwork] = useState(false);
  const [isRefreshingAssigned, setIsRefreshingAssigned] = useState(false);
  const [assignedRefreshError, setAssignedRefreshError] = useState<string>();
  const [dismissedMessage, setDismissedMessage] = useState<AppMessage>();
  const connectivityRef = useRef<BrowserConnectivity | null>(null);
  const prevModeRef = useRef<ConnectivityMode>(state.mode);

  useEffect(() => {
    setDismissedMessage(undefined);
  }, [state.message]);

  useEffect(() => {
    const message = state.message;
    if (!message) return;
    const isMobile = window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (!shouldAutoDismissNotification(message.tone, { isMobile, hasAction: pending > 0, transient: message.transient })) return;
    const timeout = window.setTimeout(() => setDismissedMessage(message), NOTIFICATION_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [state.message, pending]);

  useEffect(() => {
    void store.init();
  }, [store]);

  // Adaptador de conectividad real para el navegador
  useEffect(() => {
    if (typeof window === "undefined") return;
    const connectivity = new BrowserConnectivity();
    connectivityRef.current = connectivity;

    const unsubscribe = connectivity.subscribe((nextMode) => {
      store.setMode(nextMode);
    });

    // Sondeo inicial
    void connectivity.probe();

    return () => {
      unsubscribe();
      connectivity.stop();
      connectivityRef.current = null;
    };
  }, [store]);

  // Auto-sincronización en segundo plano al recuperar señal
  useEffect(() => {
    const wasDisconnected = prevModeRef.current === "offline" || prevModeRef.current === "weak";
    const isNowOnline = state.mode === "online";
    if (wasDisconnected && isNowOnline) {
      const hasPendingSync = state.syncItems.some((item) => item.status !== "synced");
      if (hasPendingSync && state.busyAction !== "SYNC") {
        void store.sync();
      }
    }
    prevModeRef.current = state.mode;
  }, [state.mode, state.syncItems, state.busyAction, store]);

  const handleRefreshAssigned = async (): Promise<void> => {
    if (isRefreshingAssigned) return;
    setIsRefreshingAssigned(true);
    setAssignedRefreshError(undefined);
    try {
      await syncThenRefreshAssigned(store, onRefreshAssigned ?? (() => store.refresh()));
    } catch (error) {
      setAssignedRefreshError(error instanceof Error ? error.message : "No pudimos actualizar la bandeja.");
    } finally {
      setIsRefreshingAssigned(false);
    }
  };

  const handleRetryConnection = async () => {
    if (isProbingNetwork) return;
    setIsProbingNetwork(true);
    try {
      if (connectivityRef.current) {
        const nextMode = await connectivityRef.current.checkNow();
        store.setMode(nextMode);
      } else {
        const online = typeof navigator !== "undefined" ? navigator.onLine : true;
        store.setMode(online ? "online" : "offline");
      }
      if (store.getSnapshot().mode !== "offline") {
        await syncThenRefreshAssigned(store, onRefreshAssigned ?? (() => store.refresh()));
        setAssignedRefreshError(undefined);
      } else if (store.getSnapshot().syncItems.some((item) => item.status !== "synced")) {
        setAssignedRefreshError("Sin conexión. Las operaciones pendientes siguen guardadas en este dispositivo.");
      }
    } catch (error) {
      setAssignedRefreshError(error instanceof Error ? error.message : "No pudimos completar la sincronización.");
    } finally {
      setIsProbingNetwork(false);
    }
  };

  const modeLabel = state.mode === "online" ? "Red disponible" : state.mode === "weak" ? "Señal débil" : "Sin conexión";
  const openPendingQueue = () => {
    if (state.message) setDismissedMessage(state.message);
    store.selectOrder(null);
    store.setTab("queue");
  };

  return (
    <div className="field-app">
      <AppHeader
        role="field"
        title="Jornada de campo"
        description="Órdenes asignadas, ejecución de cortes y sincronización en terreno."
        user={{ displayName: technicianName ?? technicianId, roleLabel: "Técnico" }}
        variant={state.tab === "home" ? "standard" : "minimal"}
        viewKey={state.tab}
        onLogout={onLogout}
        roleSwitch={roleSwitch ? { ...roleSwitch, disabled: roleSwitch.disabled || Boolean(state.busyAction) || isRefreshingAssigned || isProbingNetwork } : undefined}
        context={state.tab === "home" ? (
          <div className="field-header-context-card">
            <div className="field-header-context__item">
              <span className="field-header-context__icon" aria-hidden="true"><IconDevice /></span>
              <span className="field-header-context__copy">
                <span className="field-header-context__label">Dispositivo</span>
                <strong>{shortTechnicalId(deviceId)}</strong>
              </span>
            </div>
            <span className="field-header-context__divider" aria-hidden="true" />
            <div className="field-header-context__item">
              <span className="field-header-context__icon" aria-hidden="true"><IconUser /></span>
              <span className="field-header-context__copy">
                <span className="field-header-context__label">Técnico</span>
                <strong>{technicianName ?? technicianId}</strong>
              </span>
            </div>
          </div>
        ) : undefined}
        status={{
          tone: state.mode === "online" ? "positive" : state.mode === "weak" ? "warning" : "negative",
          label: modeLabel,
        }}
        menuActions={state.tab !== "home" ? [
          {
            id: "sync-and-refresh",
            label: "Enviar pendientes y actualizar",
            busyLabel: "Enviando y actualizando…",
            icon: <IconDownload />,
            busy: isRefreshingAssigned,
            onSelect: () => void handleRefreshAssigned(),
          },
          {
            id: "retry",
            label: "Reintentar envío",
            busyLabel: "Probando…",
            icon: <IconRefresh />,
            busy: isProbingNetwork,
            onSelect: () => void handleRetryConnection(),
          },
        ] : undefined}
        actions={state.tab === "home" ? <div className="header-action-row">
          <button type="button" className="header-refresh-button" onClick={() => void handleRefreshAssigned()} disabled={isRefreshingAssigned}>
            <IconDownload />
            <span>{isRefreshingAssigned ? "Enviando y actualizando…" : "Enviar pendientes y actualizar"}</span>
          </button>
          <div className="header-action-row__secondary">
            <LastUpdateDisplay
              timestamp={state.lastRefreshAt ?? state.package?.downloadedAt}
              isRefreshing={isProbingNetwork || isRefreshingAssigned}
              onRefresh={() => void handleRefreshAssigned()}
            />
            <button
              type="button"
              className={`btn-network-retry ${isProbingNetwork ? "is-probing" : ""}`}
              onClick={handleRetryConnection}
              disabled={isProbingNetwork}
              title="Reintentar envío de operaciones pendientes"
              aria-label="Reintentar envío"
            >
              <span className="retry-icon" aria-hidden="true"><IconRefresh /></span>
              <span>{isProbingNetwork ? "Probando…" : "Reintentar envío"}</span>
            </button>
          </div>
        </div> : undefined}
      />
      {state.message && dismissedMessage !== state.message ? (
        <Notification
          tone={state.message.tone}
          text={state.message.text}
          action={pending ? { label: "Ver operaciones pendientes", onClick: openPendingQueue } : undefined}
          onDismiss={() => { if (state.message) setDismissedMessage(state.message); }}
        />
      ) : null}
      {assignedRefreshError ? <Notification tone="warning" text={assignedRefreshError} onDismiss={() => setAssignedRefreshError(undefined)} /> : null}
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? (
        <ErrorState text={state.error ?? "No pudimos cargar el paquete local."} onRetry={store.init} />
      ) : null}
      {state.status === "ready" ? (
        <Workbench
          state={state}
          store={store}
          enableReconnection={enableReconnection}
          technicianName={technicianName}
          onRefreshAssigned={onRefreshAssigned ? () => void handleRefreshAssigned() : undefined}
        />
      ) : null}
    </div>
  );
}
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

function Workbench({
  state,
  store,
  enableReconnection,
  technicianName,
  onRefreshAssigned,
}: {
  state: AppState;
  store: AppStore;
  enableReconnection: boolean;
  technicianName?: string;
  onRefreshAssigned?: () => void;
}) {
  const visibleOrders = selectVisibleOrders(state);
  const selectedOrder = state.orders.find((order) => order.orderId === state.selectedOrderId);
  const [pendingAction, setPendingAction] = useState<{ orderId: string; kind: ActionKind } | null>(null);
  const [returnToJourney, setReturnToJourney] = useState(false);

  const openIncident = (orderId: string) => {
    const order = state.orders.find((candidate) => candidate.orderId === orderId);
    if (!order || !isManualVisitAllowed(order)) return;
    setPendingAction({ orderId, kind: "VISIT" });
    store.selectOrder(orderId);
  };

  const prioritizedOrders = sortOrdersForNext(state.orders);
  const navigate = (tab: "home" | "orders" | "map" | "queue") => {
    setPendingAction(null);
    setReturnToJourney(false);
    store.selectOrder(null);
    store.setTab(tab);
  };
  const content = state.tab === "orders"
    ? selectedOrder ? (
      <OrderDetail
        order={selectedOrder}
        state={state}
        store={store}
        enableReconnection={enableReconnection}
        technicianName={technicianName}
        initialAction={pendingAction?.orderId === selectedOrder.orderId ? pendingAction.kind : null}
        onBack={() => { setPendingAction(null); store.selectOrder(null); if (returnToJourney) store.setTab("home"); setReturnToJourney(false); }}
      />
    ) : (
      <OrdersPanel state={state} orders={visibleOrders} store={store} onRefreshAssigned={onRefreshAssigned} onOpenOrder={() => setReturnToJourney(false)} />
    )
    : state.tab === "map"
      ? <MapPanel state={state} store={store} />
      : state.tab === "queue"
        ? <QueuePanel state={state} store={store} />
        : <FieldHome state={state} store={store} orders={prioritizedOrders} onOpenIncident={openIncident} onReviewOrder={() => setReturnToJourney(true)} />;

  return (
    <main className="workbench">
      <DesktopNavigation activeTab={state.tab} onNavigate={navigate} pending={pendingCount(state.syncItems)} />
      {content}
      <BottomNavigation activeTab={state.tab} onNavigate={navigate} pending={pendingCount(state.syncItems)} />
    </main>
  );
}

function FieldHome({ state, store, orders, onOpenIncident, onReviewOrder }: { state: AppState; store: AppStore; orders: WorkOrder[]; onOpenIncident: (orderId: string) => void; onReviewOrder: () => void }) {
  const filteredOrders = selectVisibleOrders(state);
  const eligibleOrders = state.query.trim() || state.filter !== "ALL" ? filteredOrders : orders;
  const focusOrders = orderJourneyOrders(eligibleOrders);
  const [focusedOrderId, setFocusedOrderId] = useState<string>();
  const currentOrder = focusOrders.find((order) => order.orderId === focusedOrderId) ?? focusOrders[0];
  const currentIndex = currentOrder ? focusOrders.findIndex((order) => order.orderId === currentOrder.orderId) : -1;

  useEffect(() => {
    const nextFocusedOrderId = currentOrder?.orderId;
    if (focusedOrderId !== nextFocusedOrderId) setFocusedOrderId(nextFocusedOrderId);
  }, [currentOrder, focusedOrderId]);

  const openOrder = (orderId: string) => {
    onReviewOrder();
    store.setTab("orders");
    store.selectOrder(orderId);
  };
  const openMap = (orderId?: string) => openOrderMap(store, orderId);

  return (
    <section className="field-home" aria-label="Inicio de jornada">
      <OperationalSummary state={state} />

      {currentOrder ? (
        <CurrentOrderCard
          order={currentOrder}
          orders={orders}
          mode={state.mode}
          position={currentIndex + 1}
          total={focusOrders.length}
          onPrevious={() => setFocusedOrderId(adjacentJourneyOrder(focusOrders, currentIndex, -1)?.orderId)}
          onNext={() => setFocusedOrderId(adjacentJourneyOrder(focusOrders, currentIndex, 1)?.orderId)}
          onOpen={() => openOrder(currentOrder.orderId)}
          onShowMap={() => openMap(currentOrder.orderId)}
          onMarkIncident={() => onOpenIncident(currentOrder.orderId)}
        />
      ) : (
        <EmptyOrders hasAnyOrders={state.orders.length > 0} onRefresh={() => void store.refresh()} onShowMap={() => openMap()} />
      )}

      <HomeSecondaryCards state={state} store={store} />
    </section>
  );
}

export function openOrderMap(store: AppStore, orderId?: string): void {
  if (orderId) store.selectOrder(orderId);
  store.setTab("map");
}

function OperationalSummary({ state }: { state: AppState }) {
  const summary = [
    { label: "Por ejecutar", value: state.orders.filter((order) => order.status === "GENERADO" && order.physicalStatus === "NONE"), tone: "attention", icon: <IconClock /> },
    { label: "En revisión", value: state.orders.filter((order) => order.physicalStatus === "PHYSICAL_UNKNOWN"), tone: "review", icon: <IconDocument /> },
    { label: "Ejecutadas", value: state.orders.filter((order) => order.status === "EJECUTADO"), tone: "success", icon: <IconCheckCircle /> },
    { label: "Anuladas", value: state.orders.filter((order) => order.status === "ANULADO"), tone: "muted", icon: <IconBan /> },
    { label: "En cola", value: state.syncItems.filter((item) => item.status !== "synced"), tone: "queue", icon: <IconDatabase /> },
  ];
  return (
    <section className="operational-summary" aria-label="Resumen operativo">
      <div className="operational-summary__grid">
        {summary.map((item) => <div className={`operational-summary__item operational-summary__item--${item.tone}`} key={item.label}><span className="operational-summary__icon">{item.icon}</span><div><strong>{item.value.length}</strong><span>{item.label}</span></div></div>)}
      </div>
    </section>
  );
}

function HomeSecondaryCards({ state, store }: { state: AppState; store: AppStore }) {
  const [syncOpen, setSyncOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const pendingItems = sortSyncItemsForDisplay(state.syncItems.filter((item) => item.status !== "synced"), state.activity);
  const sortedActivity = sortActivityEntries(state.activity);
  const recentActivity = activityOpen ? sortedActivity : sortedActivity.slice(0, 3);
  return (
    <section className="home-secondary-grid desktop-sync-activity-panel" aria-label="Actividad y sincronización">
      <CollapsibleCard open={syncOpen} onToggle={() => setSyncOpen((value) => !value)} icon={<IconRefresh />} title="Cola de sincronización" meta={`${pendingItems.length} pendientes`} hint={pendingItems.length ? "Operaciones guardadas en este dispositivo." : "No hay operaciones pendientes."}>
        <p>{pendingItems.length ? "Operaciones guardadas en este dispositivo." : "No hay operaciones pendientes."}</p>
        {pendingItems.length ? <button type="button" className="home-secondary-link" onClick={() => { store.selectOrder(null); store.setTab("queue"); }}>Ver cola completa <span aria-hidden="true">→</span></button> : null}
      </CollapsibleCard>
      <CollapsibleCard open={activityOpen} onToggle={() => setActivityOpen((value) => !value)} icon={<IconClock />} title="Actividad reciente" meta={`${state.activity.length} eventos`} hint={state.activity.length ? "Últimos registros de este dispositivo." : "Sin actividad local registrada."}>
        {recentActivity.length ? <div className="home-activity-list">{recentActivity.map((entry) => <button type="button" className="home-activity-item" key={entry.record.operationId} onClick={() => { store.setTab("orders"); store.selectOrder(entry.record.orderId); }}><i /><span><strong>{activityLabel(entry.record.kind)}</strong><small>{formatActivityTime(activityTimestamp(entry.record))}</small></span></button>)}</div> : <p>Sin actividad local registrada.</p>}
        <button type="button" className="home-secondary-link" onClick={() => setActivityOpen(true)}>Ver todas <span aria-hidden="true">→</span></button>
      </CollapsibleCard>
    </section>
  );
}

function CollapsibleCard({ open, onToggle, icon, title, meta, hint, children }: { open: boolean; onToggle: () => void; icon: ReactNode; title: string; meta: string; hint: string; children: ReactNode }) {
  return (
    <section className={`collapsible-card${open ? " collapsible-card--open" : ""}`}>
      <button type="button" className="collapsible-card__summary" onClick={onToggle} aria-expanded={open}>
        <span className="collapsible-card__icon">{icon}</span><span className="collapsible-card__title"><strong>{title}</strong><small>{hint}</small><em>{meta}</em></span><span className="collapsible-card__chevron" aria-hidden="true">⌄</span>
      </button>
      {open ? <div className="collapsible-card__body">{children}</div> : null}
    </section>
  );
}

function DesktopNavigation({ activeTab, onNavigate, pending }: { activeTab: AppState["tab"]; onNavigate: (tab: NavigationTab) => void; pending: number }) {
  return <nav className="desktop-navigation" aria-label="Navegación principal de escritorio"><span className="desktop-navigation__context">Jornada técnica</span><div className="desktop-navigation__items">{navigationItems.map((item) => <button type="button" key={item.tab} className={activeTab === item.tab ? "desktop-navigation__item desktop-navigation__item--active" : "desktop-navigation__item"} onClick={() => onNavigate(item.tab)} aria-current={activeTab === item.tab ? "page" : undefined}>{item.icon}<span>{item.label}</span>{item.tab === "queue" && pending ? <i aria-label={`${pending} operaciones pendientes`} /> : null}</button>)}</div></nav>;
}

function BottomNavigation({ activeTab, onNavigate, pending }: { activeTab: AppState["tab"]; onNavigate: (tab: "home" | "orders" | "map" | "queue") => void; pending: number }) {
  return <nav className="bottom-navigation" aria-label="Navegación principal">{navigationItems.map((item) => <button type="button" key={item.tab} className={activeTab === item.tab ? "bottom-navigation__item bottom-navigation__item--active" : "bottom-navigation__item"} onClick={() => onNavigate(item.tab)} aria-current={activeTab === item.tab ? "page" : undefined}>{item.icon}<span>{item.label}</span>{item.tab === "queue" && pending ? <i aria-label={`${pending} operaciones pendientes`} /> : null}</button>)}</nav>;
}

function OrdersPanel({ state, orders, store, onRefreshAssigned, onOpenOrder }: { state: AppState; orders: WorkOrder[]; store: AppStore; onRefreshAssigned?: () => void; onOpenOrder: () => void }) {
  const [isCompactViewport, setIsCompactViewport] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const [filtersOpen, setFiltersOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 760px)").matches);
  const ordersPerPage = isCompactViewport ? 1 : 5;
  const [ordersPage, setOrdersPage] = useState(1);
  const generatedCount = state.orders.filter((order) => order.status === "GENERADO").length;
  const executedCount = state.orders.filter((order) => order.status === "EJECUTADO").length;
  const cancelledCount = state.orders.filter((order) => order.status === "ANULADO").length;
  const reviewCount = state.orders.filter((order) => order.physicalStatus === "PHYSICAL_UNKNOWN").length;
  const ordersPageCount = Math.max(1, Math.ceil(orders.length / ordersPerPage));
  const pageOrders = orders.slice((ordersPage - 1) * ordersPerPage, ordersPage * ordersPerPage);
  const firstVisibleOrder = orders.length ? (ordersPage - 1) * ordersPerPage + 1 : 0;
  const lastVisibleOrder = Math.min(ordersPage * ordersPerPage, orders.length);
  const filters: Array<{ value: OrderFilter; label: string; count?: number }> = [
    { value: "ALL", label: "Todas", count: state.orders.length },
    { value: "GENERADO", label: "Por ejecutar", count: generatedCount },
    { value: "EJECUTADO", label: "Ejecutadas", count: executedCount },
    { value: "ANULADO", label: "Anuladas", count: cancelledCount },
    { value: "REVIEW", label: "Revisión", count: reviewCount },
  ];
  useEffect(() => { setOrdersPage(1); }, [state.query, state.filter]);
  useEffect(() => {
    let previousCompactViewport = window.matchMedia("(max-width: 760px)").matches;
    const updateViewport = () => {
      const compactViewport = window.matchMedia("(max-width: 760px)").matches;
      setIsCompactViewport(compactViewport);
      if (compactViewport !== previousCompactViewport) setFiltersOpen(!compactViewport);
      previousCompactViewport = compactViewport;
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  useEffect(() => { setOrdersPage((page) => Math.min(page, ordersPageCount)); }, [orders.length, ordersPageCount]);
  const selectedFilter = filters.find((filter) => filter.value === state.filter)?.label ?? "Todas";
  return (
    <section className="orders-panel orders-tray" aria-label="Mis órdenes">
      <div className="orders-tray__heading"><div><span className="eyebrow">BANDEJA ASIGNADA</span><h2>Mis órdenes</h2><p>Todas tus órdenes asignadas para hoy.</p></div><span className="orders-tray__count">{orders.length}</span></div>
      <OrderFilters state={state} store={store} filters={filters} compactViewport={isCompactViewport} filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} selectedFilter={selectedFilter} />
      <div className="order-cards-list">
        {pageOrders.map((order) => <OrderCard key={order.orderId} order={order} selected={state.selectedOrderId === order.orderId} onSelect={() => { onOpenOrder(); store.selectOrder(order.orderId); }} />)}
        {!pageOrders.length ? <AppStateCard layout="inline" tone="empty" className="order-list-empty" title="No encontramos órdenes" description="No hay órdenes que coincidan con búsqueda y filtros." /> : null}
      </div>
      <div className="order-pagination">
        <span>Mostrando {firstVisibleOrder}-{lastVisibleOrder} de {orders.length} órdenes</span>
        <PaginationControls className="order-pagination__controls" label="Paginación de órdenes" page={ordersPage} totalPages={ordersPageCount} onPrevious={() => setOrdersPage((page) => Math.max(1, page - 1))} onNext={() => setOrdersPage((page) => Math.min(ordersPageCount, page + 1))} />
      </div>
      {!orders.length ? <button type="button" className="primary-action" onClick={onRefreshAssigned ?? (() => void store.refresh())}>Actualizar bandeja</button> : null}
    </section>
  );
}

function MapPanel({ state, store }: { state: AppState; store: AppStore }) {
  const [isMapCachedState, setIsMapCachedState] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<CacheProgress | null>(null);
  const [isDownloadingMap, setIsDownloadingMap] = useState(false);
  const [mapDownloadError, setMapDownloadError] = useState<string>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const selectedOrderId = state.selectedOrderId ?? sortOrdersForNext(state.orders)[0]?.orderId ?? null;
  const hasMapCoordinates = state.orders.some((order) => hasCadastralCoordinates(order.context));
  useEffect(() => { let active = true; void isRouteMapCached(state.orders).then((cached) => { if (active) setIsMapCachedState(cached); }); return () => { active = false; }; }, [state.orders]);
  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIsFullscreen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [isFullscreen]);
  const handleDownloadMap = async () => {
    setIsDownloadingMap(true);
    setMapDownloadError(undefined);
    try { await downloadRouteMap(state.orders, setDownloadProgress); setIsMapCachedState(true); }
    catch (error) { setMapDownloadError(error instanceof Error ? error.message : "No pudimos descargar el mapa para trabajo offline."); }
    finally { setIsDownloadingMap(false); setDownloadProgress(null); }
  };
  return <section className="map-page" aria-label="Mapa de órdenes"><div className="map-page__heading"><div><span className="eyebrow">RUTA DE CAMPO</span><h2>Mapa</h2><p>Ubica tus suministros y abre una ficha desde el mapa.</p></div><span className="map-page__count">{state.orders.length} órdenes</span></div><div className="map-page__surface"><FieldMap orders={state.orders} selectedOrderId={selectedOrderId} onSelectOrder={(orderId) => store.selectOrder(orderId)} mode={state.mode} isFullscreen={isFullscreen} onExpandMap={() => setIsFullscreen(true)} onCloseFullscreen={() => setIsFullscreen(false)} /></div><div className="map-page__tools"><div className="map-page__download">{!isMapCachedState ? <button type="button" className="map-download-link" disabled={isDownloadingMap || !hasMapCoordinates} aria-busy={isDownloadingMap} onClick={() => void handleDownloadMap()}><IconDownload />{isDownloadingMap ? `Descargando zona (${downloadProgress?.percent ?? 0}%)…` : hasMapCoordinates ? "Descargar zona offline" : "No hay coordenadas para descargar"}</button> : <span className="map-cached-tag"><IconCheck /> Mapa descargado</span>}<span className="map-page__download-hint">{isMapCachedState ? "Disponible sin conexión en este dispositivo." : "Guarda esta zona antes de salir a terreno."}</span></div>{mapDownloadError ? <span className="map-page__error" role="alert">{mapDownloadError}</span> : null}</div></section>;
}

export function CompactNetworkStatus({ mode }: { mode: ConnectivityMode }) {
  const label = mode === "offline" ? "Sin conexión" : mode === "weak" ? "Señal débil" : "Red disponible";
  return <span className={`compact-network-status compact-network-status--${mode}`} role="status">
    <span className={`network-dot network-dot--${mode}`} aria-hidden="true" />{label}
  </span>;
}

function OrderFilters({ state, store, filters, compactViewport, filtersOpen, onFiltersOpenChange, selectedFilter }: { state: AppState; store: AppStore; filters: Array<{ value: OrderFilter; label: string; count?: number }>; compactViewport: boolean; filtersOpen: boolean; onFiltersOpenChange: (open: boolean) => void; selectedFilter: string }) {
  return (
    <div className="order-filters">
      <SearchField id="order-search" label="Buscar órdenes" value={state.query} onChange={(value) => store.setQuery(value)} onClear={() => store.setQuery("")} placeholder="Buscar por cuenta, medidor, cliente, ruta o correlativo" />
      <details className={`order-filter-disclosure ${compactViewport ? "order-filter-disclosure--compact" : ""}`} open={filtersOpen} onToggle={(event) => onFiltersOpenChange(event.currentTarget.open)}>
        <summary aria-label={`Filtros de órdenes. Filtro activo: ${selectedFilter}`} aria-controls="order-filter-options" aria-expanded={filtersOpen}>
          <span>Filtros</span><span className="order-filter-disclosure__current">{selectedFilter}</span>
        </summary>
        <div className="filter-row" id="order-filter-options" role="group" aria-label="Filtrar órdenes">
          {filters.map((filter) => {
            const isActive = state.filter === filter.value;
            return <button key={filter.value} type="button" aria-label={`${filter.label}${filter.count === undefined ? "" : `: ${filter.count}`}`} aria-pressed={isActive} className={isActive ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => { store.setFilter(filter.value); onFiltersOpenChange(false); }}><span>{filter.label}</span>{filter.count !== undefined ? <span className="chip-count">{filter.count}</span> : null}</button>;
          })}
        </div>
      </details>
    </div>
  );
}
function CurrentOrderCard({ order, orders, mode, position, total, onPrevious, onNext, onOpen, onShowMap, onMarkIncident }: { order: WorkOrder; orders: WorkOrder[]; mode: ConnectivityMode; position: number; total: number; onPrevious: () => void; onNext: () => void; onOpen: () => void; onShowMap: () => void; onMarkIncident: () => void }) {
  const context = order.context;
  const customerStatus = context?.supplyStatus === "A" ? "Activo" : context?.supplyStatus;
  const canCut = order.status === "GENERADO" && order.physicalStatus === "NONE";
  return (
    <article className="current-order-card">
      <div className="current-order-card__header">
        <div className="current-order-card__heading">
          <span className="current-order-card__icon"><IconDocument /></span>
          <strong>Orden actual</strong>
        </div>
        <div className="current-order-card__navigation" aria-label="Navegación de órdenes">
          <button type="button" aria-label="Orden anterior" onClick={onPrevious} disabled={position <= 1}>‹</button>
          <span>{position} de {total}</span>
          <button type="button" aria-label="Orden siguiente" onClick={onNext} disabled={position >= total}>›</button>
        </div>
      </div>
      <div className="current-order-card__identity">
        <div>
          <h2>Cuenta {displayValue(context?.accountId || order.accountId)} · Medidor {displayValue(context?.meterId)}</h2>
          <p>{displayValue(context?.customerName || order.orderId)}</p>
          <span className="current-order-card__technical">CUC: {displayValue(order.cuc ? shortTechnicalId(order.cuc) : undefined)}</span>
        </div>
        <span className={`status-badge order-status-label status-badge--${orderStatusTone(order)}`}>{fieldOrderStatusLabel(order)}</span>
      </div>
      <div className="current-order-card__data-grid">
        <OrderDataRow icon={<IconPin />} label="Dirección" value={context?.address} emphasis />
        <OrderDataRow icon={<IconDatabase />} label="Deuda" value={formatDebt(context?.debtCents)} emphasis="debt" meta={context?.monthsPending === undefined ? "Dato no disponible" : `${context.monthsPending} facturas`} />
        <OrderDataRow icon={<IconRoute />} label="Ruta" value={context?.route} emphasis />
        <OrderDataRow icon={<IconUser />} label="Estado del cliente" value={customerStatus} status={customerStatus === "Activo" ? "ready" : undefined} />
        <OrderDataRow icon={<IconDocument />} label="Referencia" value={context?.references} />
      </div>
      <div className="current-order-card__readiness">
        <OrderDataRow icon={<IconRoute />} label="Distancia aproximada" value={undefined} />
        <OrderDataRow icon={<IconCrosshair />} label="GPS" value={undefined} />
      </div>
      <div className="current-order-card__map">
        <FieldMap orders={orders} selectedOrderId={order.orderId} onSelectOrder={() => onShowMap()} mode={mode} compact />
        <button type="button" className="current-order-card__map-action" onClick={onShowMap}><IconExpand /> Abrir mapa</button>
      </div>
      <div className="current-order-card__actions">
        <button type="button" className="primary-action" onClick={onOpen}><IconDocument /> Abrir orden<span aria-hidden="true">→</span></button>
        {canCut ? <button type="button" className="tertiary-action" onClick={onMarkIncident}><IconAlertTriangle /> Marcar incidencia</button> : null}
      </div>
    </article>
  );
}

function OrderDataRow({ icon, label, value, emphasis, status, meta }: { icon?: ReactNode; label: string; value?: string | number; emphasis?: boolean | "debt"; status?: "ready"; meta?: string }) {
  const renderedValue = value === undefined || value === "" ? "Dato no disponible" : value;
  return <div className="current-order-card__data-row">{icon ? <span className="current-order-card__data-icon">{icon}</span> : null}<div><span>{label}</span>{status === "ready" ? <strong className="current-order-card__data-status">{renderedValue}</strong> : <strong className={emphasis ? `current-order-card__data-value--${emphasis === "debt" ? "debt" : "primary"}` : undefined}>{renderedValue}</strong>}{meta ? <small>{meta}</small> : null}</div></div>;
}

function OrderCard({ order, selected, onSelect }: {
  order: WorkOrder;
  selected: boolean;
  onSelect: () => void;
}) {
  const isCancelled = order.status === "ANULADO";
  const account = order.context?.accountId || order.accountId || "S/C";
  const meter = order.context?.meterId || "S/M";
  const customer = order.context?.customerName || order.orderId;
  const address = order.context?.address || "Dirección no especificada";
  const route = order.context?.route || "Ruta —";
  const debt = formatDebt(order.context?.debtCents) ?? "Dato no disponible";
  const monthsPending = order.context?.monthsPending;
  const cuc = order.cuc;

  return (
    <article
      className={`order-card order-list-row order-item ${selected ? "order-card--selected" : ""} ${
        isCancelled ? "order-card--cancelled" : ""
      }`}
      onClick={onSelect}
    >
      <div className="order-card__header">
        <div className="order-card__identifiers">
          <span className="order-card__order-id">Orden {shortTechnicalId(order.orderId)}</span>
          {cuc ? <span className="order-card__cuc">CUC {shortTechnicalId(cuc)}</span> : null}
        </div>
        <div className="order-card__badges">
          <span className={`status-badge order-status-label status-badge--${orderStatusTone(order)}`}>
            {fieldOrderStatusLabel(order)}
          </span>
        </div>
      </div>

      <div className="order-card__body">
        <h3 className="order-card__customer">Cuenta {account} · Medidor {meter}</h3>
        <p className="order-card__supply">{customer}</p>
        <p className="order-card__address">
          <IconPin className="card-address-icon" /> {address}
        </p>
        <p className="order-card__route">{order.context?.locality || "Localidad no disponible"} · Ruta {route}</p>
      </div>

      <div className="order-card__footer">
        <div className="order-card__debt-info">
          <span className="order-card__debt-label">Deuda</span>
          <strong className="order-card__debt-val">{debt}</strong>
          <span className="order-card__months">{monthsPending === undefined ? "Dato no disponible" : `${monthsPending} factura${monthsPending === 1 ? "" : "s"}`}</span>
        </div>

        <div className="order-card__actions">
          <button type="button" className="order-card__action-btn" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
            Abrir
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyOrders({ hasAnyOrders, onRefresh, onShowMap }: { hasAnyOrders: boolean; onRefresh: () => void; onShowMap: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><IconPin /></div>
      <AppStateCard layout="inline" tone="empty" title={hasAnyOrders ? "No encontramos órdenes" : "No tienes órdenes asignadas en este momento"} description={hasAnyOrders ? "Prueba cambiar búsqueda o filtro." : "Actualiza la bandeja o espera una nueva asignación."} />
      <div className="empty-state__actions">
        <button type="button" className="primary-action" onClick={onRefresh}>Actualizar bandeja</button>
      </div>
    </div>
  );
}

function LoadingState() {
  return <AppStateCard as="main" className="state-card" tone="loading" title="Cargando paquete local" description="Recuperando órdenes asignadas y cola persistida." />;
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => Promise<void> }) {
  return <AppStateCard as="main" className="state-card state-card--error" tone="error" title="No pudimos abrir jornada" description={text} action={{ label: "Reintentar", onClick: () => void onRetry() }} />;
}

function LastUpdateDisplay({
  timestamp,
  isRefreshing,
  onRefresh,
}: {
  timestamp?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => (typeof Date !== "undefined" ? Date.now() : 0));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const { relative, exact } = formatLastUpdate(timestamp, nowMs);

  return (
    <div
      className="last-update"
      onClick={onRefresh}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRefresh();
        }
      }}
      title={exact ? `Actualizado a las ${exact}. Clic para actualizar jornada.` : "Clic para actualizar jornada."}
    >
      <span className="last-update-label">Última actualización</span>
      <br />
      <strong>
        {isRefreshing ? "Actualizando…" : relative}
        {exact && !isRefreshing ? <span className="last-update-exact"> ({exact})</span> : null}
      </strong>
    </div>
  );
}
