/**
 * Inicio de la jornada del técnico: resumen operativo, tarjeta de la orden actual con navegación entre órdenes
 * (recorrido del día), estado vacío y tarjetas colapsables de cola y actividad reciente.
 * Solo presenta y delega acciones al store; qué orden corresponde a cada acción lo decide `utils/sorting.ts`.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { AppStore, AppState } from "../state/store";
import { selectVisibleOrders } from "../state/store";
import type { ConnectivityMode, WorkOrder } from "../domain/types";
import { FieldMap } from "./FieldMap";
import { IconAlertTriangle, IconBan, IconCheckCircle, IconClock, IconCrosshair, IconDatabase, IconDocument, IconExpand, IconPin, IconRefresh, IconRoute, IconUser } from "./common/Icons";
import { AppStateCard } from "./common/UiState";
import { activityLabel, fieldOrderStatusLabel, orderStatusTone } from "../utils/labels";
import { sortActivityEntries, sortSyncItemsForDisplay, orderJourneyOrders, adjacentJourneyOrder, activityTimestamp } from "../utils/sorting";
import { displayValue, formatDebt, formatActivityTime, shortTechnicalId } from "../utils/format";
import { openOrderMap } from "../state/field-commands";
export function FieldHome({ state, store, orders, onOpenIncident, onReviewOrder }: { state: AppState; store: AppStore; orders: WorkOrder[]; onOpenIncident: (orderId: string) => void; onReviewOrder: () => void }) {
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
        <div className="current-order-card__navigation" role="group" aria-label="Navegación de órdenes">
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
