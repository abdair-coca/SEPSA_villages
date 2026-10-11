/**
 * Panel derecho del administrador: datos del suministro seleccionado con la acción de crear orden (o ver la
 * orden activa si ya existe) y la lista paginada de órdenes recientes.
 */
import type { FormEvent } from "react";
import type { DebtorRecord, WorkOrder } from "../domain/types";
import { AppStateCard } from "./common/UiState";
import { PaginationControls } from "./common/PaginationControls";
import { AdminDataField } from "./AdminData";
import { adminOrderStatusLabel, adminOrderStatusTone } from "../utils/labels";
import { formatAdminCoordinates, formatAdminDate, formatAdminRelativeDate, joinAdminValues } from "../utils/format";

export function SelectedSupplyPanel({ debtor, activeOrder, busy, onCreateOrder, onViewOrder }: { debtor: DebtorRecord; activeOrder?: WorkOrder; busy: boolean; onCreateOrder: (event: FormEvent) => void; onViewOrder: (orderId: string) => void }) {
    return <div className="selected-supply-content">
      <div className="selected-supply-heading"><span className="panel-heading__icon panel-heading__icon--document" aria-hidden="true" /><div><span className="eyebrow">Crear y asignar orden de corte</span><h2 id="selected-supply-title">Crear y asignar orden de corte</h2><p>Verifica la información del suministro y genera la orden.</p></div></div>
      <SupplyDataCard debtor={debtor} />

      <form className={activeOrder ? "supply-order-action supply-order-action--active" : "supply-order-action"} onSubmit={activeOrder ? undefined : onCreateOrder}><div className="create-order-summary"><span className="eyebrow">{activeOrder ? "Orden de corte activa" : "Acción disponible"}</span><strong>{activeOrder ? "Este suministro ya tiene una orden activa" : "Crear una orden de corte"}</strong><span>{activeOrder ? `Creada ${formatAdminRelativeDate(activeOrder.createdAt)} · ${activeOrder.assignedTechnicianId ? `Asignada a ${activeOrder.assignedTechnicianName ?? "Técnico asignado"}` : "Sin técnico asignado"}` : "Confirma el suministro y asigna un técnico antes de crearla."}</span></div><button className={activeOrder ? "primary-action primary-action--success" : "primary-action"} type={activeOrder ? "button" : "submit"} onClick={activeOrder ? () => onViewOrder(activeOrder.orderId) : undefined} disabled={busy}>{activeOrder ? "Ver orden de corte" : "Crear orden de corte"}<span>→</span></button></form>

    </div>;
}

export function EmptySupplyPanel() {
  return <div className="selected-supply-content selected-supply-content--empty">
    <div className="selected-supply-heading"><span className="panel-heading__icon panel-heading__icon--document" aria-hidden="true" /><div><span className="eyebrow">Crear y asignar orden de corte</span><h2 id="selected-supply-title">Crear y asignar orden de corte</h2><p>Verifica la información del suministro y genera la orden.</p></div></div>
    <SupplyDataCard />
    <div className="create-order-zone create-order-zone--empty"><div className="create-order-summary"><span className="eyebrow">Crear y asignar orden de corte</span><strong>Selecciona un suministro moroso</strong><span>La acción estará disponible después de revisar sus datos.</span></div><button className="primary-action" type="button" disabled>Crear orden de corte<span>→</span></button></div>
  </div>;
}

function SupplyDataCard({ debtor }: { debtor?: DebtorRecord }) {
  return <section className="supply-context-card"><h3>Datos del suministro seleccionado</h3><div className="supply-data-grid">
    <AdminDataField label="Cliente" value={debtor?.customerName} icon="client" emptyValue="-" />
    <AdminDataField label="Dirección" value={debtor?.address} icon="address" emptyValue="-" />
    <AdminDataField label="Cuenta" value={debtor?.accountId} icon="account" emptyValue="-" />
    <AdminDataField label="Circuito" value={debtor?.circuit} icon="circuit" emptyValue="-" />
    <AdminDataField label="Suministro" value={debtor?.supplyId} icon="supply" emptyValue="-" />
    <AdminDataField label="Área / localidad" value={debtor ? joinAdminValues(debtor.areaName ?? debtor.area, debtor.locality) : undefined} icon="area" emptyValue="-" />
    <AdminDataField label="Medidor / marca" value={debtor ? joinAdminValues(debtor.meterId, debtor.meterBrand) : undefined} icon="meter" emptyValue="-" />
    <AdminDataField label="Estado del cliente" value={debtor?.supplyStatus} icon="status" emptyValue="-" />
    <AdminDataField label="Ruta / orden" value={debtor ? joinAdminValues(debtor.routeName ?? debtor.route, debtor.routeOrder) : undefined} icon="route" emptyValue="-" />
    <AdminDataField label="Tarifa / estado" value={debtor ? joinAdminValues(debtor.tariff, debtor.supplyStatus) : undefined} icon="tariff" emptyValue="-" />
    <AdminDataField label="Coordenadas (catastro)" value={debtor ? formatAdminCoordinates(debtor.cadastralLatitude, debtor.cadastralLongitude) : undefined} icon="coordinates" technical emptyValue="-" />
    <AdminDataField label="Teléfono de contacto" value={debtor?.contactPhone} icon="phone" emptyValue="-" />
  </div></section>;
}

export function RecentOrdersPreview({ orders, totalOrders, selectedOrderId, page, totalPages, onSelect, onPageChange }: { orders: WorkOrder[]; totalOrders: number; selectedOrderId: string; page: number; totalPages: number; onSelect: (orderId: string) => void; onPageChange: (page: number) => void }) {
  return <section className="orders-index admin-recent-orders" aria-labelledby="recent-orders-title"><div className="admin-recent-orders__heading"><div><span className="eyebrow">Actividad</span><h3 id="recent-orders-title">Órdenes recientes</h3></div><span className="admin-recent-orders__count">{totalOrders}</span></div><div className="order-index-list">{orders.map((order) => <OrderRow key={order.orderId} order={order} selected={selectedOrderId === order.orderId} onSelect={() => onSelect(order.orderId)} />)}</div>{!totalOrders ? <AppStateCard tone="empty" layout="inline" className="activity-empty" title="Todavía no hay órdenes creadas." description="Selecciona un suministro para crear una orden." /> : null}{totalPages > 1 ? <PaginationControls className="admin-pagination" label="Paginación de órdenes recientes" page={page} totalPages={totalPages} onPrevious={() => onPageChange(page - 1)} onNext={() => onPageChange(page + 1)} /> : null}</section>;
}

function OrderRow({ order, selected, onSelect }: { order: WorkOrder; selected: boolean; onSelect: () => void }) { return <button type="button" className={selected ? "order-index-item order-index-item--selected" : "order-index-item"} onClick={onSelect}><span><strong>Orden de corte · {order.context?.customerName ?? order.accountId ?? "Suministro"}</strong><small>{order.assignedTechnicianId ? `Asignada a ${order.assignedTechnicianName ?? "Técnico asignado"}` : "Sin técnico asignado"} · {formatAdminDate(order.createdAt)}</small></span><span className={`large-status order-status-label large-status--${adminOrderStatusTone(order)}`}>{adminOrderStatusLabel(order)}</span></button>; }
