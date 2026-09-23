import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { ActivityEntry, AppMessage, AppStore, ActionInput, AppState, OrderFilter } from "../app/index";
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

  const openIncident = (orderId: string) => {
    const order = state.orders.find((candidate) => candidate.orderId === orderId);
    if (!order || !isManualVisitAllowed(order)) return;
    setPendingAction({ orderId, kind: "VISIT" });
    store.selectOrder(orderId);
  };

  const prioritizedOrders = sortOrdersForNext(state.orders);
  const navigate = (tab: "home" | "orders" | "map" | "queue") => {
    setPendingAction(null);
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
        onBack={() => { setPendingAction(null); store.selectOrder(null); }}
      />
    ) : (
      <OrdersPanel state={state} orders={visibleOrders} store={store} onRefreshAssigned={onRefreshAssigned} />
    )
    : state.tab === "map"
      ? <MapPanel state={state} store={store} />
      : state.tab === "queue"
        ? <QueuePanel state={state} store={store} />
        : <FieldHome state={state} store={store} orders={prioritizedOrders} onOpenIncident={openIncident} />;

  return (
    <main className="workbench">
      <DesktopNavigation activeTab={state.tab} onNavigate={navigate} pending={pendingCount(state.syncItems)} />
      {content}
      <BottomNavigation activeTab={state.tab} onNavigate={navigate} pending={pendingCount(state.syncItems)} />
    </main>
  );
}

