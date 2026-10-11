/**
 * Bandeja "Mis órdenes" del técnico: búsqueda, filtros por estado, tarjetas paginadas (1 por página en móvil,
 * 5 en escritorio) y acción de actualizar la bandeja cuando está vacía. Solo lee el estado y delega al store.
 */
import { useEffect, useState } from "react";
import type { AppStore, AppState, OrderFilter } from "../state/store";
import type { WorkOrder } from "../domain/types";
import { IconPin } from "./common/Icons";
import { SearchField } from "./common/SearchField";
import { PaginationControls } from "./common/PaginationControls";
import { AppStateCard } from "./common/UiState";
import { fieldOrderStatusLabel, orderStatusTone } from "../utils/labels";
import { formatDebt, shortTechnicalId } from "../utils/format";
export function OrdersPanel({ state, orders, store, onRefreshAssigned, onOpenOrder }: { state: AppState; orders: WorkOrder[]; store: AppStore; onRefreshAssigned?: () => void; onOpenOrder: () => void }) {
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
