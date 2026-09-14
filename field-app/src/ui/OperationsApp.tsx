import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateOperationId, type AuditEvent, type DebtorRecord, type Session, type WorkOrder } from "../domain";
import type { OperationsAuthorityPort } from "../ports";
import { IconCheck, IconSearch } from "./Icons";

interface OperationsAppProps {
  authority: OperationsAuthorityPort;
  session: Session;
  onLogout: () => void;
  technicianId?: string;
}

interface SearchFilters {
  query: string;
  area: string;
  locality: string;
  route: string;
  minMonthsPending: string;
  supplyStatus: string;
}

interface OrderCreationDialog {
  mode: "single" | "batch";
  debtorIds: string[];
}

type MessageTone = "info" | "success" | "error";
type SupplyDataIconKind = "client" | "address" | "account" | "circuit" | "supply" | "area" | "meter" | "status" | "route" | "tariff" | "coordinates" | "phone";

const DEFAULT_SEARCH_FILTERS: SearchFilters = { query: "", area: "", locality: "", route: "", minMonthsPending: "2", supplyStatus: "A" };
export const ADMIN_ORDERS_PAGE_SIZE = 4;
export const ADMIN_SUPPLIES_PAGE_SIZE = 7;

export function getAdminOrderPage<T>(items: readonly T[], requestedPage: number, pageSize = ADMIN_ORDERS_PAGE_SIZE): { items: T[]; page: number; totalPages: number } {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : ADMIN_ORDERS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages);
  const start = (page - 1) * safePageSize;
  return { items: items.slice(start, start + safePageSize), page, totalPages };
}

export function formatAdminCoordinates(latitude?: number, longitude?: number): string | undefined { return latitude !== undefined && longitude !== undefined ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : undefined; }