function FieldHome({ state, store, orders, onOpenIncident }: { state: AppState; store: AppStore; orders: WorkOrder[]; onOpenIncident: (orderId: string) => void }) {
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

function OrdersPanel({ state, orders, store, onRefreshAssigned }: { state: AppState; orders: WorkOrder[]; store: AppStore; onRefreshAssigned?: () => void }) {
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
  return <section className="orders-panel orders-tray" aria-label="Mis órdenes"><div className="orders-tray__heading"><div><span className="eyebrow">BANDEJA ASIGNADA</span><h2>Mis órdenes</h2><p>Todas tus órdenes asignadas para hoy.</p></div><span className="orders-tray__count">{orders.length}</span></div><OrderFilters state={state} store={store} filters={filters} compactViewport={isCompactViewport} filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} selectedFilter={selectedFilter} /><div className="order-cards-list">{pageOrders.map((order) => <OrderCard key={order.orderId} order={order} selected={state.selectedOrderId === order.orderId} onSelect={() => store.selectOrder(order.orderId)} />)}{!pageOrders.length ? <p className="order-list-empty">No hay órdenes que coincidan con búsqueda y filtros.</p> : null}</div><div className="order-pagination" aria-label="Paginación de órdenes"><span>Mostrando {firstVisibleOrder}-{lastVisibleOrder} de {orders.length} órdenes</span><div className="order-pagination__controls"><button type="button" onClick={() => setOrdersPage((page) => Math.max(1, page - 1))} disabled={ordersPage <= 1}>Anterior</button><span>Página {ordersPage} de {ordersPageCount}</span><button type="button" onClick={() => setOrdersPage((page) => Math.min(ordersPageCount, page + 1))} disabled={ordersPage >= ordersPageCount}>Siguiente</button></div></div>{!orders.length ? <button type="button" className="primary-action" onClick={onRefreshAssigned ?? (() => void store.refresh())}>Actualizar bandeja</button> : null}</section>;
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
  const debt = formatDebt(order.context?.debtCents) ?? "Bs 0.00";
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
  const isCancelled = order.status === "ANULADO";
  const canCut = order.status === "GENERADO" && order.physicalStatus === "NONE";
  const canRegisterVisit = isManualVisitAllowed(order);
  const locationHref = order.context && hasCadastralCoordinates(order.context)
    ? `https://www.google.com/maps/search/?api=1&query=${order.context.cadastralLatitude},${order.context.cadastralLongitude}`
    : undefined;

  useEffect(() => {
    if (initialAction && (initialAction !== "VISIT" || canRegisterVisit)) setDraft(initialAction);
  }, [canRegisterVisit, initialAction]);

  return (
    <section className="detail-panel panel detail-panel--fullscreen" aria-label={`Detalle de ${order.orderId}`}>
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

      {draft ? (
        <ActionForm
          kind={draft}
          order={order}
          technicianName={technicianName}
          busy={state.busyAction === draft}
          onCancel={() => setDraft(null)}
          onSubmit={async (input) => {
            if (draft === "VISIT") await store.registerVisit(order.orderId, input);
            else if (draft === "CUT") await store.executeCut(order.orderId, input);
            else await store.executeReconnection(order.orderId, input);
            setDraft(null);
          }}
        />
      ) : null}
    </section>
  );
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

function ActionForm({
  kind,
  order,
  technicianName,
  busy,
  onCancel,
  onSubmit,
}: {
  kind: ActionKind;
  order: WorkOrder;
  technicianName?: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: ActionInput) => Promise<void>;
}) {
  const [file, setFile] = useState<File | undefined>();
  const [useException, setUseException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [formError, setFormError] = useState("");
  const [reading, setReading] = useState("");
  const [cutType, setCutType] = useState<CutType>("RED");
  const [nearbyMeters, setNearbyMeters] = useState(false);
  const [location, setLocation] = useState<FieldCapture["location"]>();
  const [skipLocation, setSkipLocation] = useState(false);
  const [locationReason, setLocationReason] = useState("");
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requiresExternal = kind !== "VISIT";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file && !useException) return setFormError("Adjunte un archivo JPEG/PNG o marque excepción.");
    if (useException && !exceptionReason.trim()) return setFormError("Escriba una justificación para la excepción.");
    if (kind === "CUT") {
      const parsedReading = Number(reading);
      if (!Number.isFinite(parsedReading) || parsedReading < 0)
        return setFormError("Ingrese lectura final válida del medidor.");
      if (!location && !skipLocation) return setFormError("Capture GPS o registre excepción de coordenadas.");
      if (skipLocation && !locationReason.trim()) return setFormError("Justifique excepción de coordenadas.");
    }
    setFormError("");
    setSubmitting(true);
    try {
      const fieldCapture =
        kind === "CUT"
          ? {
              reading: {
                value: Number(reading),
                unit: "kWh" as const,
                meterId: order.context?.meterId ?? "",
                recordedAt: new Date().toISOString(),
                status: "CAPTURED" as const,
              },
              location: location ?? {
                recordedAt: new Date().toISOString(),
                status: "BYPASSED" as const,
                exceptionReason: "saltar_control_coordenadas: " + locationReason,
              },
              cutType,
              nearbyMeters,
            }
          : undefined;
      await onSubmit({
        file,
        exceptionReason: useException ? "saltar_control_fotos: " + exceptionReason : undefined,
        gpsExceptionReason: skipLocation ? "saltar_control_coordenadas: " + locationReason : undefined,
        fieldCapture,
        reason: requiresExternal
          ? `Intento de ${actionLabel(kind).toLocaleLowerCase()}`
          : "Visita de campo sin ejecución",
      });
    } catch {
      /* Store exposes actionable status. */
    } finally {
      setSubmitting(false);
    }
  }

  function captureLocation() {
    if (!navigator.geolocation) return setFormError("Este dispositivo no ofrece GPS; registre excepción controlada.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          recordedAt: new Date().toISOString(),
          status: "CAPTURED",
        });
        setSkipLocation(false);
        setLocating(false);
        setFormError("");
      },
      () => {
        setLocating(false);
        setFormError("No pudimos capturar GPS. Reintente o registre excepción controlada.");
      }
    );
  }

  return (
    <form className="action-form" onSubmit={submit}>
      <div className="form-heading">
        <div>
          <span className="eyebrow">{actionLabel(kind)}</span>
          <h3>Confirmar datos</h3>
        </div>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="Cerrar formulario">
          ×
        </button>
      </div>
      <p className="form-hint">
        Orden {order.orderId} · Técnico responsable: {technicianName ?? order.assignedTechnicianId}. La evidencia queda
        guardada localmente y espera confirmación de sincronización.
      </p>
      {kind === "CUT" ? (
        <fieldset className="capture-fieldset">
          <legend>Datos obligatorios de campo</legend>
          <label className="text-field">
            <span>Lectura final del medidor (kWh)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={reading}
              onChange={(event) => setReading(event.target.value)}
              required
            />
          </label>
          <label className="text-field">
            <span>Tipo de corte</span>
            <select value={cutType} onChange={(event) => setCutType(event.target.value as CutType)}>
              <option value="RED">Red</option>
              <option value="MEDIDOR">Medidor</option>
              <option value="BARRAS">Barras</option>
              <option value="PROTECCION">Protección</option>
              <option value="ACOMETIDA">Acometida</option>
              <option value="FUSIBLES">Fusibles</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={nearbyMeters}
              onChange={(event) => setNearbyMeters(event.target.checked)}
            />
            <span>Verifiqué medidores cercanos</span>
          </label>
          <div className="location-box">
            <strong>Coordenadas GPS</strong>
            {location ? (
              <span>
                {location.latitude?.toFixed(6)}, {location.longitude?.toFixed(6)} · precisión{" "}
                {Math.round(location.accuracyMeters ?? 0)} m
              </span>
            ) : (
              <span>No capturadas</span>
            )}
            <button
              type="button"
              className="secondary-action"
              onClick={captureLocation}
              disabled={locating || skipLocation}
            >
              {locating ? "Capturando…" : "Capturar GPS"}
            </button>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={skipLocation}
              onChange={(event) => {
                setSkipLocation(event.target.checked);
                if (event.target.checked) setLocation(undefined);
              }}
            />
            <span>No puedo capturar coordenadas</span>
          </label>
          {skipLocation ? (
            <label className="text-field">
              <span>Justificación de coordenadas</span>
              <textarea
                value={locationReason}
                onChange={(event) => setLocationReason(event.target.value)}
                rows={2}
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}
      <label className="file-field">
        <span>Archivo de evidencia</span>
        <input
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          onChange={(event) => setFile(event.target.files?.[0])}
        />
        <small>{file ? file.name : "JPEG o PNG preparado"}</small>
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={useException}
          onChange={(event) => setUseException(event.target.checked)}
        />
        <span>No puedo adjuntar evidencia</span>
      </label>
      {useException ? (
        <label className="text-field">
          <span>Justificación obligatoria</span>
          <textarea
            value={exceptionReason}
            onChange={(event) => setExceptionReason(event.target.value)}
            rows={3}
            placeholder="Describa el motivo"
          />
        </label>
      ) : null}
      {formError ? <p className="form-error" role="alert">{formError}</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="primary-action" disabled={busy || submitting}>
          {busy || submitting ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </form>
  );
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
function fieldOrderStatusLabel(order: WorkOrder): string {
  if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "En revisión";
  return order.status === "ANULADO" ? "Anulada" : order.status === "GENERADO" ? "Por ejecutar" : "Ejecutada";
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
