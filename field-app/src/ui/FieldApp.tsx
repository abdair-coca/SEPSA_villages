import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { ActivityEntry, AppStore, ActionInput, AppState, OrderFilter } from "../app/index";
import { selectVisibleOrders } from "../app/index";
import { downloadRouteMap, isRouteMapCached, type CacheProgress } from "../app/map-cache";
import { BrowserConnectivity } from "../adapters/browser/connectivity";
import type { ConnectivityMode, CutType, FieldCapture, WorkOrder } from "../domain";
import { FieldMap } from "./FieldMap";
import { IconCheck, IconDownload, IconMap, IconPin, IconRefresh, IconSearch } from "./Icons";

export interface FieldAppProps {
  store: AppStore;
  technicianId?: string;
  technicianName?: string;
  deviceId?: string;
  enableReconnection?: boolean;
  onRefreshAssigned?: () => Promise<void>;
  onLogout?: () => void;
}

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
  const connectivityRef = useRef<BrowserConnectivity | null>(null);
  const prevModeRef = useRef<ConnectivityMode>(state.mode);

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
    if (!onRefreshAssigned || isRefreshingAssigned) return;
    setIsRefreshingAssigned(true);
    setAssignedRefreshError(undefined);
    try {
      await onRefreshAssigned();
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
        await store.sync().catch(() => undefined);
        await handleRefreshAssigned();
      }
    } finally {
      setIsProbingNetwork(false);
    }
  };

  return (
    <div className="field-app">
      <Header
        state={state}
        isProbingNetwork={isProbingNetwork}
        onRetryConnection={handleRetryConnection}
        isRefreshingAssigned={isRefreshingAssigned}
        onRefreshAssigned={onRefreshAssigned ? () => void handleRefreshAssigned() : undefined}
        technicianId={technicianId}
        technicianName={technicianName}
        deviceId={deviceId}
        onLogout={onLogout}
      />
      {state.message ? (
        <div className={`message message--${state.message.tone}`} role="status">
          {state.message.text}
        </div>
      ) : null}
      {assignedRefreshError ? <div className="message message--warning" role="status">{assignedRefreshError}</div> : null}
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
        <div className="eyebrow">SEPSA · Campo</div>
        <h1>Jornada de campo</h1>
        <p className="identity">Órdenes asignadas, ejecución de cortes y sincronización en terreno.</p>
        <div className="header-person">
          <span>Técnico</span>
          <strong>{technicianName ?? technicianId}</strong>
        </div>
        <div className="technical-id header-device">Dispositivo: {shortTechnicalId(deviceId)}</div>
      </div>
      <div className="header-meta">
        <div className="header-status-group">
          <span className={`network-status-badge network-status-badge--${state.mode}`}>
            <span className={`network-dot network-dot--${state.mode}`} aria-hidden="true" />
            <span className="network-status-text">{modeLabel}</span>
          </span>
          <button
            type="button"
            className={`btn-network-retry ${isProbingNetwork ? "is-probing" : ""}`}
            onClick={onRetryConnection}
            disabled={isProbingNetwork}
            title="Reintentar conexión ahora"
            aria-label="Reintentar conexión"
          >
            <span className="retry-icon" aria-hidden="true"><IconRefresh /></span>
            <span className="retry-label">{isProbingNetwork ? "Probando…" : "Reintentar"}</span>
          </button>
          <LastUpdateDisplay
            timestamp={state.lastRefreshAt ?? state.package?.downloadedAt}
            isRefreshing={isProbingNetwork || isRefreshingAssigned}
            onRefresh={onRefreshAssigned ?? onRetryConnection}
          />
          {onLogout ? <button type="button" className="logout-button" onClick={onLogout}>Cerrar sesión</button> : null}
        </div>
      </div>
      <div className="simulation-banner">Datos de demostración · fuente pendiente de validación con SEPSA</div>
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

  return (
    <main className="workbench">
      <OperationalStrip state={state} store={store} onRefreshAssigned={onRefreshAssigned} />

      {state.tab === "orders" ? (
        selectedOrder ? (
          <OrderDetail
            order={selectedOrder}
            state={state}
            store={store}
            enableReconnection={enableReconnection}
            technicianName={technicianName}
            onBack={() => store.selectOrder(null)}
          />
        ) : (
          <OrdersPanel state={state} orders={visibleOrders} store={store} onRefreshAssigned={onRefreshAssigned} />
        )
      ) : (
        <QueuePanel state={state} store={store} />
      )}
    </main>
  );
}

