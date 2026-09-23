import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ActivityEntry, AppMessage, AppStore, ActionInput, AppState, OrderFilter } from "../app/index";
import type { CaptureDraftContent } from "../ports/repository";
import { selectVisibleOrders } from "../app/index";
import { downloadRouteMap, isRouteMapCached, type CacheProgress } from "../app/map-cache";
import { BrowserConnectivity } from "../adapters/browser/connectivity";
import type { ConnectivityMode, CutType, FieldCapture, WorkOrder } from "../domain";
import { FieldMap } from "./FieldMap";
import { IconAlertTriangle, IconBan, IconCheck, IconCheckCircle, IconClock, IconCrosshair, IconDatabase, IconDocument, IconDownload, IconExpand, IconMap, IconPhone, IconPin, IconRefresh, IconRoute, IconScissors, IconSearch, IconUser } from "./Icons";
import { Notification } from "./Notification";

export interface FieldAppProps {
  store: AppStore;
  technicianId?: string;
  technicianName?: string;
  deviceId?: string;
  enableReconnection?: boolean;
  onRefreshAssigned?: () => Promise<void>;
  onLogout?: () => void;
}

type NavigationTab = "home" | "orders" | "map" | "queue";
type OrderReviewView = "review" | "details" | "map" | "activity";

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
}: FieldAppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [isProbingNetwork, setIsProbingNetwork] = useState(false);
  const [isRefreshingAssigned, setIsRefreshingAssigned] = useState(false);
  const [assignedRefreshError, setAssignedRefreshError] = useState<string>();
  const [dismissedMessage, setDismissedMessage] = useState<AppMessage>();
  const connectivityRef = useRef<BrowserConnectivity | null>(null);
  const prevModeRef = useRef<ConnectivityMode>(state.mode);

  useEffect(() => {
    const message = state.message;
    setDismissedMessage(undefined);
    if (!message?.transient) return;
    const timeout = window.setTimeout(() => setDismissedMessage(message), 4000);
    return () => window.clearTimeout(timeout);
  }, [state.message]);

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

  const pending = pendingCount(state.syncItems);
  const openPendingQueue = () => {
    if (state.message) setDismissedMessage(state.message);
    store.selectOrder(null);
    store.setTab("queue");
  };

  return (
    <div className="field-app">
      <Header
        state={state}
        isProbingNetwork={isProbingNetwork}
        onRetryConnection={handleRetryConnection}
        isRefreshingAssigned={isRefreshingAssigned}
        onRefreshAssigned={() => void handleRefreshAssigned()}
        technicianId={technicianId}
        technicianName={technicianName}
        deviceId={deviceId}
        onLogout={onLogout}
      />
      {state.message && !(state.message.transient && dismissedMessage === state.message) ? (
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

function Header({
  state,
  isProbingNetwork,
  onRetryConnection,
  isRefreshingAssigned,
  onRefreshAssigned,
  technicianId,
  technicianName,
  deviceId,
  onLogout,
}: {
  state: AppState;
  isProbingNetwork: boolean;
  onRetryConnection: () => void;
  isRefreshingAssigned: boolean;
  onRefreshAssigned?: () => void;
  technicianId: string;
  technicianName?: string;
  deviceId: string;
  onLogout?: () => void;
}) {
  const modeLabel =
    state.mode === "online" ? "Conectada" : state.mode === "weak" ? "Señal débil" : "Sin conexión";

  return (
    <header className="app-header">
      <div className="identity-block">
        <div className="identity-brand-row">
          <div className="field-brand"><strong>SEPSA</strong><span>CAMPO</span></div>
          {onLogout ? <button type="button" className="header-profile-button" onClick={onLogout} aria-label="Cerrar sesión"><IconUser /></button> : null}
        </div>
        <h1>Jornada de campo</h1>
        <p className="identity">Órdenes asignadas, ejecución de cortes y sincronización en terreno.</p>
        <div className="header-context">
          <span>Técnico:</span>
          <strong>{technicianName ?? technicianId}</strong>
           <span className="header-context__separator" aria-hidden="true">|</span>
           <span className="header-device">Dispositivo: {shortTechnicalId(deviceId)}</span>
        </div>
      </div>
      <div className="header-meta">
        <div className="header-top-actions">
          <span className={`network-status-badge network-status-badge--${state.mode}`}>
            <span className={`network-dot network-dot--${state.mode}`} aria-hidden="true" />
            <span className="network-status-text">{modeLabel}</span>
          </span>
          <LastUpdateDisplay
            timestamp={state.lastRefreshAt ?? state.package?.downloadedAt}
            isRefreshing={isProbingNetwork || isRefreshingAssigned}
            onRefresh={onRefreshAssigned ?? onRetryConnection}
          />
          {onLogout ? <button type="button" className="logout-button" onClick={onLogout}>Cerrar sesión</button> : null}
        </div>
        <div className="header-bottom-actions">
          <button
            type="button"
            className={`btn-network-retry ${isProbingNetwork ? "is-probing" : ""}`}
            onClick={onRetryConnection}
            disabled={isProbingNetwork}
            title="Reintentar envío de operaciones pendientes"
            aria-label="Reintentar envío"
          >
            <span className="retry-icon" aria-hidden="true"><IconRefresh /></span>
            <span>{isProbingNetwork ? "Probando…" : "Reintentar envío"}</span>
          </button>
          <button type="button" className="header-refresh-button" onClick={onRefreshAssigned} disabled={isRefreshingAssigned}>
            <IconDownload />
            <span>{isRefreshingAssigned ? "Enviando y actualizando…" : "Enviar pendientes y actualizar"}</span>
          </button>
        </div>
      </div>
    </header>
  );
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
  const openMap = (orderId?: string) => {
    if (orderId) store.selectOrder(null);
    store.setTab("map");
  };

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
  const pendingItems = state.syncItems.filter((item) => item.status !== "synced");
  const recentActivity = activityOpen ? state.activity : state.activity.slice(0, 3);
  return (
    <section className="home-secondary-grid desktop-sync-activity-panel" aria-label="Actividad y sincronización">
      <CollapsibleCard open={syncOpen} onToggle={() => setSyncOpen((value) => !value)} icon={<IconRefresh />} title="Cola de sincronización" meta={`${pendingItems.length} pendientes`} hint={pendingItems.length ? "Operaciones guardadas en este dispositivo." : "No hay operaciones pendientes."}>
        <p>{pendingItems.length ? "Operaciones guardadas en este dispositivo." : "No hay operaciones pendientes."}</p>
        {pendingItems.length ? <button type="button" className="home-secondary-link" onClick={() => { store.selectOrder(null); store.setTab("queue"); }}>Ver cola completa <span aria-hidden="true">→</span></button> : null}
      </CollapsibleCard>
      <CollapsibleCard open={activityOpen} onToggle={() => setActivityOpen((value) => !value)} icon={<IconClock />} title="Actividad reciente" meta={`${state.activity.length} eventos`} hint={state.activity.length ? "Últimos registros de este dispositivo." : "Sin actividad local registrada."}>
        {recentActivity.length ? <div className="home-activity-list">{recentActivity.map((entry) => <button type="button" className="home-activity-item" key={entry.record.operationId} onClick={() => { store.setTab("orders"); store.selectOrder(entry.record.orderId); }}><i /><span><strong>{activityLabel(entry.record.kind)}</strong><small>{formatActivityTime(entry.record.recordedAt)}</small></span></button>)}</div> : <p>Sin actividad local registrada.</p>}
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
  return <section className="orders-panel orders-tray" aria-label="Mis órdenes"><div className="orders-tray__heading"><div><span className="eyebrow">BANDEJA ASIGNADA</span><h2>Mis órdenes</h2><p>Todas tus órdenes asignadas para hoy.</p></div><span className="orders-tray__count">{orders.length}</span></div><OrderFilters state={state} store={store} filters={filters} compactViewport={isCompactViewport} filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} selectedFilter={selectedFilter} /><div className="order-cards-list">{pageOrders.map((order) => <OrderCard key={order.orderId} order={order} selected={state.selectedOrderId === order.orderId} onSelect={() => { onOpenOrder(); store.selectOrder(order.orderId); }} />)}{!pageOrders.length ? <p className="order-list-empty">No hay órdenes que coincidan con búsqueda y filtros.</p> : null}</div><div className="order-pagination" aria-label="Paginación de órdenes"><span>Mostrando {firstVisibleOrder}-{lastVisibleOrder} de {orders.length} órdenes</span><div className="order-pagination__controls"><button type="button" onClick={() => setOrdersPage((page) => Math.max(1, page - 1))} disabled={ordersPage <= 1}>Anterior</button><span>Página {ordersPage} de {ordersPageCount}</span><button type="button" onClick={() => setOrdersPage((page) => Math.min(ordersPageCount, page + 1))} disabled={ordersPage >= ordersPageCount}>Siguiente</button></div></div>{!orders.length ? <button type="button" className="primary-action" onClick={onRefreshAssigned ?? (() => void store.refresh())}>Actualizar bandeja</button> : null}</section>;
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

function DesktopRightRail({
  state,
  orders,
  selectedOrderId,
  store,
  onExpandMap,
  onCloseFullscreen,
  isMapFullscreen,
}: {
  state: AppState;
  orders: WorkOrder[];
  selectedOrderId: string | null;
  store: AppStore;
  onExpandMap: () => void;
  onCloseFullscreen: () => void;
  isMapFullscreen: boolean;
}) {
  const pendingItems = state.syncItems.filter((item) => item.status !== "synced");
  const recentItems = pendingItems.slice(0, 3);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const recentActivity = showAllActivity ? state.activity : state.activity.slice(0, 5);

  return (
    <aside className="desktop-right-rail" aria-label="Resumen operativo">
      <section className={`desktop-rail-panel desktop-map-panel${isMapFullscreen ? " desktop-map-panel--fullscreen" : ""}`} aria-label="Mapa de órdenes">
        <div className="desktop-rail-heading">
          <div className="desktop-map-title">
            <span className="desktop-rail-icon" aria-hidden="true"><IconMap /></span>
            <h2>Mapa de órdenes</h2>
          </div>
          <button type="button" className="desktop-map-expand" onClick={onExpandMap} aria-label="Expandir mapa a pantalla completa">
            <IconExpand /> <span>Expandir mapa</span>
          </button>
        </div>
        <FieldMap
          orders={orders}
          selectedOrderId={selectedOrderId}
          onSelectOrder={(orderId) => store.selectOrder(orderId)}
          mode={state.mode}
          compact
          isFullscreen={isMapFullscreen}
          onExpandMap={onExpandMap}
          onCloseFullscreen={onCloseFullscreen}
        />
      </section>

      <section className="desktop-rail-panel desktop-sync-activity-panel" aria-label="Sincronización y actividad local">
        <section className="desktop-rail-section desktop-sync-summary" aria-labelledby="desktop-sync-title">
          <div className="desktop-rail-heading">
            <div className="desktop-rail-title">
              <span className="desktop-rail-icon" aria-hidden="true"><IconRefresh /></span>
              <h2 id="desktop-sync-title">Cola de sincronización</h2>
            </div>
            <span className="desktop-rail-pending">{pendingItems.length} pendientes</span>
          </div>
          {recentItems.length ? (
            <div className="desktop-sync-list">
              {recentItems.map((item) => (
                <div className="desktop-sync-item" key={item.operationId}>
                  <div>
                    <strong>{queueActionLabel(item.action)}</strong>
                    <span>{state.orders.find((order) => order.orderId === item.orderId)?.context?.customerName ?? "Orden no disponible"}</span>
                  </div>
                  <span className={`queue-status queue-status--${item.status}`}>{syncStatusLabel(item.status)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="desktop-empty-state">
              <span className="desktop-empty-state__icon" aria-hidden="true"><IconDatabase /></span>
              <strong>No hay operaciones pendientes.</strong>
              <span>Todas las operaciones están sincronizadas.</span>
            </div>
          )}
          <button type="button" className="desktop-rail-link" onClick={() => { store.selectOrder(null); store.setTab("queue"); }}>Ver cola completa <span>→</span></button>
        </section>

        <section className="desktop-rail-section desktop-activity-summary" aria-labelledby="desktop-activity-title">
          <div className="desktop-rail-heading">
            <div className="desktop-rail-title">
              <span className="desktop-rail-icon" aria-hidden="true"><IconDatabase /></span>
              <h2 id="desktop-activity-title">Actividad reciente</h2>
            </div>
            <button type="button" className="desktop-activity-link" onClick={() => setShowAllActivity((visible) => !visible)} aria-expanded={showAllActivity}>
              {showAllActivity ? "Ver menos" : "Ver todas"}
            </button>
          </div>
          {recentActivity.length ? (
            <div className="desktop-activity-list">
              {recentActivity.map((entry) => (
                <button type="button" className="desktop-activity-item" key={entry.record.operationId} onClick={() => { store.setTab("orders"); store.selectOrder(entry.record.orderId); }}>
                  <span className="desktop-activity-dot" aria-hidden="true" />
                  <span>
                    <strong>{activityLabel(entry.record.kind)}</strong>
                    <small>{formatActivityTime(entry.record.recordedAt)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : <p className="desktop-rail-empty">Sin actividad local registrada.</p>}
        </section>
      </section>
    </aside>
  );
}

function MetricCard({ value, label, tone, icon }: { value: number; label: string; tone: string; icon: ReactNode }) {
  return <div className={`metric-card metric-card--${tone}`}><span className="metric-card__icon">{icon}</span><span className="metric-card__content"><strong>{value}</strong><span>{label}</span></span></div>;
}

function OrderFilters({ state, store, filters, compactViewport, filtersOpen, onFiltersOpenChange, selectedFilter }: { state: AppState; store: AppStore; filters: Array<{ value: OrderFilter; label: string; count?: number }>; compactViewport: boolean; filtersOpen: boolean; onFiltersOpenChange: (open: boolean) => void; selectedFilter: string }) {
  return (
    <div className="order-filters">
      <div className="search-bar-wrap">
        <label className="search-field" htmlFor="order-search">
          <IconSearch className="search-field-icon" />
          <input id="order-search" type="search" value={state.query} onChange={(event) => store.setQuery(event.target.value)} placeholder="Buscar por cuenta, medidor o cliente" />
        </label>
        {state.query ? <button type="button" className="search-clear-btn" onClick={() => store.setQuery("")} aria-label="Limpiar búsqueda">×</button> : null}
      </div>
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
          <h2>{displayValue(context?.customerName || order.orderId)}</h2>
          <p>Cuenta {displayValue(context?.accountId || order.accountId)} · Medidor {displayValue(context?.meterId)}</p>
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
        <h3 className="order-card__customer">{customer}</h3>
        <p className="order-card__supply">Cuenta {account} · Medidor {meter}</p>
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

function OrderDetail({
  order,
  state,
  store,
  enableReconnection,
  technicianName,
  initialAction,
  onBack,
}: {
  order: WorkOrder;
  state: AppState;
  store: AppStore;
  enableReconnection: boolean;
  technicianName?: string;
  initialAction?: ActionKind | null;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<ActionKind | null>(initialAction === "VISIT" && !isManualVisitAllowed(order) ? null : initialAction ?? null);
  const [mobileView, setMobileView] = useState<OrderReviewView>("review");
  const [kardexIndex, setKardexIndex] = useState(0);
  const [detailsPageIndex, setDetailsPageIndex] = useState(0);
  const [activityPageIndex, setActivityPageIndex] = useState(0);
  const isCancelled = order.status === "ANULADO";
  const canCut = order.status === "GENERADO" && order.physicalStatus === "NONE";
  const canRegisterVisit = isManualVisitAllowed(order);
  const locationHref = order.context && hasCadastralCoordinates(order.context)
    ? `https://www.google.com/maps/search/?api=1&query=${order.context.cadastralLatitude},${order.context.cadastralLongitude}`
    : undefined;

  useEffect(() => {
    setMobileView("review");
    setKardexIndex(0);
    setDetailsPageIndex(0);
    setActivityPageIndex(0);
  }, [order.orderId]);

  useEffect(() => {
    if (initialAction && (initialAction !== "VISIT" || canRegisterVisit)) setDraft(initialAction);
  }, [canRegisterVisit, initialAction]);

  return (
    <section className="detail-panel panel detail-panel--fullscreen" aria-label={`Detalle de ${order.orderId}`}>
      <MobileOrderReview
        order={order}
        mode={state.mode}
        entries={state.activity.filter((entry) => entry.record.orderId === order.orderId)}
        view={mobileView}
        onViewChange={setMobileView}
        onBack={onBack}
        canCut={canCut}
        canRegisterVisit={canRegisterVisit}
        canReconnect={enableReconnection && order.status === "EJECUTADO" && order.physicalStatus === "CONFIRMED"}
        busy={Boolean(state.busyAction)}
        onCut={() => setDraft("CUT")}
        onVisit={() => setDraft("VISIT")}
        onReconnect={() => setDraft("RECONNECTION")}
        kardexIndex={kardexIndex}
        onKardexIndexChange={setKardexIndex}
        detailsPageIndex={detailsPageIndex}
        onDetailsPageIndexChange={setDetailsPageIndex}
        activityPageIndex={activityPageIndex}
        onActivityPageIndexChange={setActivityPageIndex}
        hidden={Boolean(draft)}
      />
      <div className="order-detail-legacy">
      {/* Barra superior de retorno */}
      <div className="detail-navigation-bar">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Volver a la bandeja de órdenes
        </button>
      </div>

      {/* Banner de orden anulada si corresponde */}
      {isCancelled ? (
        <div className="alert-banner alert-banner-warning" role="alert">
          <strong>ORDEN ANULADA:</strong> Anulado ya que se registró la regularización de la mora.
          {order.cancellation?.detectedAt ? (
            <div className="cancellation-timestamp">
              Fecha de regularización: {formatDate(order.cancellation.detectedAt)}
            </div>
          ) : null}
        </div>
      ) : null}

      <header className="order-detail-header">
        <div className="order-detail-header__identity">
          <span className="eyebrow">ORDEN ACTUAL</span>
          <h2>{order.context?.customerName || order.orderId}</h2>
          <p>Cuenta / suministro {order.context?.accountId || order.accountId || "Cuenta no disponible"} · Medidor {order.context?.meterId || "Medidor no disponible"}</p>
        </div>
        <div className="order-detail-header__status">
          <span className={`status-badge order-status-label status-badge--${orderStatusTone(order)}`}>
            {orderStatusLabel(order.status)}
          </span>
          <div className="order-detail-identifiers">
            <span className="technical-id">Orden {shortTechnicalId(order.orderId)}</span>
            {order.cuc ? <span className="technical-id">CUC: {shortTechnicalId(order.cuc)}</span> : null}
          </div>
        </div>
      </header>

      {order.physicalStatus !== "NONE" ? (
        <div className="order-detail-physical-status">
          <span>Estado físico</span>
          <strong>{physicalStatusLabel(order.physicalStatus)}</strong>
          {order.physicalStatus === "PHYSICAL_UNKNOWN" ? <small>Revisión humana requerida. No repetir acción.</small> : null}
        </div>
      ) : null}

      {order.physicalStatus === "PHYSICAL_UNKNOWN" ? (
        <div className="review-callout" role="alert">
          <strong>Resultado incierto</strong>
          <span>Espere conciliación operativa. No hay acción de repetición disponible.</span>
        </div>
      ) : null}

      {order.context ? (
        <OperationalContext context={order.context} />
      ) : (
        <div className="context-missing">Contexto operativo no disponible en este paquete.</div>
      )}

      <ActivityPanel entries={state.activity.filter((entry) => entry.record.orderId === order.orderId)} />

      <div className="order-detail-actions">
        {canCut ? (
          <button className="primary-action" aria-label="Preparar corte" disabled={Boolean(state.busyAction)} onClick={() => setDraft("CUT")}>
            <IconScissors />
            Registrar corte
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
        <div className="order-detail-actions__secondary">
          {canRegisterVisit ? (
            <button className={canCut ? "secondary-action" : "primary-action"} disabled={Boolean(state.busyAction)} onClick={() => setDraft("VISIT")}>
              Registrar visita
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
          {locationHref ? (
            <a className="secondary-action" href={locationHref} target="_blank" rel="noreferrer">
              <IconMap />
              Ver ubicación
            </a>
          ) : (
            <button type="button" className="secondary-action" disabled>
              <IconMap />
              Ver ubicación
            </button>
          )}
          {enableReconnection && order.status === "EJECUTADO" && order.physicalStatus === "CONFIRMED" ? (
            <button
              className="secondary-action"
              disabled={Boolean(state.busyAction)}
              onClick={() => setDraft("RECONNECTION")}
            >
              Preparar reconexión <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      </div>
      </div>

      {draft ? (
        <ActionForm
          kind={draft}
          order={order}
          store={store}
          technicianName={technicianName}
          busy={state.busyAction === draft}
          blocked={order.physicalStatus === "PHYSICAL_UNKNOWN" || order.status === "ANULADO"}
          onCancel={() => setDraft(null)}
          onSubmit={async (input) => {
            const completed = draft === "VISIT"
              ? await store.registerVisit(order.orderId, input).then(() => true)
              : draft === "CUT"
                ? await store.executeCut(order.orderId, input)
                : await store.executeReconnection(order.orderId, input);
            if (completed) setDraft(null);
            return completed;
          }}
        />
      ) : null}
    </section>
  );
}

function MobileOrderReview({
  order, mode, entries, view, onViewChange, onBack, canCut, canRegisterVisit, canReconnect, busy,
  onCut, onVisit, onReconnect, kardexIndex, onKardexIndexChange, detailsPageIndex, onDetailsPageIndexChange,
  activityPageIndex, onActivityPageIndexChange, hidden,
}: {
  order: WorkOrder;
  mode: ConnectivityMode;
  entries: ActivityEntry[];
  view: OrderReviewView;
  onViewChange: (view: OrderReviewView) => void;
  onBack: () => void;
  canCut: boolean;
  canRegisterVisit: boolean;
  canReconnect: boolean;
  busy: boolean;
  onCut: () => void;
  onVisit: () => void;
  onReconnect: () => void;
  kardexIndex: number;
  onKardexIndexChange: (index: number) => void;
  detailsPageIndex: number;
  onDetailsPageIndexChange: (index: number) => void;
  activityPageIndex: number;
  onActivityPageIndexChange: (index: number) => void;
  hidden: boolean;
}) {
  const context = order.context;
  const kardex = context?.kardex ?? [];
  const currentKardex = kardex[kardexIndex];
  const activityPages = orderActivityReviewPages(entries);
  const currentActivityPage = activityPages[activityPageIndex];
  const status = fieldOrderStatusLabel(order);
  const debt = formatDebt(context?.debtCents);
  const account = context?.accountId || order.accountId;
  const meter = context?.meterId;
  const detailFields = context ? [
    { label: "Referencia", value: context.references },
    { label: "Ruta", value: context.route },
    { label: "Circuito", value: context.circuit },
    { label: "Localidad", value: context.locality },
    { label: "Estado del suministro", value: context.supplyStatus === "A" ? "Activo" : context.supplyStatus },
    { label: "Fuente y actualización", value: `${context.source === "SIMULATED" ? "Simulada" : "Provisional"} · ${formatDate(context.updatedAt)}` },
    { label: "Tarifa", value: context.tariff },
    { label: "Coordenadas", value: hasCadastralCoordinates(context) ? `${context.cadastralLatitude!.toFixed(6)}, ${context.cadastralLongitude!.toFixed(6)}` : undefined },
  ] : [];
  const detailPages = paginateReviewFields(detailFields);
  const detailsPageCount = detailPages.length;
  const showKardex = detailsPageIndex === detailsPageCount;
  const detailPageLabel = showKardex ? "Kardex" : `Datos ${detailsPageIndex + 1} de ${detailsPageCount}`;

  return (
    <section className="order-review-mobile" aria-label="Revisión de orden" hidden={hidden}>
      <div className="order-review-toolbar">
        <button type="button" className="order-review-back" onClick={onBack}>← Volver</button>
        <span>Orden {shortTechnicalId(order.orderId)}</span>
      </div>
      <nav className="order-review-navigation" aria-label="Vistas de la orden">
        {([
          ["review", "Resumen"], ["details", "Datos"], ["map", "Mapa"], ["activity", "Actividad"],
        ] as const).filter(([target]) => target !== "activity" || entries.length > 0).map(([target, label]) => (
          <button key={target} type="button" aria-pressed={view === target} onClick={() => onViewChange(target)}>
            {label}{target === "activity" && entries.length ? ` ${entries.length}` : ""}
          </button>
        ))}
      </nav>

      {view === "review" ? (
        <div className="order-review-screen order-review-screen--summary" aria-label="Resumen prioritario de la orden">
          <header className="order-review-identity">
            <h2>{displayValue(context?.customerName)}</h2>
            <p>Cuenta {displayValue(account)} · Medidor {displayValue(meter)}</p>
          </header>
          {order.status === "ANULADO" ? (
            <div className="order-review-alert order-review-alert--cancelled" role="alert">
              <strong>Corte bloqueado</strong>
              <span>{order.cancellation?.detectedAt ? `Regularización registrada ${formatDate(order.cancellation.detectedAt)}. No registrar corte ni visita.` : "No registrar corte ni visita."}</span>
            </div>
          ) : null}
          {order.physicalStatus === "PHYSICAL_UNKNOWN" ? (
            <div className="order-review-alert order-review-alert--unknown" role="alert">
              <strong>No repetir acción</strong>
              <span>Revisión humana requerida.</span>
            </div>
          ) : null}
          <div className="order-review-facts">
            <div className="order-review-fact order-review-fact--address"><span>Dirección</span><strong>{displayValue(context?.address)}</strong></div>
            <div className="order-review-fact"><span>Deuda</span><strong className="order-review-debt">{displayValue(debt)}</strong><small>{context?.monthsPending === undefined ? "Dato no disponible" : `${context.monthsPending} facturas pendientes`}</small></div>
            <div className="order-review-fact"><span>Estado</span><strong>{status}</strong>{order.physicalStatus !== "NONE" ? <small>Físico: {physicalStatusLabel(order.physicalStatus)}</small> : null}</div>
          </div>
          <div className="order-review-actions">
            {canCut ? <button type="button" className="primary-action" disabled={busy} onClick={onCut}><IconScissors />Registrar corte</button> : null}
            {canReconnect ? <button type="button" className="primary-action" disabled={busy} onClick={onReconnect}>Preparar reconexión</button> : null}
            {canRegisterVisit && canCut ? <button type="button" className="order-review-secondary-action" disabled={busy} onClick={onVisit}>Registrar visita</button> : null}
            {!canCut && !canReconnect && !canRegisterVisit ? <p className="order-review-no-action">Sin acciones disponibles para este estado.</p> : null}
          </div>
        </div>
      ) : null}

      {view === "details" ? (
        <section className="order-review-screen order-review-screen--details" aria-label="Datos secundarios de la orden">
          <h2>Datos del suministro</h2>
          {context ? <>
            {!showKardex ? <div className="order-review-detail-grid">
              {detailPages[detailsPageIndex]?.map((field) => <ReviewData key={field.label} label={field.label} value={field.value} />)}
            </div> : null}
            {showKardex ? <section className="order-review-kardex" aria-label="Kardex de deuda">
              <div><strong>Kardex</strong><span>{kardex.length ? `${kardexIndex + 1} de ${kardex.length}` : "No disponible"}</span></div>
              {currentKardex ? <p>{currentKardex.period} · {formatDebt(currentKardex.amountCents) ?? "Dato no disponible"} · {currentKardex.status === "PENDING" ? "Pendiente" : "Pagado"} · {currentKardex.daysLate ?? "Dato no disponible"} días mora</p> : <p>Historial no disponible en paquete local.</p>}
              {kardex.length > 1 ? <div className="order-review-pager"><button type="button" disabled={kardexIndex <= 0} onClick={() => onKardexIndexChange(kardexIndex - 1)}>Anterior</button><button type="button" disabled={kardexIndex >= kardex.length - 1} onClick={() => onKardexIndexChange(kardexIndex + 1)}>Siguiente</button></div> : null}
            </section> : null}
            <div className="order-review-pager" aria-label="Páginas de datos">
              <button type="button" disabled={detailsPageIndex <= 0} onClick={() => onDetailsPageIndexChange(detailsPageIndex - 1)}>Anterior</button>
              <span>{detailPageLabel}</span>
              <button type="button" disabled={detailsPageIndex >= detailsPageCount} onClick={() => onDetailsPageIndexChange(detailsPageIndex + 1)}>Siguiente</button>
            </div>
          </> : <p className="order-review-no-action">Datos operativos no disponibles en este paquete local.</p>}
        </section>
      ) : null}

      {view === "map" ? <OrderReviewMap order={order} mode={mode} onViewChange={onViewChange} /> : null}

      {view === "activity" && activityPages.length > 0 ? (
        <section className="order-review-screen order-review-screen--activity" aria-label="Actividad de la orden">
          <article className="order-review-activity-page" aria-live="polite">
            <h3>{currentActivityPage?.title}</h3>
            <p>{currentActivityPage?.text}</p>
          </article>
          {activityPages.length > 1 ? <div className="order-review-pager"><button type="button" disabled={activityPageIndex <= 0} onClick={() => onActivityPageIndexChange(activityPageIndex - 1)}>Anterior</button><span>{activityPageIndex + 1} de {activityPages.length}</span><button type="button" disabled={activityPageIndex >= activityPages.length - 1} onClick={() => onActivityPageIndexChange(activityPageIndex + 1)}>Siguiente</button></div> : null}
        </section>
      ) : null}
    </section>
  );
}

export function OrderReviewMap({
  order,
  mode,
  onViewChange,
}: {
  order: WorkOrder;
  mode: ConnectivityMode;
  onViewChange: (view: OrderReviewView) => void;
}) {
  const context = order.context;
  const hasCoordinates = hasCadastralCoordinates(context);

  return (
    <section className="order-review-screen order-review-screen--map" aria-label="Mapa de ubicación">
      <div className="order-review-map-address"><strong>{displayValue(context?.address)}</strong><span>{displayValue(context?.references)}</span></div>
      {hasCoordinates ? (
        <FieldMap orders={[order]} selectedOrderId={order.orderId} onSelectOrder={() => onViewChange("details")} mode={mode} />
      ) : (
        <div className="field-map-container field-map-container--empty" aria-label="Ubicación de esta orden no disponible">
          <div className="field-map-empty" role="status">
            <IconMap />
            <strong>Ubicación de esta orden no disponible</strong>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewData({ label, value }: { label: string; value?: string }) {
  return <div className="order-review-fact"><span>{label}</span><strong>{displayValue(value)}</strong></div>;
}

export function paginateReviewFields(fields: readonly { label: string; value?: string }[], pageSize = 4): Array<Array<{ label: string; value?: string }>> {
  const pages: Array<Array<{ label: string; value?: string }>> = [];
  let currentPage: Array<{ label: string; value?: string }> = [];
  const flush = () => {
    if (!currentPage.length) return;
    pages.push(currentPage);
    currentPage = [];
  };
  for (const field of fields) {
    if ((field.value?.length ?? 0) > 120) {
      flush();
      const chunks = splitReviewText(field.value ?? "");
      chunks.forEach((value, index) => pages.push([{ label: `${field.label} · parte ${index + 1} de ${chunks.length}`, value }]));
      continue;
    }
    currentPage.push(field);
    if (currentPage.length === pageSize) flush();
  }
  flush();
  return pages;
}

interface OrderActivityReviewPage {
  title: string;
  text: string;
}

export function orderActivityReviewPages(entries: readonly ActivityEntry[]): OrderActivityReviewPage[] {
  return entries.flatMap((entry) => {
    const pages: OrderActivityReviewPage[] = [];
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

function splitReviewText(value: string, maxLength = 120): string[] {
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

function OperationalContext({ context }: { context: NonNullable<WorkOrder["context"]> }) {
  return (
    <section className="order-detail-context" aria-label="Cliente y suministro">
      <div className="order-detail-section-heading">
        <div>
          <span className="eyebrow">DATOS PARA TRABAJAR</span>
          <h3>Cliente y suministro</h3>
        </div>
        <span className="context-source">Actualizado {formatDate(context.updatedAt)} · {context.source === "SIMULATED" ? "Fuente simulada" : "Fuente provisional"}</span>
      </div>
      <div className="detail-location"><IconPin /><div><span>Dirección</span><strong>{context.address || "Dato no disponible"}</strong><small>{context.references || "Sin referencia adicional"}</small></div></div>
      <div className="detail-debt">
        <div><span>Deuda de referencia</span><strong>{formatDebt(context.debtCents) ?? "Dato no disponible"}</strong></div>
        <span>{context.monthsPending} facturas pendientes</span>
      </div>
      <div className="context-grid">
        <div className="data-point"><span>Cuenta / suministro</span><strong>{context.accountId || "Dato no disponible"} · {context.supplyId || "Dato no disponible"}</strong></div>
        <div className="data-point"><span>Medidor</span><strong>{context.meterId || "Dato no disponible"}{context.meterBrand ? ` · ${context.meterBrand}` : ""}</strong></div>
        <div className="data-point"><span>Ruta / circuito</span><strong>{context.route || "Dato no disponible"} · {context.circuit || "Dato no disponible"}</strong></div>
        <div className="data-point"><span>Localidad / estado</span><strong>{context.locality || "Dato no disponible"} · {context.supplyStatus || "Dato no disponible"}</strong></div>
      </div>
      <section className="order-detail-kardex" aria-label="Kardex y deuda">
        <div className="order-detail-section-heading order-detail-section-heading--compact">
          <h3>Kardex y deuda</h3>
        </div>
        {context.kardex.length ? (
          <div className="kardex-table-wrap">
            <table className="kardex-table">
              <thead><tr><th scope="col">Periodo</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col">Días mora</th></tr></thead>
              <tbody>
                {context.kardex.map((entry) => (
                  <tr key={entry.entryId}>
                    <td>{entry.period}</td>
                    <td>{formatDebt(entry.amountCents) ?? "Dato no disponible"}</td>
                    <td><span className={`kardex-status kardex-status--${entry.status.toLowerCase()}`}>{entry.status === "PENDING" ? "Pendiente" : "Pagado"}</span></td>
                    <td>{entry.daysLate ?? "Dato no disponible"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="kardex-empty">Historial no disponible en paquete local.</p>}
      </section>
      <details className="order-detail-technical">
        <summary>Datos técnicos</summary>
        <div className="order-detail-technical__grid">
          <div className="data-point"><span>Tarifa</span><strong>{context.tariff || "Dato no disponible"}</strong></div>
          <div className="data-point"><span>Coordenadas</span><strong>{context.cadastralLatitude !== undefined && context.cadastralLongitude !== undefined ? `${context.cadastralLatitude.toFixed(6)}, ${context.cadastralLongitude.toFixed(6)}` : "No disponibles"}</strong></div>
        </div>
      </details>
    </section>
  );
}

function ActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="order-detail-local-state" aria-label="Estado local">
      <div className="order-detail-local-state__heading">
        <h3>Estado local</h3>
      </div>
      {entries.length ? (
        <div className="activity-entry-list">
          {entries.map((entry) => (
            <article className="activity-entry" key={entry.record.operationId}>
              <div className="activity-entry__top">
                <strong>{activityLabel(entry.record.kind)}</strong>
                <span>{syncStatusLabel(entry.record.syncStatus)}</span>
              </div>
              <p>
                {formatDate(entry.record.recordedAt)} · {activityDetail(entry.record)}
              </p>
              {entry.evidence.length ? (
                <div className="evidence-list">
                  {entry.evidence.map((evidence) => (
                    <div className="evidence-meta" key={evidence.evidenceId}>
                      <strong>
                        {evidence.mimeType === "image/jpeg" ? "JPEG" : "PNG"} · {evidence.width} × {evidence.height}
                      </strong>
                      <span>Guardada localmente · SHA-256 {shortHash(evidence.contentHash)}</span>
                    </div>
                  ))}
                </div>
              ) : activityException(entry.record) ? (
                <div className="exception-meta">Excepción: {activityException(entry.record)}</div>
              ) : null}
            </article>
          ))}
        </div>
      ) : <p className="order-detail-local-state__empty">Sin actividad local registrada.</p>}
    </section>
  );
}

type ActionKind = "VISIT" | "CUT" | "RECONNECTION";
export type CaptureWizardStep = "reading" | "cutSettings" | "gps" | "gpsException" | "evidence" | "evidenceException" | "review";
export type CaptureDraftLoadResult = { status: "ready"; content: CaptureDraftContent } | { status: "error" };

export function captureWizardSteps(kind: ActionKind, gpsException: boolean, photoException: boolean): CaptureWizardStep[] {
  return (kind === "CUT"
    ? ["reading", "cutSettings", "gps", ...(gpsException ? ["gpsException"] : []), "evidence", ...(photoException ? ["evidenceException"] : []), "review"]
    : ["evidence", ...(photoException ? ["evidenceException"] : []), "review"]) as CaptureWizardStep[];
}

export async function loadCaptureDraftSafely(load: () => Promise<CaptureDraftContent | undefined>): Promise<CaptureDraftLoadResult> {
  try { return { status: "ready", content: await load() ?? {} }; }
  catch { return { status: "error" }; }
}

export function captureDraftCanAdvance(status: CaptureDraftLoadResult["status"] | "loading"): boolean {
  return status === "ready";
}

export function captureSubmitError(error: unknown): { message: string; verificationUncertain: boolean } {
  const verificationUncertain = error instanceof Error && error.message.includes("No pudimos verificar el guardado local");
  return {
    verificationUncertain,
    message: verificationUncertain
      ? "No pudimos confirmar si la operación quedó guardada en este dispositivo. Revisa las operaciones pendientes antes de reintentar."
      : "No pudimos guardar la operación. Revisa el estado de la orden y las operaciones pendientes antes de reintentar.",
  };
}

export function EvidencePicker({ file, onSelect, onInvalid }: { file?: File; onSelect: (file: File) => void; onInvalid: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="file-field">
      <span>Archivo de evidencia</span>
      <input
        ref={input}
        className="file-field__input"
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          if (selected.type === "image/jpeg" || selected.type === "image/png") onSelect(selected);
          else onInvalid();
        }}
      />
      <button type="button" className="secondary-action file-field__choose" aria-label="Elegir foto de evidencia" onClick={() => input.current?.click()}>
        Elegir foto
      </button>
      <small aria-live="polite">{file?.name ?? "JPEG o PNG preparado"}</small>
    </div>
  );
}

function ActionForm({
  kind,
  order,
  store,
  technicianName,
  busy,
  blocked,
  onCancel,
  onSubmit,
}: {
  kind: ActionKind;
  order: WorkOrder;
  store: AppStore;
  technicianName?: string;
  busy: boolean;
  blocked: boolean;
  onCancel: () => void;
  onSubmit: (input: ActionInput) => Promise<boolean>;
}) {
  const [content, setContent] = useState<CaptureDraftContent>({});
  const contentRef = useRef<CaptureDraftContent>({});
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const [step, setStep] = useState<CaptureWizardStep>(kind === "CUT" ? "reading" : "evidence");
  const [draftLoadStatus, setDraftLoadStatus] = useState<CaptureDraftLoadResult["status"] | "loading">("loading");
  const [formError, setFormError] = useState("");
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationUncertain, setVerificationUncertain] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const gpsException = content.gpsExceptionReason !== undefined;
  const photoException = content.exceptionReason !== undefined;
  const steps = captureWizardSteps(kind, gpsException, photoException);
  const activeStep = steps.includes(step) ? step : "evidence";
  const stepIndex = steps.indexOf(activeStep);
  const file = content.evidence?.[0] ? restoreEvidenceFile(content.evidence[0]) : undefined;
  const loading = !captureDraftCanAdvance(draftLoadStatus);
  const loadDraftRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    let active = true;
    const loadDraft = async () => {
      setDraftLoadStatus("loading");
      setFormError("");
      const result = await loadCaptureDraftSafely(() => store.loadCaptureDraft(order.orderId, kind));
      if (!active) return;
      if (result.status === "error") {
        setDraftLoadStatus("error");
        return;
      }
      const restored = result.content;
      contentRef.current = restored;
      setContent(restored);
      setDraftLoadStatus("ready");
    };
    loadDraftRef.current = loadDraft;
    void loadDraft();
    return () => { active = false; };
  }, [kind, order.orderId, store]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--capture-viewport-height", `${height}px`);
      setKeyboardOpen(height < window.innerHeight - 120);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.documentElement.style.removeProperty("--capture-viewport-height");
    };
  }, []);

  function persist(next: CaptureDraftContent): Promise<void> {
    contentRef.current = next;
    setContent(next);
    const save = saveChain.current.then(() => store.saveCaptureDraft(order.orderId, kind, next));
    saveChain.current = save.catch(() => undefined);
    void save.then(() => setFormError(""), () => setFormError("No pudimos guardar el borrador en este dispositivo. Reintente."));
    return save;
  }

  function change(patch: Partial<CaptureDraftContent>): void {
    void persist({ ...contentRef.current, ...patch }).catch(() => undefined);
  }

  function validate(current: CaptureWizardStep, draft: CaptureDraftContent): string | undefined {
    if (current === "reading" && (draft.reading?.value === undefined || !Number.isFinite(draft.reading.value) || draft.reading.value < 0)) return "Ingrese lectura final válida del medidor.";
    if (current === "gps" && !draft.location?.latitude && draft.location?.latitude !== 0 && draft.gpsExceptionReason === undefined) return "Capture GPS o registre excepción de coordenadas.";
    if (current === "gpsException" && !draft.gpsExceptionReason?.trim()) return "Justifique excepción de coordenadas.";
    if (current === "evidence" && !draft.evidence?.[0] && draft.exceptionReason === undefined) return "Adjunte JPEG/PNG o registre excepción.";
    if (current === "evidenceException" && !draft.exceptionReason?.trim()) return "Escriba una justificación para la excepción.";
    return undefined;
  }

  async function advance() {
    if (!captureDraftCanAdvance(draftLoadStatus)) return;
    const problem = validate(activeStep, contentRef.current);
    if (problem) return setFormError(problem);
    try {
      await persist(contentRef.current);
      setStep(steps[stepIndex + 1]);
    } catch { /* persist sets actionable error */ }
  }

  async function submit() {
    if (!captureDraftCanAdvance(draftLoadStatus)) return;
    const draft = contentRef.current;
    for (const required of steps.slice(0, -1)) {
      const problem = validate(required, draft);
      if (problem) return setFormError(problem);
    }
    setSubmitting(true);
    try {
      await persist(draft);
      const fieldCapture: FieldCapture | undefined = kind === "CUT" ? {
        reading: { value: draft.reading!.value!, unit: "kWh", meterId: order.context?.meterId ?? "", recordedAt: new Date().toISOString(), status: "CAPTURED" },
        location: gpsException
          ? { recordedAt: new Date().toISOString(), status: "BYPASSED", exceptionReason: `saltar_control_coordenadas: ${draft.gpsExceptionReason}` }
          : draft.location as FieldCapture["location"],
        cutType: draft.cutType ?? "RED",
        nearbyMeters: draft.nearbyMeters ?? false,
      } : undefined;
      const completed = await onSubmit({
        file: photoException ? undefined : file,
        exceptionReason: photoException ? `saltar_control_fotos: ${draft.exceptionReason}` : undefined,
        gpsExceptionReason: gpsException ? `saltar_control_coordenadas: ${draft.gpsExceptionReason}` : undefined,
        fieldCapture,
        reason: kind === "VISIT" ? "Visita de campo sin ejecución" : `Intento de ${actionLabel(kind).toLocaleLowerCase()}`,
      });
      if (!completed) setFormError("Esta acción no concluyó. Revise el estado de la orden y la cola local.");
    } catch (error) {
      const failure = captureSubmitError(error);
      if (failure.verificationUncertain) setVerificationUncertain(true);
      setFormError(failure.message);
    } finally { setSubmitting(false); }
  }

  function captureLocation() {
    if (!navigator.geolocation) return setFormError("Este dispositivo no ofrece GPS; registre excepción controlada.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      change({ location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, recordedAt: new Date().toISOString(), status: "CAPTURED" }, gpsExceptionReason: undefined });
      setLocating(false);
    }, () => { setLocating(false); setFormError("No pudimos capturar GPS. Reintente o registre excepción controlada."); });
  }

  const title: Record<CaptureWizardStep, string> = { reading: "Lectura", cutSettings: "Datos del corte", gps: "Ubicación GPS", gpsException: "Excepción GPS", evidence: "Evidencia", evidenceException: "Excepción de foto", review: "Revisar y confirmar" };
  return (
    <section className={`capture-wizard${keyboardOpen ? " capture-wizard--keyboard" : ""}`} aria-label={`Captura de ${actionLabel(kind).toLocaleLowerCase()}`}>
      <header className="capture-wizard__header">
        <button type="button" className="capture-wizard__back" onClick={() => stepIndex ? setStep(steps[stepIndex - 1]) : onCancel()} aria-label="Volver">← Volver</button>
        <span>{stepIndex + 1} de {steps.length}</span>
      </header>
      <div className="capture-wizard__identity"><strong>{order.context?.customerName || "Cliente no disponible"}</strong><span>Medidor {order.context?.meterId || "no disponible"} · {technicianName ?? order.assignedTechnicianId}</span></div>
      <div className="capture-wizard__body">
        <h3>{title[activeStep]}</h3>
        {draftLoadStatus === "loading" ? <p role="status">Abriendo borrador local…</p> : null}
        {draftLoadStatus === "error" ? <div className="capture-wizard__load-error" role="alert"><p>No pudimos abrir el borrador local. Reintente antes de continuar.</p><button type="button" className="secondary-action" onClick={() => void loadDraftRef.current()}>Reintentar carga del borrador</button></div> : null}
        {!loading && activeStep === "reading" ? <>
          <label className="text-field"><span>Lectura final del medidor (kWh)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={content.reading?.value ?? ""} onChange={(event) => change({ reading: event.target.value === "" ? {} : { value: Number(event.target.value) } })} /></label>
        </> : null}
        {!loading && activeStep === "cutSettings" ? <>
          <label className="text-field"><span>Tipo de corte</span><select value={content.cutType ?? "RED"} onChange={(event) => change({ cutType: event.target.value as CutType })}><option value="RED">Red</option><option value="MEDIDOR">Medidor</option><option value="BARRAS">Barras</option><option value="PROTECCION">Protección</option><option value="ACOMETIDA">Acometida</option><option value="FUSIBLES">Fusibles</option></select></label>
          <label className="checkbox-field"><input type="checkbox" checked={content.nearbyMeters ?? false} onChange={(event) => change({ nearbyMeters: event.target.checked })} /><span>Verifiqué medidores cercanos</span></label>
        </> : null}
        {!loading && activeStep === "gps" ? <>
          <p>{content.location?.status === "CAPTURED" ? `${content.location.latitude?.toFixed(6)}, ${content.location.longitude?.toFixed(6)} · precisión ${Math.round(content.location.accuracyMeters ?? 0)} m` : "Coordenadas no capturadas"}</p>
          <button type="button" className="secondary-action" disabled={locating} onClick={captureLocation}>{locating ? "Capturando…" : "Capturar GPS"}</button>
          <label className="checkbox-field"><input type="checkbox" checked={gpsException} onChange={(event) => change(event.target.checked ? { location: undefined, gpsExceptionReason: "" } : { gpsExceptionReason: undefined })} /><span>No puedo capturar coordenadas</span></label>
        </> : null}
        {!loading && activeStep === "gpsException" ? <label className="text-field"><span>Justificación de coordenadas</span><textarea rows={2} value={content.gpsExceptionReason ?? ""} onChange={(event) => change({ gpsExceptionReason: event.target.value })} /></label> : null}
        {!loading && activeStep === "evidence" ? <>
          <EvidencePicker file={file} onSelect={(selected) => change({ evidence: [selected], exceptionReason: undefined })} onInvalid={() => setFormError("La evidencia debe ser JPEG o PNG.")} />
          <label className="checkbox-field"><input type="checkbox" checked={photoException} onChange={(event) => change(event.target.checked ? { evidence: [], exceptionReason: "" } : { exceptionReason: undefined })} /><span>No puedo adjuntar evidencia</span></label>
        </> : null}
        {!loading && activeStep === "evidenceException" ? <label className="text-field"><span>Justificación obligatoria</span><textarea rows={2} value={content.exceptionReason ?? ""} onChange={(event) => change({ exceptionReason: event.target.value })} /></label> : null}
        {!loading && activeStep === "review" ? <div className="capture-wizard__review">
          {kind === "CUT" ? <><p>Lectura: {content.reading?.value ?? "No disponible"} kWh · {content.cutType ?? "RED"}</p><p>GPS: {gpsException ? "Excepción justificada" : content.location?.status === "CAPTURED" ? "Capturado" : "No disponible"}</p></> : null}
          <p>Evidencia: {photoException ? "Excepción justificada" : file?.name ?? "No disponible"}</p>
          {kind === "CUT" ? <p>El corte requiere autorización online concluyente y vigente. Sin ella, queda bloqueado.</p> : <p>El resultado se guarda primero en este dispositivo.</p>}
        </div> : null}
      </div>
      {formError ? <p className="form-error capture-wizard__error" role="alert">{formError}</p> : null}
      <footer className="capture-wizard__footer"><button type="button" className="primary-action" disabled={loading || submitting || busy || blocked || verificationUncertain} onClick={() => void (activeStep === "review" ? submit() : advance())}>{submitting || busy ? "Guardando…" : activeStep === "review" ? kind === "CUT" ? "Confirmar corte" : kind === "VISIT" ? "Guardar visita" : "Confirmar reconexión" : "Continuar"}</button></footer>
    </section>
  );
}

export function restoreEvidenceFile(value: File | Blob): File {
  if (value instanceof File) return value;
  const extension = value.type === "image/png" ? "png" : "jpg";
  return new File([value], `evidencia-recuperada.${extension}`, { type: value.type });
}

function QueuePanel({ state, store }: { state: AppState; store: AppStore }) {
  const items = [...state.syncItems].sort(
    (left, right) => Number(right.status !== "synced") - Number(left.status !== "synced")
  );
  return (
    <section className="queue-panel panel" aria-label="Cola de sincronización">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">TRAZABILIDAD LOCAL</div>
          <h2>Cola de sincronización</h2>
        </div>
        <div className="queue-panel__actions">
          <button type="button" className="toolbar-action" onClick={() => store.setTab("orders")}>Volver a mis órdenes</button>
          <button className="sync-button" disabled={!isUsable(state.mode) || state.busyAction === "SYNC"} onClick={() => void store.sync()}>
            {state.busyAction === "SYNC" ? "Enviando pendientes…" : "Enviar operaciones pendientes"}
          </button>
        </div>
      </div>
      <p className="queue-intro">Los registros permanecen en este dispositivo hasta recibir confirmación válida.</p>
      {items.length ? (
        <div className="queue-list">
          {items.map((item) => (
            <QueueItem key={item.operationId} item={item} order={state.orders.find((order) => order.orderId === item.orderId)} onRetry={() => void store.sync()} onViewOrder={(orderId) => { store.setTab("orders"); store.selectOrder(orderId); }} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Cola despejada</strong>
          <span>No hay operaciones locales para mostrar.</span>
        </div>
      )}
    </section>
  );
}

function QueueItem({ item, order, onRetry, onViewOrder }: { item: import("../ports").SyncItem; order?: WorkOrder; onRetry: () => void; onViewOrder: (orderId: string) => void }) {
  const manualReview = item.manualReview || item.uncertain;
  return (
    <article className="queue-item">
      <div className="queue-item__header">
        <div><strong>{queueActionLabel(item.action)}</strong><span className="queue-item__customer">{order?.context?.customerName || `Orden ${shortTechnicalId(item.orderId ?? "sin orden")}`}</span></div>
        <span className={`queue-status queue-status--${item.status}`}>{syncStatusLabel(item.status)}</span>
      </div>
      <div className="queue-item__meta">
        <span>{formatDate(item.updatedAt)}</span>
        <span>{item.attempts} intento(s)</span>
        <span className="technical-id">Operación {shortTechnicalId(item.operationId)}</span>
      </div>
      {item.errorCode ? (
        <p className="queue-error">
          {manualReview ? "Requiere revisión humana. " : "Último aviso: "}
          {item.errorCode}
        </p>
      ) : null}
      {manualReview ? <p className="queue-review">Resultado incierto: no reenviar automáticamente.</p> : null}
      <div className="queue-item__actions">
        {item.status !== "synced" && !manualReview ? <button type="button" className="queue-item__retry" onClick={onRetry}>Reintentar</button> : null}
        {item.orderId ? <button type="button" className="queue-item__detail" onClick={() => onViewOrder(item.orderId ?? "")}>Ver detalle</button> : null}
      </div>
    </article>
  );
}

function EmptyOrders({ hasAnyOrders, onRefresh, onShowMap }: { hasAnyOrders: boolean; onRefresh: () => void; onShowMap: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><IconPin /></div>
      <strong>{hasAnyOrders ? "No encontramos órdenes" : "No tienes órdenes asignadas en este momento"}</strong>
      <span>{hasAnyOrders ? "Prueba cambiar búsqueda o filtro." : "Actualiza la bandeja o espera una nueva asignación."}</span>
      <div className="empty-state__actions">
        <button type="button" className="primary-action" onClick={onRefresh}>Actualizar bandeja</button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="state-card">
      <div className="loading-mark" />
      <h2>Cargando paquete local</h2>
      <p>Recuperando órdenes asignadas y cola persistida.</p>
    </main>
  );
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => Promise<void> }) {
  return (
    <main className="state-card state-card--error">
      <h2>No pudimos abrir jornada</h2>
      <p>{text}</p>
      <button className="primary-action" onClick={() => void onRetry()}>
        Reintentar
      </button>
    </main>
  );
}

function actionLabel(action: ActionKind): string {
  return action === "VISIT" ? "Visita" : action === "CUT" ? "Corte" : "Reconexión";
}
function queueActionLabel(action: import("../ports").SyncItem["action"]): string {
  return action === "CUT" ? "Corte ejecutado" : action === "VISIT" ? "Observación de campo" : "Reconexión";
}
function activityLabel(kind: import("../ports").StoredRecord["kind"]): string {
  return kind === "VISIT" ? "Visita sin ejecución" : kind === "CUT" ? "Corte" : "Reconexión";
}
function activityDetail(record: import("../ports").StoredRecord): string {
  return "reason" in record
    ? record.reason
    : record.status === "CONFIRMED"
    ? "Resultado confirmado localmente"
    : record.status === "PHYSICAL_UNKNOWN"
    ? "Resultado incierto"
    : "Intento registrado";
}
function activityException(record: import("../ports").StoredRecord): string | undefined {
  return record.exceptionReason;
}
function shortHash(hash?: string): string {
  return hash ? `${hash.slice(0, 10)}…` : "disponible";
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
function orderPriority(order: WorkOrder): number {
  if (order.status === "GENERADO" && order.physicalStatus === "NONE") return 0;
  if (order.physicalStatus === "PHYSICAL_UNKNOWN") return 1;
  if (order.status === "EJECUTADO" || order.status === "RECONEXIÓN") return 2;
  return 3;
}
function hasCadastralCoordinates(context?: WorkOrder["context"]): boolean {
  return typeof context?.cadastralLatitude === "number"
    && Number.isFinite(context.cadastralLatitude)
    && typeof context.cadastralLongitude === "number"
    && Number.isFinite(context.cadastralLongitude);
}
function displayValue(value?: string | number): string | number {
  return value === undefined || value === "" ? "Dato no disponible" : value;
}
function formatDebt(cents?: number): string | undefined {
  return cents === undefined ? undefined : `Bs ${(cents / 100).toFixed(2)}`;
}
function orderStatusLabel(status: WorkOrder["status"]): string {
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
function physicalStatusLabel(status: WorkOrder["physicalStatus"]): string {
  return status === "NONE"
    ? "Sin ejecución"
    : status === "CLAIMED"
    ? "Reclamado"
    : status === "CONFIRMED"
    ? "Confirmado"
    : "Resultado incierto";
}
function orderStatusTone(order: WorkOrder): string {
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
function syncStatusLabel(status: import("../domain").SyncStatus): string {
  return status === "pending"
    ? "Pendiente"
    : status === "syncing"
    ? "Sincronizando"
    : status === "synced"
    ? "Sincronizado"
    : "Falló";
}
function isManualVisitAllowed(order: WorkOrder): boolean {
  return order.status === "GENERADO" && order.physicalStatus === "NONE";
}
function pendingCount(items: import("../ports").SyncItem[]): number {
  return items.filter((item) => item.status !== "synced").length;
}
function isUsable(mode: ConnectivityMode): boolean {
  return mode !== "offline";
}
function formatDate(value?: string): string {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin datos"
    : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function formatActivityTime(value?: string): string {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin datos"
    : new Intl.DateTimeFormat("es-BO", { timeStyle: "short" }).format(date);
}
function shortTechnicalId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-4)}`;
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

function LastUpdateText({ timestamp }: { timestamp?: string }) {
  const [nowMs, setNowMs] = useState(() => (typeof Date !== "undefined" ? Date.now() : 0));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  return <>{formatLastUpdate(timestamp, nowMs).relative}</>;
}

function formatLastUpdate(value?: string, nowMs = Date.now()): { relative: string; exact: string } {
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
  if (diffSec < 45) {
    return { relative: "hace instantes", exact };
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { relative: `Hace ${diffMin} min`, exact };
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return { relative: `Hace ${diffHours} h`, exact };
  }
  const dateStr = new Intl.DateTimeFormat("es-BO", { dateStyle: "short" }).format(date);
  return { relative: dateStr, exact };
}