export function OperationsApp({ authority, session, onLogout, technicianId }: OperationsAppProps) {
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_SEARCH_FILTERS });
  const [selectedDebtor, setSelectedDebtor] = useState("");
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<string[]>([]);
  const [orderCreationDialog, setOrderCreationDialog] = useState<OrderCreationDialog>();
  const [selectedOrder, setSelectedOrder] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [suppliesPage, setSuppliesPage] = useState(1);
  const [selectedTechnician, setSelectedTechnician] = useState(technicianId ?? "tech-camila");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const refreshSequence = useRef(0);
  const orderDetailRef = useRef<HTMLDivElement>(null);

  async function refresh(nextFilters = filters) {
    const sequence = ++refreshSequence.current;
    const [nextDebtors, nextOrders, nextAudit] = await Promise.all([
      authority.findDebtors({ query: nextFilters.query, area: nextFilters.area, locality: nextFilters.locality, route: nextFilters.route, minMonthsPending: parseMinMonths(nextFilters.minMonthsPending), supplyStatus: nextFilters.supplyStatus, session }),
      authority.listOrders(session),
      authority.listAudit({ session, includeRejected: true }),
    ]);
    if (sequence !== refreshSequence.current) return;
    setDebtors(nextDebtors);
    setOrders(nextOrders);
    setAudit(nextAudit);
    setOrdersPage(1);
    setSuppliesPage(1);
    if (selectedDebtor && !nextDebtors.some((debtor) => debtor.debtorId === selectedDebtor)) setSelectedDebtor("");
    setSelectedDebtorIds((current) => current.filter((debtorId) => nextDebtors.some((debtor) => debtor.debtorId === debtorId)));
    if (selectedOrder && !nextOrders.some((order) => order.orderId === selectedOrder)) setSelectedOrder("");
  }

  function notify(text: string, tone: MessageTone = "info"): void {
    setMessage(text);
    setMessageTone(tone);
  }

  async function loadAdminData(nextFilters = filters): Promise<void> {
    setLoading(true);
    setLoadError("");
    try {
      await refresh(nextFilters);
    } catch (error) {
      setLoadError(readableError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAdminData(); }, [session]);

  useEffect(() => {
    if (!selectedOrder || !orderDetailRef.current) return;
    orderDetailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedOrder, orders.length]);

  async function search(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setLoadError("");
    setSearching(true);
    try { await refresh(filters); } catch (error) { const text = readableError(error); setLoadError(text); notify(text, "error"); } finally { setSearching(false); }
  }

  async function clearFilters(): Promise<void> {
    setFilters({ ...DEFAULT_SEARCH_FILTERS });
    setSelectedDebtor("");
    setSelectedDebtorIds([]);
    setMessage("");
    setLoadError("");
    setSearching(true);
    try { await refresh(DEFAULT_SEARCH_FILTERS); } catch (error) { const text = readableError(error); setLoadError(text); notify(text, "error"); } finally { setSearching(false); }
  }

  function openSingleOrderDialog(event: FormEvent): void {
    event.preventDefault();
    if (!selectedDebtor) return notify("Seleccione un suministro antes de crear la orden.", "error");
    setOrderCreationDialog({ mode: "single", debtorIds: [selectedDebtor] });
  }

  function openBatchOrderDialog(): void {
    if (!selectedDebtorIds.length) return notify("Seleccione al menos un suministro para preparar el lote.", "error");
    setOrderCreationDialog({ mode: "batch", debtorIds: [...selectedDebtorIds] });
  }

  async function assignCreatedOrders(createdOrders: WorkOrder[]): Promise<void> {
    for (const order of createdOrders) {
      await authority.assignOrder({ operationId: generateOperationId("assign-order"), orderId: order.orderId, technicianId: selectedTechnician, expectedOrderVersion: order.version ?? 0, session });
    }
  }

  async function confirmOrderCreation(): Promise<void> {
    if (!orderCreationDialog) return;
    let createdOrders: WorkOrder[] = [];
    setBusy(true);
    try {
      if (orderCreationDialog.mode === "single") {
        const order = await authority.createOrder({ operationId: generateOperationId("create-order"), debtorId: orderCreationDialog.debtorIds[0], purpose: "CUT", session });
        createdOrders = [order];
        setOrderCreationDialog(undefined);
        await assignCreatedOrders([order]);
        setSelectedOrder(order.orderId);
        notify("Orden creada y asignada al técnico seleccionado.", "success");
      } else {
        const result = await authority.createOrdersBatch({ batchId: generateOperationId("create-order-batch"), debtorIds: orderCreationDialog.debtorIds, purpose: "CUT", session });
        createdOrders = result.created;
        setOrderCreationDialog(undefined);
        await assignCreatedOrders(result.created);
        if (result.created[0]) {
          setSelectedDebtor(result.created[0].debtorId ?? "");
          setSelectedOrder(result.created[0].orderId);
        }
        notify(`Lote creado y asignado: ${result.created.length} órdenes${result.skipped.length ? `, ${result.skipped.length} omitidas por validación o duplicado` : ""}.`, "success");
        setSelectedDebtorIds([]);
      }
      await refresh();
    } catch (error) {
      setOrderCreationDialog(undefined);
      if (createdOrders.length) {
        setSelectedOrder(createdOrders[0].orderId);
        notify(`Se crearon ${createdOrders.length} órdenes, pero no pudimos completar todas las asignaciones. Revise el detalle y reintente.`, "error");
        await refresh();
      } else {
        notify(readableError(error), "error");
      }
    } finally { setBusy(false); }
  }

  function selectDebtor(debtorId: string): void {
    setSelectedDebtor(debtorId);
    setSelectedOrder("");
  }

  function toggleDebtor(debtorId: string): void {
    setSelectedDebtorIds((current) => current.includes(debtorId) ? current.filter((id) => id !== debtorId) : [...current, debtorId]);
  }

  function toggleAllDebtors(): void {
    setSelectedDebtorIds((current) => current.length === debtors.length ? [] : debtors.map((debtor) => debtor.debtorId));
  }

  function prepareBatch(): void {
    openBatchOrderDialog();
  }

  const selectedDebtorRecord = debtors.find((debtor) => debtor.debtorId === selectedDebtor);
  const selectedOrderRecord = orders.find((order) => order.orderId === selectedOrder);
  const activeOrderForSupply = selectedDebtorRecord ? orders.find((order) => isActiveOrder(order) && (order.debtorId === selectedDebtorRecord.debtorId || order.accountId === selectedDebtorRecord.accountId)) : undefined;
  const generated = orders.filter((order) => order.status === "GENERADO").length;
  const executed = orders.filter((order) => order.status === "EJECUTADO").length;
  const cancelled = orders.filter((order) => order.status === "ANULADO").length;
  const unassigned = orders.filter((order) => !order.assignedTechnicianId).length;
  const assigned = orders.filter((order) => Boolean(order.assignedTechnicianId)).length;
  const auditTraceCount = audit.filter((event) => event.action !== "SYNC_OPERATION").length;
  const syncTraceCount = audit.filter((event) => event.action === "SYNC_OPERATION").length;
  const allDebtorsSelected = debtors.length > 0 && selectedDebtorIds.length === debtors.length;
  const areaOptions = filterOptions(debtors.map((debtor) => debtor.area), filters.area);
  const localityOptions = filterOptions(debtors.map((debtor) => debtor.locality), filters.locality);
  const routeOptions = filterOptions(debtors.map((debtor) => debtor.route), filters.route);
  const statusOptions = filterOptions(debtors.map((debtor) => debtor.supplyStatus ?? ""), filters.supplyStatus);
  const recentOrdersPage = getAdminOrderPage(orders, ordersPage);
  const suppliesPageData = getAdminOrderPage(debtors, suppliesPage, ADMIN_SUPPLIES_PAGE_SIZE);

  return (
    <div className="operations-app">
      <div className="admin-topbar">
        <div className="admin-topbar__inner">
          <div className="admin-brand-lockup">
            <span className="admin-brand-mark" aria-hidden="true" />
            <strong>SEPSA</strong>
            <span>Sistema de Operaciones</span>
          </div>
          <div className="admin-topbar__tools">
            <span className="admin-environment"><span className="admin-environment__dot" aria-hidden="true" />Administración <strong>SIMULATED</strong></span>
            <span className="admin-notification" role="img" aria-label="Notificaciones" />
            <span className="admin-avatar" aria-hidden="true">{initials(session.displayName ?? session.username)}</span>
            <div className="admin-user-summary"><strong>{session.displayName ?? session.username}</strong><span>Admin</span></div>
            <button className="admin-logout-link" type="button" onClick={onLogout}>Cerrar sesión</button>
          </div>
        </div>
      </div>
       <header className="operations-header admin-header">
         <div className="admin-brand">
           <h1>Centro de control de órdenes de corte</h1>
           <p>Busca suministros con mora, genera órdenes y asigna técnicos.</p>
         </div>
       </header>

      {message ? <div className={`message message--${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</div> : null}

      <main className="operations-main">
        <section className="admin-summary" aria-label="Resumen de órdenes">
          <div className="overview-stats">
            <Stat label="Generadas" value={generated} tone="ready" />
            <Stat label="Sin asignar" value={unassigned} tone="review" />
            <Stat label="Asignadas" value={assigned} tone="active" />
            <Stat label="Ejecutadas" value={executed} tone="done" />
            <Stat label="Anuladas" value={cancelled} tone="muted" />
            <Stat label="Trazas" value={audit.length} tone="traces" detail={`${auditTraceCount} auditoría · ${syncTraceCount} sincronización`} />
          </div>
        </section>

        <div className="operations-grid admin-workspace">
          <section className="panel operations-search" aria-labelledby="supplies-title">
            <div className="panel-heading"><span className="panel-heading__icon panel-heading__icon--list" aria-hidden="true" /><div><span className="eyebrow">Buscar morosos</span><h2 id="supplies-title">Buscar morosos</h2><p className="panel-subtitle">Busca y selecciona un suministro para crear una orden de corte.</p></div><span className="count-badge">{debtors.length} resultados</span></div>
            <form className="admin-search-form admin-search-form--extended" onSubmit={search}>
              <label className="search-field search-field--large" htmlFor="admin-search"><IconSearch /><input id="admin-search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Buscar por cuenta, nombre o medidor" /></label>
              <div className="compact-filters">
                <label className="text-field"><span>Área</span><select value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}><option value="">Todas</option>{areaOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-field"><span>Localidad</span><select value={filters.locality} onChange={(event) => setFilters({ ...filters, locality: event.target.value })}><option value="">Todas</option>{localityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-field"><span>Ruta</span><select value={filters.route} onChange={(event) => setFilters({ ...filters, route: event.target.value })}><option value="">Todas</option>{routeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-field"><span>Facturas vencidas</span><input type="number" min="0" inputMode="numeric" value={filters.minMonthsPending} onChange={(event) => setFilters({ ...filters, minMonthsPending: event.target.value })} /></label>
              </div>
              <details className="more-filters"><summary>Más filtros</summary><label className="text-field"><span>Estado del suministro</span><select value={filters.supplyStatus} onChange={(event) => setFilters({ ...filters, supplyStatus: event.target.value })}><option value="">Todos</option>{statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></details>
               <div className="filter-actions"><button className="primary-action" type="submit" disabled={searching || busy}>{searching ? "Consultando…" : "Buscar morosos"}<span>→</span></button><button className="filter-reset" type="button" onClick={() => void clearFilters()} disabled={searching || busy}>Limpiar</button><button className="primary-action filter-select-all" type="button" onClick={toggleAllDebtors} disabled={!debtors.length || searching || busy}>{allDebtorsSelected ? "Quitar selección" : "Seleccionar todos"}<span>→</span></button>{selectedDebtorIds.length ? <button className="secondary-action filter-batch-action" type="button" onClick={prepareBatch} disabled={busy}>Crear y asignar ({selectedDebtorIds.length})<span>→</span></button> : null}</div>
            </form>

             <div className="results-heading"><span><strong>{loading ? "Consultando suministros…" : `${debtors.length} suministros encontrados`}</strong><small>Ordenados por deuda pendiente</small></span></div>
              {loading ? <AdminLoadingState /> : loadError && !debtors.length ? <AdminErrorState message={loadError} onRetry={() => void loadAdminData()} /> : <><div className="admin-record-list">{suppliesPageData.items.map((debtor, index) => <DebtorItem key={debtor.debtorId} debtor={debtor} position={(suppliesPageData.page - 1) * ADMIN_SUPPLIES_PAGE_SIZE + index + 1} selected={selectedDebtor === debtor.debtorId} checked={selectedDebtorIds.includes(debtor.debtorId)} onSelect={() => selectDebtor(debtor.debtorId)} onToggle={() => toggleDebtor(debtor.debtorId)} />)}</div>{suppliesPageData.totalPages > 1 ? <nav className="admin-pagination supply-pagination" aria-label="Paginación de suministros"><button type="button" onClick={() => setSuppliesPage(suppliesPageData.page - 1)} disabled={suppliesPageData.page === 1} aria-label="Suministros anteriores">‹</button><span>Página {suppliesPageData.page} de {suppliesPageData.totalPages}</span><button type="button" onClick={() => setSuppliesPage(suppliesPageData.page + 1)} disabled={suppliesPageData.page === suppliesPageData.totalPages} aria-label="Suministros siguientes">›</button></nav> : null}{loadError ? <AdminInlineError message={loadError} onRetry={() => void loadAdminData()} /> : null}{!debtors.length && !loadError ? <div className="empty-state"><strong>No encontramos suministros</strong><span>Ajusta la búsqueda y vuelve a consultar.</span></div> : null}</>}

          </section>

          <section className="panel operations-orders selected-supply-panel" aria-labelledby="selected-supply-title">
            {selectedDebtorRecord ? <SelectedSupplyPanel debtor={selectedDebtorRecord} activeOrder={activeOrderForSupply} busy={busy} onCreateOrder={openSingleOrderDialog} onViewOrder={(orderId) => setSelectedOrder(orderId)} /> : <EmptySupplyPanel />}
            <RecentOrdersPreview orders={recentOrdersPage.items} totalOrders={orders.length} selectedOrderId={selectedOrder} page={recentOrdersPage.page} totalPages={recentOrdersPage.totalPages} onSelect={(orderId) => setSelectedOrder(orderId)} onPageChange={setOrdersPage} />
          </section>
        </div>

         <div ref={orderDetailRef}><AdminOrderDetail order={selectedOrderRecord} audit={audit} /></div>
       </main>
       {orderCreationDialog ? <OrderCreationModal dialog={orderCreationDialog} debtors={debtors} selectedTechnician={selectedTechnician} technicianId={technicianId} busy={busy} onTechnicianChange={setSelectedTechnician} onCancel={() => setOrderCreationDialog(undefined)} onConfirm={() => void confirmOrderCreation()} /> : null}
     </div>
  );
}

function Stat({ label, value, tone, detail }: { label: string; value: number; tone: string; detail?: string }) { return <div className={`overview-stat overview-stat--${tone}`}><span className="overview-stat__icon" aria-hidden="true" /><div className="overview-stat__content"><span className={`status-mark status-mark--${tone}`}>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div></div>; }

function AdminLoadingState() {
  return <div className="admin-state-card admin-state-card--loading" aria-live="polite"><span className="admin-loading-mark" aria-hidden="true" /><strong>Cargando suministros</strong><span>Estamos consultando información operativa.</span></div>;
}

function AdminErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="admin-state-card admin-state-card--error" role="alert"><strong>No pudimos cargar los suministros</strong><span>{message}</span><button className="secondary-action" type="button" onClick={onRetry}>Reintentar</button></div>;
}

function AdminInlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="admin-inline-error" role="alert"><span>{message}</span><button type="button" onClick={onRetry}>Reintentar</button></div>;
}

function DebtorItem({ debtor, position, selected, checked, onSelect, onToggle }: { debtor: DebtorRecord; position: number; selected: boolean; checked: boolean; onSelect: () => void; onToggle: () => void }) {
  return <article className={selected ? "admin-record admin-record--selected" : "admin-record"}>
    <span className="record-position" aria-hidden="true">{position}</span>
    <label className="record-select" title="Seleccionar para lote"><input type="checkbox" checked={checked} onChange={onToggle} /><span className="sr-only">Lote</span></label>
    <div className="record-review" role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}><span className="record-identity"><strong>{debtor.customerName}</strong><small>Cuenta {debtor.accountId} · Medidor {debtor.meterId}</small></span><span className="record-address"><strong>{debtor.address || `${debtor.locality}`}</strong><small>Ruta {debtor.route}</small></span><span className="record-debt"><b>Bs {formatMoney(debtor.debtCents)}</b><small>{debtor.monthsPending} facturas</small></span><span className="record-state">{debtor.supplyStatus ?? "Estado no disponible"}</span></div>
  </article>;
}

function EmptySupplyPanel() {
  return <div className="selected-supply-content selected-supply-content--empty">
    <div className="selected-supply-heading"><span className="panel-heading__icon panel-heading__icon--document" aria-hidden="true" /><div><span className="eyebrow">Crear y asignar orden de corte</span><h2 id="selected-supply-title">Crear y asignar orden de corte</h2><p>Verifica la información del suministro y genera la orden.</p></div></div>
    <SupplyDataCard />
    <div className="create-order-zone create-order-zone--empty"><div className="create-order-summary"><span className="eyebrow">Crear y asignar orden de corte</span><strong>Selecciona un suministro moroso</strong><span>La acción estará disponible después de revisar sus datos.</span></div><button className="primary-action" type="button" disabled>Crear orden de corte<span>→</span></button></div>
  </div>;
}

function SupplyDataCard({ debtor }: { debtor?: DebtorRecord }) {
  return <section className="supply-context-card"><h3>Datos del suministro seleccionado</h3><div className="supply-data-grid">
    <Data label="Cliente" value={debtor?.customerName} icon="client" emptyValue="-" />
    <Data label="Dirección" value={debtor?.address} icon="address" emptyValue="-" />
    <Data label="Cuenta" value={debtor?.accountId} icon="account" emptyValue="-" />
    <Data label="Circuito" value={debtor?.circuit} icon="circuit" emptyValue="-" />
    <Data label="Suministro" value={debtor?.supplyId} icon="supply" emptyValue="-" />
    <Data label="Área / localidad" value={debtor ? joinAdminValues(debtor.area, debtor.locality) : undefined} icon="area" emptyValue="-" />
    <Data label="Medidor / marca" value={debtor ? joinAdminValues(debtor.meterId, debtor.meterBrand) : undefined} icon="meter" emptyValue="-" />
    <Data label="Estado del cliente" value={debtor?.supplyStatus} icon="status" emptyValue="-" />
    <Data label="Ruta / orden" value={debtor ? joinAdminValues(debtor.route, debtor.routeOrder) : undefined} icon="route" emptyValue="-" />
    <Data label="Tarifa / estado" value={debtor ? joinAdminValues(debtor.tariff, debtor.supplyStatus) : undefined} icon="tariff" emptyValue="-" />
    <Data label="Coordenadas (catastro)" value={debtor ? formatAdminCoordinates(debtor.cadastralLatitude, debtor.cadastralLongitude) : undefined} icon="coordinates" technical emptyValue="-" />
    <Data label="Teléfono de contacto" value={debtor?.contactPhone} icon="phone" emptyValue="-" />
  </div></section>;
}

function SelectedSupplyPanel({ debtor, activeOrder, busy, onCreateOrder, onViewOrder }: { debtor: DebtorRecord; activeOrder?: WorkOrder; busy: boolean; onCreateOrder: (event: FormEvent) => void; onViewOrder: (orderId: string) => void }) {
    return <div className="selected-supply-content">
      <div className="selected-supply-heading"><span className="panel-heading__icon panel-heading__icon--document" aria-hidden="true" /><div><span className="eyebrow">Crear y asignar orden de corte</span><h2 id="selected-supply-title">Crear y asignar orden de corte</h2><p>Verifica la información del suministro y genera la orden.</p></div></div>
      <SupplyDataCard debtor={debtor} />

     <form className={activeOrder ? "supply-order-action supply-order-action--active" : "supply-order-action"} onSubmit={activeOrder ? undefined : onCreateOrder}><div className="create-order-summary"><span className="eyebrow">{activeOrder ? "Orden de corte activa" : "Acción disponible"}</span><strong>{activeOrder ? "Este suministro ya tiene una orden activa" : "Crear una orden de corte"}</strong><span>{activeOrder ? `Creada ${formatRelativeDate(activeOrder.createdAt)} · ${activeOrder.assignedTechnicianId ? `Asignada a ${technicianName(activeOrder.assignedTechnicianId)}` : "Sin técnico asignado"}` : "Confirma el suministro y asigna un técnico antes de crearla."}</span></div><button className={activeOrder ? "primary-action primary-action--success" : "primary-action"} type={activeOrder ? "button" : "submit"} onClick={activeOrder ? () => onViewOrder(activeOrder.orderId) : undefined} disabled={busy}>{activeOrder ? "Ver orden de corte" : "Crear orden de corte"}<span>→</span></button></form>

    </div>;
}

function OrderCreationModal({ dialog, debtors, selectedTechnician, technicianId, busy, onTechnicianChange, onCancel, onConfirm }: { dialog: OrderCreationDialog; debtors: DebtorRecord[]; selectedTechnician: string; technicianId?: string; busy: boolean; onTechnicianChange: (technicianId: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const selectedDebtors = dialog.debtorIds.map((debtorId) => debtors.find((debtor) => debtor.debtorId === debtorId)).filter((debtor): debtor is DebtorRecord => Boolean(debtor));
  const isBatch = dialog.mode === "batch";
  return <div className="admin-modal-backdrop"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title"><div className="admin-modal__header"><div><span className="eyebrow">{isBatch ? "Creación masiva" : "Nueva orden"}</span><h2 id="order-modal-title">{isBatch ? "Crear y asignar órdenes" : "Crear y asignar orden de corte"}</h2></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Cerrar">×</button></div><p className="admin-modal__intro">Revisa el suministro y selecciona el técnico responsable antes de confirmar.</p><div className="admin-modal__supply-list">{selectedDebtors.map((debtor) => <article className="admin-modal__supply" key={debtor.debtorId}><strong>{debtor.customerName}</strong><span>{debtor.supplyId} · Cuenta {debtor.accountId}</span><small>{debtor.address}</small></article>)}</div><label className="text-field"><span>Asignar a técnico</span><select value={selectedTechnician} onChange={(event) => onTechnicianChange(event.target.value)}>{technicianId ? <option value={technicianId}>Técnico de campo</option> : <><option value="tech-camila">Camila Rojas</option><option value="tech-diego">Diego Vargas</option><option value="tech-juan">Juan Vargas</option></>}</select></label><div className="admin-modal__actions"><button className="secondary-action" type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="primary-action" type="button" onClick={onConfirm} disabled={busy || !selectedDebtors.length}>{busy ? "Creando…" : isBatch ? "Aceptar y crear órdenes" : "Aceptar y crear orden"}<span>→</span></button></div></section></div>;
}

function RecentOrdersPreview({ orders, totalOrders, selectedOrderId, page, totalPages, onSelect, onPageChange }: { orders: WorkOrder[]; totalOrders: number; selectedOrderId: string; page: number; totalPages: number; onSelect: (orderId: string) => void; onPageChange: (page: number) => void }) {
  return <section className="orders-index admin-recent-orders" aria-labelledby="recent-orders-title"><div className="admin-recent-orders__heading"><div><span className="eyebrow">Actividad</span><h3 id="recent-orders-title">Órdenes recientes</h3></div><span className="admin-recent-orders__count">{totalOrders}</span></div><div className="order-index-list">{orders.map((order) => <OrderRow key={order.orderId} order={order} selected={selectedOrderId === order.orderId} onSelect={() => onSelect(order.orderId)} />)}</div>{!totalOrders ? <p className="activity-empty">Todavía no hay órdenes creadas.</p> : null}{totalPages > 1 ? <nav className="admin-pagination" aria-label="Paginación de órdenes recientes"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Página anterior">‹</button><span>Página {page} de {totalPages}</span><button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="Página siguiente">›</button></nav> : null}</section>;
}

function OrderRow({ order, selected, onSelect }: { order: WorkOrder; selected: boolean; onSelect: () => void }) { return <button type="button" className={selected ? "order-index-item order-index-item--selected" : "order-index-item"} onClick={onSelect}><span><strong>Orden de corte · {order.context?.customerName ?? order.accountId ?? "Suministro"}</strong><small>{order.assignedTechnicianId ? `Asignada a ${order.assignedTechnicianName ?? technicianName(order.assignedTechnicianId)}` : "Sin técnico asignado"} · {formatDate(order.createdAt)}</small></span><span className={`large-status large-status--${statusTone(order)}`}>{orderStatusLabel(order)}</span></button>; }

function AdminOrderDetail({ order, audit }: { order?: WorkOrder; audit: AuditEvent[] }) {
  const [showFullAudit, setShowFullAudit] = useState(false);
  if (!order) return null;
  const context = order.context;
  const orderAudit = audit.filter((event) => event.orderId === order.orderId);
  const latestAudit = orderAudit[orderAudit.length - 1];
   return <section className="panel admin-order-detail"><div className="detail-topline"><div><span className="eyebrow">Revisar orden</span><h2>Orden de corte · {context?.customerName ?? order.accountId ?? "Suministro"}</h2></div><span className={`large-status large-status--${statusTone(order)}`}>{orderStatusLabel(order)}</span></div><div className="detail-meta"><TechnicalId label="CUC" value={order.cuc ?? order.orderId} /><span>Creada: {formatLongDate(order.createdAt)}</span></div>
      {context ? <><section className="order-summary-grid"><Data label="Cliente" value={context.customerName} /><Data label="Cuenta" value={context.accountId} /><Data label="Medidor" value={joinAdminValues(context.meterId, context.meterBrand)} /><Data label="Deuda" value={`Bs ${formatMoney(context.debtCents)}`} emphasis /><Data label="Técnico asignado" value={order.assignedTechnicianName ?? (order.assignedTechnicianId ? technicianName(order.assignedTechnicianId) : "Sin asignar")} /><Data label="Estado" value={orderStatusLabel(order)} /><Data label="Tarifa / estado" value={joinAdminValues(context.tariff, context.supplyStatus)} /><Data label="Circuito" value={context.circuit} /><Data label="Ruta / orden" value={joinAdminValues(context.route, context.routeOrder)} /><Data label="Dirección" value={context.address} /><Data label="Teléfono" value={context.contactPhone} /><Data label="Coordenadas catastrales" value={formatAdminCoordinates(context.cadastralLatitude, context.cadastralLongitude)} technical /></section><DebtTable entries={context.kardex} total={context.debtCents} /><section className="additional-info"><div><span>Plan de pago</span><strong>{yesNo(context.paymentPlan)}</strong></div><div><span>Reclamos</span><strong>{yesNo(context.claims)}</strong></div><div><span>Fecha de suspensión</span><strong>{formatDate(context.suspensionDate)}</strong></div><div><span>Reconexión manual</span><strong>{yesNo(context.reconnectionManual)}</strong></div></section></> : <div className="context-missing">Contexto operativo no disponible en esta orden.</div>}
     <section className="audit-section"><div className="audit-heading"><div><span className="eyebrow">Trazabilidad</span><h3>Actividad reciente</h3></div><span className="audit-count">{orderAudit.length} {orderAudit.length === 1 ? "evento" : "eventos"}</span><button className="filter-reset" type="button" onClick={() => setShowFullAudit((current) => !current)}>{showFullAudit ? "Ocultar detalle" : "Ver trazabilidad completa"}</button></div>{latestAudit ? <article className="recent-activity"><IconCheck /><div><strong>{humanAuditAction(latestAudit.action)}</strong><span>{formatLongDate(latestAudit.occurredAt)} · {latestAudit.actorRole === "ADMIN" ? "Administrador" : latestAudit.actorId} · {latestAudit.result === "accepted" ? "Aceptada" : "Rechazada"}</span></div></article> : <p className="activity-empty">Todavía no hay actividad registrada para esta orden.</p>}{showFullAudit ? <div className="audit-detail-list">{orderAudit.map((event) => <article className="audit-entry" key={event.auditId}><strong>{humanAuditAction(event.action)}</strong><span>{event.actorRole === "ADMIN" ? "Administrador" : event.actorId} · {formatLongDate(event.occurredAt)} · {event.result === "accepted" ? "Aceptada" : "Rechazada"}</span>{event.operationId ? <TechnicalId label="Operación" value={event.operationId} /> : null}</article>)}</div> : null}</section>
  </section>;
}

function DebtTable({ entries, total }: { entries: DebtorRecord["kardex"]; total: number }) { return <section className="debt-section"><div className="detail-section-heading"><div><span className="eyebrow">Deuda asociada</span><p>Facturas pendientes que originan esta orden</p></div><strong>Total Bs {formatMoney(total)}</strong></div><div className="debt-table"><div className="debt-row debt-row--header"><span>Periodo</span><span>Facturación</span><span>Monto</span><span>Estado</span><span>Días mora</span><span>Origen</span></div>{entries.map((entry) => <div className="debt-row" key={entry.entryId}><span>{entry.period || "Dato no disponible"}</span><span>{entry.billingDate ? formatDate(entry.billingDate) : "Dato no disponible"}</span><span>Bs {formatMoney(entry.amountCents)}</span><span>{entry.status === "PENDING" ? "Pendiente" : "Pagada"}</span><span>{entry.daysLate ?? "Dato no disponible"}</span><span className="technical-cell">{entry.invoiceOrigin ?? "Dato no disponible"}</span></div>)}</div></section>; }

function AdminDataIcon({ kind }: { kind: SupplyDataIconKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="admin-data-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {kind === "client" || kind === "status" ? <><circle cx="12" cy="8" r="3" /><path d="M5 20c.8-3.2 3.1-5 7-5s6.2 1.8 7 5" /></> : null}
    {kind === "address" || kind === "coordinates" ? <><path d="M19 10c0 4.8-7 10-7 10S5 14.8 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></> : null}
    {kind === "account" ? <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16M8 14h4" /></> : null}
    {kind === "circuit" ? <><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="m8 12 8-6M8 12l8 6" /></> : null}
    {kind === "supply" ? <><path d="M9 4v6M15 4v6M7 10h10v3a5 5 0 0 1-10 0v-3ZM12 18v2" /></> : null}
    {kind === "area" ? <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></> : null}
    {kind === "meter" ? <><path d="M5 16a7 7 0 1 1 14 0" /><path d="m12 12 3-3M7 19h10" /></> : null}
    {kind === "route" ? <><circle cx="6" cy="18" r="2" /><path d="M8 18h7a4 4 0 0 0 0-8H7" /><path d="m9 7-3 3 3 3" /></> : null}
    {kind === "tariff" ? <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></> : null}
    {kind === "phone" ? <path d="M7 4h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5v3c0 1-1 2-2 2C11.4 19.6 4.4 12.6 4 6c0-1 1-2 3-2Z" /> : null}
  </svg>;
}

function Data({ label, value, technical = false, emphasis = false, icon, emptyValue = "Dato no disponible" }: { label: string; value?: string | number; technical?: boolean; emphasis?: boolean; icon?: SupplyDataIconKind; emptyValue?: string }) {
  const className = ["data-point", technical ? "data-point--technical" : "", emphasis ? "data-point--emphasis" : "", icon ? "data-point--with-icon" : ""].filter(Boolean).join(" ");
  return <div className={className}>{icon ? <AdminDataIcon kind={icon} /> : null}<div className="data-point__content"><span>{label}</span><strong>{value === undefined || value === "" ? emptyValue : value}</strong></div></div>;
}

function TechnicalId({ label, value }: { label: string; value: string }) { const [copied, setCopied] = useState(false); const copy = async () => { try { await navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); } }; return <span className="technical-id" title={value}>{label}: {shortIdentifier(value)} <button type="button" onClick={() => void copy()} aria-label={`Copiar ${label}`}>{copied ? "Copiado" : "Copiar"}</button></span>; }

function formatMoney(cents: number): string { return (cents / 100).toFixed(2); }
function formatDate(value?: string): string { if (!value) return "Dato no disponible"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Dato no disponible" : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(date); }
function formatLongDate(value?: string): string { if (!value) return "Dato no disponible"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Dato no disponible" : new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date).replace(",", " ·"); }
function formatRelativeDate(value?: string): string { if (!value) return "en fecha no disponible"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "en fecha no disponible"; return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date).replace(",", " ·"); }
function shortIdentifier(value: string): string { return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function yesNo(value?: boolean): string { return value === undefined ? "Dato no disponible" : value ? "Sí" : "No"; }
function isActiveOrder(order: WorkOrder): boolean { return order.status === "GENERADO"; }
function orderStatusLabel(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "Físico incierto"; return order.status === "GENERADO" ? "Generada" : order.status === "EJECUTADO" ? "Ejecutada" : order.status === "RECONEXIÓN" ? "Reconectada" : "Anulada"; }
function statusTone(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "review"; return order.status === "GENERADO" ? "ready" : order.status === "EJECUTADO" ? "done" : order.status === "ANULADO" ? "muted" : "active"; }
function technicianName(id: string): string { return id === "tech-camila" ? "Camila Rojas" : id === "tech-diego" ? "Diego Vargas" : id === "tech-juan" ? "Juan Vargas" : "Técnico de campo"; }
function humanAuditAction(action: string): string { return action === "ORDER_CREATED" ? "Orden creada" : action === "ORDER_ASSIGNED" ? "Técnico asignado" : action === "SYNC_OPERATION" ? "Operación sincronizada" : action.replaceAll("_", " "); }
function readableError(error: unknown): string { return error instanceof Error ? error.message : "No pudimos completar la operación administrativa."; }
function filterOptions(values: string[], selected: string): string[] { return [...new Set([...values, selected].map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "es")); }
function parseMinMonths(value: string): number | undefined { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined; }
function initials(value: string): string { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "AD"; }
function joinAdminValues(...values: Array<string | number | undefined>): string | undefined { const available = values.filter((value) => value !== undefined && value !== ""); return available.length ? available.join(" · ") : undefined; }