function OperationalStrip({ state, store, onRefreshAssigned }: { state: AppState; store: AppStore; onRefreshAssigned?: () => void }) {
  const pending = pendingCount(state.syncItems);
  return (
    <section className="operational-strip" aria-label="Estado operativo">
      <div className="operational-strip__status">
        <span className={`network-dot network-dot--${state.mode}`} aria-hidden="true" />
        <div>
          <strong>{state.mode === "online" ? "Conectada" : state.mode === "weak" ? "Señal débil" : "Sin conexión"}</strong>
          <span>Última actualización: <LastUpdateText timestamp={state.lastRefreshAt ?? state.package?.downloadedAt} /></span>
        </div>
      </div>
      <div className="operational-strip__queue">
        <span className={pending ? "queue-count queue-count--pending" : "queue-count"}>{pending}</span>
        <div>
          <strong>{pending ? `${pending} operación${pending === 1 ? "" : "es"} en cola` : "Cola despejada"}</strong>
          <span>{pending ? "Guardadas en este dispositivo" : "Sin pendientes de sincronización"}</span>
        </div>
      </div>
      <div className="operational-strip__actions">
        <button type="button" className="toolbar-action" onClick={onRefreshAssigned ?? (() => void store.refresh())}>Actualizar bandeja</button>
        {pending ? (
          <button type="button" className="sync-button sync-button--compact" disabled={!isUsable(state.mode) || Boolean(state.busyAction)} onClick={() => void store.sync()}>
            {state.busyAction === "SYNC" ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
        ) : null}
        <button type="button" className="queue-link" onClick={() => { store.selectOrder(null); store.setTab("queue"); }}>
          Ver cola
        </button>
      </div>
    </section>
  );
}

function OrdersPanel({ state, orders, store, onRefreshAssigned }: { state: AppState; orders: WorkOrder[]; store: AppStore; onRefreshAssigned?: () => void }) {
  const [showMap, setShowMap] = useState(false);
  const [isMapCachedState, setIsMapCachedState] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<CacheProgress | null>(null);
  const [isDownloadingMap, setIsDownloadingMap] = useState(false);

  useEffect(() => {
    let active = true;
    void isRouteMapCached(state.orders).then((cached) => {
      if (active) setIsMapCachedState(cached);
    });
    return () => {
      active = false;
    };
  }, [state.orders]);

  const handleDownloadMap = async () => {
    setIsDownloadingMap(true);
    try {
      await downloadRouteMap(state.orders, (progress) => {
        setDownloadProgress(progress);
      });
      setIsMapCachedState(true);
    } catch {
      // Manejo silencioso en UI para no interrumpir la jornada
    } finally {
      setIsDownloadingMap(false);
      setDownloadProgress(null);
    }
  };

  const generatedCount = state.orders.filter((o) => o.status === "GENERADO").length;
  const executedCount = state.orders.filter((o) => o.status === "EJECUTADO").length;
  const cancelledCount = state.orders.filter((o) => o.status === "ANULADO").length;
  const reviewCount = state.orders.filter((o) => o.physicalStatus === "PHYSICAL_UNKNOWN").length;
  const nextOrder = orders.find((order) => order.status === "GENERADO" && order.physicalStatus === "NONE") ?? orders[0];

  const filters: Array<{ value: OrderFilter; label: string; count?: number }> = [
    { value: "ALL", label: "Todas", count: state.orders.length },
    { value: "GENERADO", label: "Por ejecutar", count: generatedCount },
    { value: "EJECUTADO", label: "Ejecutadas", count: executedCount },
    { value: "ANULADO", label: "Anuladas", count: cancelledCount },
    { value: "REVIEW", label: "Revisión" },
  ];

  return (
    <section className="orders-panel" aria-label="Órdenes asignadas">
      <div className="workbench-heading">
        <div>
          <div className="eyebrow">TRABAJO DE HOY</div>
          <h2>Tu jornada</h2>
          <p>Primero resuelve la orden actual. El resto queda debajo.</p>
        </div>
        <span className="package-label">Paquete v{state.package?.version ?? "—"}</span>
      </div>

      <div className="metric-row" aria-label="Resumen de órdenes">
        <MetricCard value={generatedCount} label="Por ejecutar" tone="attention" />
        <MetricCard value={reviewCount} label="En revisión" tone="review" />
        <MetricCard value={executedCount} label="Ejecutadas" tone="success" />
        <MetricCard value={cancelledCount} label="Anuladas" tone="muted" />
        <MetricCard value={pendingCount(state.syncItems)} label="En cola" tone="queue" />
      </div>

      {nextOrder ? (
        <div className="orders-dashboard">
          <CurrentOrderCard order={nextOrder} mode={state.mode} onOpen={() => store.selectOrder(nextOrder.orderId)} onShowMap={() => { store.selectOrder(nextOrder.orderId); setShowMap(true); }} />
          <section className="my-orders-section" aria-label="Mis órdenes">
            <div className="section-heading-inline">
              <div>
                <span className="eyebrow">BANDEJA ASIGNADA</span>
                <h2>Mis órdenes</h2>
              </div>
              <span className="section-count">{orders.length}</span>
            </div>
            <OrderFilters state={state} store={store} filters={filters} />
            <div className="order-cards-list">
              {orders.map((order) => (
                <OrderCard
                  key={order.orderId}
                  order={order}
                  selected={state.selectedOrderId === order.orderId}
                  onSelect={() => store.selectOrder(order.orderId)}
                  onShowMap={() => { store.selectOrder(order.orderId); setShowMap(true); }}
                />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <EmptyOrders hasAnyOrders={state.orders.length > 0} onRefresh={onRefreshAssigned ?? (() => void store.refresh())} onShowMap={() => setShowMap(true)} />
      )}

      <div className="map-tools">
        <button type="button" className={showMap ? "map-reveal map-reveal--active" : "map-reveal"} onClick={() => setShowMap(!showMap)}>
          <IconMap className="btn-icon" />
          <span>{showMap ? "Ocultar mapa de órdenes" : "Ver mapa de órdenes"}</span>
        </button>
        {!isMapCachedState ? (
          <button type="button" className="map-download-link" disabled={isDownloadingMap} onClick={handleDownloadMap}>
            <IconDownload className="btn-icon" />
            {isDownloadingMap ? `Descargando zona (${downloadProgress?.percent ?? 0}%)…` : "Descargar zona para trabajar offline"}
          </button>
        ) : <span className="map-cached-tag"><IconCheck className="cached-icon" /> Mapa descargado</span>}
      </div>
      {showMap ? <FieldMap orders={orders} selectedOrderId={nextOrder?.orderId ?? null} onSelectOrder={(orderId) => store.selectOrder(orderId)} mode={state.mode} /> : null}
    </section>
  );
}

function MetricCard({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <div className={`metric-card metric-card--${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function OrderFilters({ state, store, filters }: { state: AppState; store: AppStore; filters: Array<{ value: OrderFilter; label: string; count?: number }> }) {
  return (
    <div className="order-filters">
      <div className="search-bar-wrap">
        <label className="search-field" htmlFor="order-search">
          <IconSearch className="search-field-icon" />
          <input id="order-search" type="search" value={state.query} onChange={(event) => store.setQuery(event.target.value)} placeholder="Buscar por cuenta, medidor o cliente" />
        </label>
        {state.query ? <button type="button" className="search-clear-btn" onClick={() => store.setQuery("")} aria-label="Limpiar búsqueda">×</button> : null}
      </div>
      <div className="filter-row" role="tablist" aria-label="Filtrar órdenes">
        {filters.map((filter) => {
          const isActive = state.filter === filter.value;
          return <button key={filter.value} type="button" role="tab" aria-selected={isActive} className={isActive ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => store.setFilter(filter.value)}><span>{filter.label}</span>{filter.count !== undefined ? <span className="chip-count">{filter.count}</span> : null}</button>;
        })}
      </div>
    </div>
  );
}

function CurrentOrderCard({ order, mode, onOpen, onShowMap }: { order: WorkOrder; mode: ConnectivityMode; onOpen: () => void; onShowMap: () => void }) {
  const context = order.context;
  const isReady = order.status === "GENERADO" && order.physicalStatus === "NONE";
  const debtBs = context ? (context.debtCents / 100).toFixed(2) : "0.00";
  return (
    <article className="current-order-card">
      <div className="current-order-card__topline"><span className="current-label"><span className="current-pulse" aria-hidden="true" />Siguiente orden</span><span className={`status-badge status-badge--${orderStatusTone(order)}`}>{orderStatusLabel(order.status)}</span></div>
      <div className="current-order-card__identity">
        <div>
          <h2>{context?.customerName || order.orderId}</h2>
          <p>{context?.accountId || order.accountId || "Cuenta no disponible"} · {context?.meterId || "Medidor no disponible"}</p>
        </div>
        {order.cuc ? <span className="technical-id">CUC: {shortTechnicalId(order.cuc)}</span> : null}
      </div>
      <div className="current-order-card__location"><IconPin /><div><span>Ubicación</span><strong>{context?.address || "Dirección no especificada"}</strong><small>{context?.locality || "Localidad no disponible"} · {context?.route || "Ruta no disponible"}{context?.references ? ` · ${context.references}` : ""}</small></div></div>
      <div className="current-order-card__financial"><div><span>Deuda</span><strong>Bs {debtBs}</strong></div><div><span>Facturas pendientes</span><strong>{context?.monthsPending ?? "—"}</strong></div><div><span>Estado</span><strong>{context?.supplyStatus || "No disponible"}</strong></div></div>
      <div className="readiness-list" aria-label="Estado para registrar corte">
        <span className={context?.address ? "readiness readiness--ready" : "readiness readiness--missing"}><b aria-hidden="true">{context?.address ? "✓" : "!"}</b>{context?.address ? "Suministro ubicado" : "Falta dirección"}</span>
        <span className="readiness readiness--pending"><b aria-hidden="true">•</b>Ubicación se captura al registrar</span>
        <span className="readiness readiness--pending"><b aria-hidden="true">•</b>Evidencia fotográfica pendiente</span>
        <span className="readiness readiness--pending"><b aria-hidden="true">•</b>Medición final pendiente</span>
        <span className={isReady ? "readiness readiness--pending" : "readiness readiness--ready"}><b aria-hidden="true">{isReady ? "•" : "✓"}</b>{isReady ? "Corte pendiente de registrar" : "Sin acción de corte pendiente"}</span>
        <span className={`readiness readiness--${mode === "offline" ? "missing" : "ready"}`}><b aria-hidden="true">{mode === "offline" ? "!" : "✓"}</b>{mode === "offline" ? "Sin conexión" : "Conectividad disponible"}</span>
      </div>
      <div className="current-order-card__actions"><button type="button" className="primary-action" onClick={onOpen}>{isReady ? "Registrar corte" : "Abrir orden"}<span>→</span></button><button type="button" className="secondary-action" onClick={onShowMap}><IconMap /> Ver ubicación</button></div>
      <div className="technical-id current-order-card__technical">Orden: {shortTechnicalId(order.orderId)} · actualizado {formatDate(context?.updatedAt)}</div>
    </article>
  );
}

function OrderCard({
  order,
  selected,
  onSelect,
  onShowMap,
}: {
  order: WorkOrder;
  selected: boolean;
  onSelect: () => void;
  onShowMap: () => void;
}) {
  const isCancelled = order.status === "ANULADO";
  const isExecuted = order.status === "EJECUTADO";
  const account = order.context?.accountId || order.accountId || "S/C";
  const meter = order.context?.meterId || "S/M";
  const customer = order.context?.customerName || order.orderId;
  const address = order.context?.address || "Dirección no especificada";
  const route = order.context?.route || "Ruta —";
  const debtBs = order.context?.debtCents ? (order.context.debtCents / 100).toFixed(2) : "0.00";
  const daysSince = formatDaysSince(order.createdAt);
  const cuc = order.cuc;

  return (
    <article
      className={`order-card order-item ${selected ? "order-card--selected" : ""} ${
        isCancelled ? "order-card--cancelled" : ""
      }`}
      onClick={onSelect}
    >
      <div className="order-card__header">
        <div className="order-card__badges">
          <span className={`status-badge status-badge--${orderStatusTone(order)}`}>
            {orderStatusLabel(order.status)}
          </span>
        </div>
      </div>

      <div className="order-card__body">
        <h3 className="order-card__customer">{customer}</h3>
        <p className="order-card__supply">{account} · {meter}</p>
        <p className="order-card__address">
          <IconPin className="card-address-icon" /> {address}
        </p>
        <p className="order-card__route">{order.context?.locality || "Localidad no disponible"} · {route}</p>
      </div>

      <div className="order-card__footer">
        <div className="order-card__debt-info">
          <span className="order-card__debt-label">Deuda:</span>
          <strong className="order-card__debt-val">Bs {debtBs}</strong>
          <span className="order-card__days">{daysSince}</span>
        </div>

        <div className="order-card__actions">
          <button type="button" className="order-card__action-btn" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
            {isCancelled ? "Ver anulado" : isExecuted ? "Ver ejecutado" : "Abrir"}
          </button>
          <button type="button" className="order-card__map-btn" onClick={(e) => { e.stopPropagation(); onShowMap(); }}>Mapa</button>
        </div>
      </div>
      <div className="technical-id order-card__technical">Orden {shortTechnicalId(order.orderId)}{cuc ? ` · CUC ${shortTechnicalId(cuc)}` : ""}</div>
    </article>
  );
}

function OrderDetail({
  order,
  state,
  store,
  enableReconnection,
  technicianName,
  onBack,
}: {
  order: WorkOrder;
  state: AppState;
  store: AppStore;
  enableReconnection: boolean;
  technicianName?: string;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<ActionKind | null>(null);
  const isCancelled = order.status === "ANULADO";

  return (
    <section className="detail-panel panel detail-panel--fullscreen" aria-label={`Detalle de ${order.orderId}`}>
      {/* Barra superior de retorno */}
      <div className="detail-navigation-bar">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Volver a la bandeja de órdenes
        </button>
        <div className="detail-cuc-badge">
          <span className={`status-badge status-badge--${orderStatusTone(order)}`}>
            {orderStatusLabel(order.status)}
          </span>
        </div>
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

      <div className="detail-heading">
        <div>
          <span className="eyebrow">ORDEN ACTUAL</span>
          <h2>{order.context?.customerName || order.orderId}</h2>
          <p>{order.context?.accountId || order.accountId || "Cuenta no disponible"} · {order.context?.meterId || "Medidor no disponible"}</p>
        </div>
        <div className="detail-technical-stack">
          <span className="technical-id">Orden {shortTechnicalId(order.orderId)}</span>
          {order.cuc ? <span className="technical-id">CUC: {shortTechnicalId(order.cuc)}</span> : null}
        </div>
      </div>

      <div className="physical-card">
        <span className="physical-card__label">Estado físico</span>
        <strong>{physicalStatusLabel(order.physicalStatus)}</strong>
        {order.physicalStatus === "PHYSICAL_UNKNOWN" ? (
          <p>Revisión humana requerida. No repetir acción.</p>
        ) : (
          <p>Estado local verificable sin conexión.</p>
        )}
      </div>

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

      <div className="action-stack">
        {order.status === "GENERADO" && order.physicalStatus === "NONE" ? (
          <button className="primary-action" aria-label="Preparar corte" disabled={Boolean(state.busyAction)} onClick={() => setDraft("CUT")}>
            Registrar corte <span>→</span>
          </button>
        ) : null}
        <button className={order.status === "GENERADO" && order.physicalStatus === "NONE" ? "secondary-action" : "primary-action"} disabled={Boolean(state.busyAction)} onClick={() => setDraft("VISIT")}>
          Registrar visita <span>→</span>
        </button>
        {enableReconnection && order.status === "EJECUTADO" && order.physicalStatus === "CONFIRMED" ? (
          <button
            className="secondary-action"
            disabled={Boolean(state.busyAction)}
            onClick={() => setDraft("RECONNECTION")}
          >
            Preparar reconexión <span>→</span>
          </button>
        ) : null}
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
    <section className="context-panel" aria-label="Contexto operativo">
      <div className="context-heading"><div><span className="eyebrow">DATOS PARA TRABAJAR</span><h3>Cliente y suministro</h3></div><span className="context-source">Actualizado {formatDate(context.updatedAt)}</span></div>
      <div className="detail-location"><IconPin /><div><span>Dirección</span><strong>{context.address || "Dato no disponible"}</strong><small>{context.references || "Sin referencia adicional"}</small></div></div>
      <div className="detail-debt"><div><span>Deuda de referencia</span><strong>Bs {(context.debtCents / 100).toFixed(2)}</strong></div><span>{context.monthsPending} facturas pendientes</span></div>
      <div className="context-grid">
        <div><span>Cuenta / suministro</span><strong>{context.accountId || "Dato no disponible"} · {context.supplyId || "Dato no disponible"}</strong></div>
        <div><span>Medidor</span><strong>{context.meterId || "Dato no disponible"}{context.meterBrand ? ` · ${context.meterBrand}` : ""}</strong></div>
        <div><span>Ruta / circuito</span><strong>{context.route || "Dato no disponible"} · {context.circuit || "Dato no disponible"}</strong></div>
        <div><span>Localidad / estado</span><strong>{context.locality || "Dato no disponible"} · {context.supplyStatus || "Dato no disponible"}</strong></div>
      </div>
      <details className="technical-details">
        <summary>Ver datos técnicos</summary>
        <div className="technical-details__body"><span>Tarifa: {context.tariff || "Dato no disponible"}</span><span>Coordenadas: {context.cadastralLatitude !== undefined && context.cadastralLongitude !== undefined ? `${context.cadastralLatitude.toFixed(6)}, ${context.cadastralLongitude.toFixed(6)}` : "No disponibles"}</span></div>
      </details>
      <details className="kardex-details">
        <summary>Kardex y deuda</summary>
        {context.kardex.length ? context.kardex.map((entry) => <div className="kardex-row" key={entry.entryId}><span>{entry.period}</span><span>Bs {(entry.amountCents / 100).toFixed(2)}</span><span>{entry.status === "PENDING" ? "Pendiente" : "Pagado"}</span></div>) : <p>Historial no disponible en paquete local.</p>}
      </details>
    </section>
  );
}

function ActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length) return <div className="activity-empty">Sin actividad local registrada.</div>;
  return (
    <section className="activity-panel" aria-label="Actividad local">
      <div className="eyebrow">ACTIVIDAD LOCAL</div>
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
    if (kind !== "VISIT" && !file && !useException) return setFormError("Adjunte un archivo JPEG/PNG o marque excepción.");
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
            {state.busyAction === "SYNC" ? "Sincronizando…" : "Sincronizar ahora"}
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
        <button type="button" className="secondary-action" onClick={onShowMap}><IconMap /> Ver mapa</button>
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
function orderStatusLabel(status: WorkOrder["status"]): string {
  return status === "GENERADO"
    ? "Por ejecutar"
    : status === "EJECUTADO"
    ? "Corte ejecutado"
    : status === "RECONEXIÓN"
    ? "Reconectada"
    : "Anulada";
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
function formatDaysSince(dateStr?: string): string {
  if (!dateStr) return "—";
  const timestamp = Date.parse(dateStr);
  if (Number.isNaN(timestamp)) return "—";
  const diffMs = Date.now() - timestamp;
  const days = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  return `${days.toFixed(1)} d`;
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
    return { relative: "Hace instantes", exact };
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
