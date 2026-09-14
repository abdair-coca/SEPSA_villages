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

interface BatchPreview {
  debtorIds: string[];
}

type StepState = "complete" | "current" | "pending";

const DEFAULT_SEARCH_FILTERS: SearchFilters = { query: "", area: "", locality: "", route: "", minMonthsPending: "2", supplyStatus: "A" };

export function OperationsApp({ authority, session, onLogout, technicianId }: OperationsAppProps) {
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_SEARCH_FILTERS });
  const [selectedDebtor, setSelectedDebtor] = useState("");
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<string[]>([]);
  const [batchPreview, setBatchPreview] = useState<BatchPreview>();
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState(technicianId ?? "tech-camila");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const refreshSequence = useRef(0);

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
    if (selectedDebtor && !nextDebtors.some((debtor) => debtor.debtorId === selectedDebtor)) setSelectedDebtor("");
    setSelectedDebtorIds((current) => current.filter((debtorId) => nextDebtors.some((debtor) => debtor.debtorId === debtorId)));
    if (selectedOrder && !nextOrders.some((order) => order.orderId === selectedOrder)) setSelectedOrder("");
  }

  useEffect(() => { void refresh().catch((error) => setMessage(readableError(error))); }, [session]);

  async function search(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSearching(true);
    try { await refresh(filters); } catch (error) { setMessage(readableError(error)); } finally { setSearching(false); }
  }

  async function clearFilters(): Promise<void> {
    setFilters({ ...DEFAULT_SEARCH_FILTERS });
    setSelectedDebtor("");
    setSelectedDebtorIds([]);
    setBatchPreview(undefined);
    setMessage("");
    setSearching(true);
    try { await refresh(DEFAULT_SEARCH_FILTERS); } catch (error) { setMessage(readableError(error)); } finally { setSearching(false); }
  }

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    if (!selectedDebtor) return setMessage("Seleccione un suministro antes de crear la orden.");
    setBusy(true);
    try {
      const order = await authority.createOrder({ operationId: generateOperationId("create-order"), debtorId: selectedDebtor, purpose: "CUT", session });
      setSelectedOrder(order.orderId);
      setMessage("Orden creada. Ahora puede asignar un técnico.");
      await refresh();
    } catch (error) { setMessage(readableError(error)); } finally { setBusy(false); }
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
    if (!selectedDebtorIds.length) { setMessage("Seleccione al menos un suministro para preparar el lote."); return; }
    setMessage("");
    setBatchPreview({ debtorIds: [...selectedDebtorIds] });
  }

  async function confirmBatch(): Promise<void> {
    if (!batchPreview) return;
    setBusy(true);
    try {
      const result = await authority.createOrdersBatch({ batchId: generateOperationId("create-order-batch"), debtorIds: batchPreview.debtorIds, purpose: "CUT", session });
      setBatchPreview(undefined);
      setSelectedDebtorIds([]);
      setMessage(`Lote creado: ${result.created.length} órdenes generadas${result.skipped.length ? `, ${result.skipped.length} omitidas por validación o duplicado` : ""}.`);
      await refresh();
    } catch (error) { setMessage(readableError(error)); } finally { setBusy(false); }
  }

  async function assignOrder(event: FormEvent) {
    event.preventDefault();
    const order = orders.find((candidate) => candidate.orderId === selectedOrder);
    if (!order) return setMessage("Seleccione una orden para asignar.");
    setBusy(true);
    try {
      await authority.assignOrder({ operationId: generateOperationId("assign-order"), orderId: order.orderId, technicianId: selectedTechnician, expectedOrderVersion: order.version ?? 0, session });
      setMessage("Orden asignada. El técnico puede descargarla en su jornada.");
      await refresh();
    } catch (error) { setMessage(readableError(error)); } finally { setBusy(false); }
  }

  const selectedDebtorRecord = debtors.find((debtor) => debtor.debtorId === selectedDebtor);
  const selectedOrderRecord = orders.find((order) => order.orderId === selectedOrder);
  const activeOrderForSupply = selectedDebtorRecord ? orders.find((order) => isActiveOrder(order) && (order.debtorId === selectedDebtorRecord.debtorId || order.accountId === selectedDebtorRecord.accountId)) : undefined;
  const generated = orders.filter((order) => order.status === "GENERADO").length;
  const executed = orders.filter((order) => order.status === "EJECUTADO").length;
  const cancelled = orders.filter((order) => order.status === "ANULADO").length;
  const unassigned = orders.filter((order) => !order.assignedTechnicianId).length;
  const assigned = orders.filter((order) => Boolean(order.assignedTechnicianId)).length;
  const selectedDebtors = debtors.filter((debtor) => selectedDebtorIds.includes(debtor.debtorId));
  const selectedDebtTotal = selectedDebtors.reduce((total, debtor) => total + debtor.debtCents, 0);
  const allDebtorsSelected = debtors.length > 0 && selectedDebtorIds.length === debtors.length;
  const areaOptions = filterOptions(debtors.map((debtor) => debtor.area), filters.area);
  const localityOptions = filterOptions(debtors.map((debtor) => debtor.locality), filters.locality);
  const routeOptions = filterOptions(debtors.map((debtor) => debtor.route), filters.route);
  const statusOptions = filterOptions(debtors.map((debtor) => debtor.supplyStatus ?? ""), filters.supplyStatus);
  const flowOrder = selectedOrderRecord ?? activeOrderForSupply;

  return (
    <div className="operations-app">
      <header className="operations-header admin-header">
        <div className="admin-brand">
          <span className="admin-brand__eyebrow">SEPSA · Sistema de Operaciones</span>
          <h1>Centro de control de órdenes de corte</h1>
          <p>Busca suministros con mora, genera órdenes y asigna técnicos.</p>
        </div>
        <div className="admin-session">
          <span className="demo-badge">Ambiente de demostración</span>
          <div className="admin-session__user"><span>Usuario actual</span><strong>{session.displayName ?? session.username}</strong></div>
          <button className="secondary-action secondary-action--compact" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </header>

      {message ? <div className="message message--info" role="status">{message}</div> : null}

      <main className="operations-main">
        <section className="admin-summary" aria-label="Resumen de órdenes">
          <div className="admin-summary__intro"><span className="eyebrow">Resumen operativo</span><p>Estado actual de órdenes de corte</p></div>
          <div className="overview-stats">
            <Stat label="Generadas" value={generated} tone="ready" />
            <Stat label="Sin asignar" value={unassigned} tone="review" />
            <Stat label="Asignadas" value={assigned} tone="active" />
            <Stat label="Ejecutadas" value={executed} tone="done" />
            <Stat label="Anuladas" value={cancelled} tone="muted" />
          </div>
        </section>

        <section className="process-strip" aria-label="Flujo de creación de orden">
          <ProcessStep number="1" label="Buscar suministro" state={selectedDebtorRecord ? "complete" : "current"} />
          <ProcessStep number="2" label="Crear orden" state={!selectedDebtorRecord ? "pending" : flowOrder ? "complete" : "current"} />
          <ProcessStep number="3" label="Asignar técnico" state={!flowOrder ? "pending" : flowOrder.assignedTechnicianId ? "complete" : "current"} />
          <ProcessStep number="4" label="Revisar orden" state={!flowOrder ? "pending" : flowOrder.assignedTechnicianId ? "current" : "pending"} />
        </section>

        <div className="operations-grid admin-workspace">
          <section className="panel operations-search" aria-labelledby="supplies-title">
            <div className="panel-heading"><div><span className="eyebrow">Paso 1</span><h2 id="supplies-title">Suministros pendientes</h2><p className="panel-subtitle">Selecciona un suministro para revisar su deuda y generar una orden.</p></div><span className="count-badge">{debtors.length}</span></div>
            <form className="admin-search-form admin-search-form--extended" onSubmit={search}>
              <label className="search-field search-field--large" htmlFor="admin-search"><IconSearch /><input id="admin-search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Buscar por cuenta, nombre o medidor" /></label>
              <div className="compact-filters">
                <label className="text-field"><span>Área</span><select value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}><option value="">Todas</option>{areaOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-field"><span>Localidad</span><select value={filters.locality} onChange={(event) => setFilters({ ...filters, locality: event.target.value })}><option value="">Todas</option>{localityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-field"><span>Ruta</span><select value={filters.route} onChange={(event) => setFilters({ ...filters, route: event.target.value })}><option value="">Todas</option>{routeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-field"><span>Facturas vencidas</span><input type="number" min="0" inputMode="numeric" value={filters.minMonthsPending} onChange={(event) => setFilters({ ...filters, minMonthsPending: event.target.value })} /></label>
              </div>
              <details className="more-filters"><summary>Más filtros</summary><label className="text-field"><span>Estado del suministro</span><select value={filters.supplyStatus} onChange={(event) => setFilters({ ...filters, supplyStatus: event.target.value })}><option value="">Todos</option>{statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></details>
              <div className="filter-actions"><button className="primary-action" type="submit" disabled={searching || busy}>{searching ? "Consultando…" : "Buscar suministros"}<span>→</span></button><button className="filter-reset" type="button" onClick={() => void clearFilters()} disabled={searching || busy}>Limpiar</button></div>
            </form>

            <div className="results-heading"><span><strong>{debtors.length} suministros encontrados</strong><small>Ordenados por deuda pendiente</small></span></div>
            <div className="admin-record-list">{debtors.map((debtor) => <DebtorItem key={debtor.debtorId} debtor={debtor} selected={selectedDebtor === debtor.debtorId} checked={selectedDebtorIds.includes(debtor.debtorId)} onSelect={() => selectDebtor(debtor.debtorId)} onToggle={() => toggleDebtor(debtor.debtorId)} />)}</div>
            {!debtors.length ? <div className="empty-state"><strong>No encontramos suministros</strong><span>Ajusta la búsqueda y vuelve a consultar.</span></div> : null}

            <details className="batch-tools"><summary>Crear varias órdenes</summary><div className="selection-toolbar"><div><strong>{selectedDebtorIds.length ? `${selectedDebtorIds.length} seleccionados` : "Selecciona suministros para un lote"}</strong><span>La creación masiva mantiene validaciones e idempotencia.</span></div><button className="toolbar-action" type="button" onClick={toggleAllDebtors} disabled={!debtors.length}>{allDebtorsSelected ? "Quitar selección" : "Seleccionar todos"}</button></div>{selectedDebtorIds.length ? <div className={batchPreview ? "batch-command batch-command--ready" : "batch-command"}><div className="batch-command__summary"><strong>{batchPreview ? "Lote listo para confirmar" : `Crear órdenes para ${selectedDebtorIds.length} suministros`}</strong><span>Deuda referencial: Bs {formatMoney(selectedDebtTotal)}</span></div>{batchPreview ? <div className="batch-preview-actions"><button className="secondary-action" type="button" onClick={() => setBatchPreview(undefined)} disabled={busy}>Volver</button><button className="primary-action" type="button" onClick={() => void confirmBatch()} disabled={busy}>{busy ? "Creando…" : "Confirmar creación"}<span>→</span></button></div> : <button className="primary-action" type="button" onClick={prepareBatch}>Revisar lote<span>→</span></button>}{batchPreview ? <p>Las cuentas con una orden activa quedarán omitidas con causa.</p> : null}</div> : null}</details>
          </section>

          <section className="panel operations-orders selected-supply-panel" aria-labelledby="selected-supply-title">
            {!selectedDebtorRecord ? <div className="selection-empty"><span className="selection-empty__number">2</span><div><span className="eyebrow">Paso 2</span><h2 id="selected-supply-title">Suministro seleccionado</h2><p>Selecciona un suministro de la lista para revisar contexto, deuda y acción disponible.</p></div></div> : <SelectedSupplyPanel debtor={selectedDebtorRecord} activeOrder={activeOrderForSupply} selectedOrder={selectedOrderRecord} selectedTechnician={selectedTechnician} technicianId={technicianId} busy={busy} onCreateOrder={createOrder} onViewOrder={(orderId) => setSelectedOrder(orderId)} onAssignOrder={assignOrder} onTechnicianChange={setSelectedTechnician} />}
          </section>
        </div>

        <details className="orders-index"><summary>Órdenes creadas <span>{orders.length}</span></summary><div className="order-index-list">{orders.map((order) => <OrderRow key={order.orderId} order={order} selected={selectedOrder === order.orderId} onSelect={() => setSelectedOrder(order.orderId)} />)}</div></details>
        <AdminOrderDetail order={selectedOrderRecord} audit={audit} />
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="overview-stat"><span className={`status-mark status-mark--${tone}`}>{label}</span><strong>{value}</strong></div>; }

function ProcessStep({ number, label, state }: { number: string; label: string; state: StepState }) {
  return <div className={`process-step process-step--${state}`}><span className="process-step__number">{state === "complete" ? <IconCheck /> : number}</span><strong>{label}</strong><small>{state === "complete" ? "Completado" : state === "current" ? "Ahora" : "Pendiente"}</small></div>;
}

function DebtorItem({ debtor, selected, checked, onSelect, onToggle }: { debtor: DebtorRecord; selected: boolean; checked: boolean; onSelect: () => void; onToggle: () => void }) {
  return <article className={selected ? "admin-record admin-record--selected" : "admin-record"}>
    <div className="record-card-topline"><label className="record-select"><input type="checkbox" checked={checked} onChange={onToggle} /><span>Lote</span></label>{selected ? <span className="selected-badge">Seleccionado</span> : null}</div>
    <button type="button" className="record-review" onClick={onSelect}><strong>{debtor.customerName}</strong><span>Cuenta {debtor.accountId} · Medidor {debtor.meterId}</span><div className="record-debt"><b>Bs {formatMoney(debtor.debtCents)}</b><span>{debtor.monthsPending} facturas pendientes</span></div><span className="record-location">{debtor.locality} · Ruta {debtor.route}</span><span className="record-status">{debtor.supplyStatus ?? "Estado no disponible"}<em>Seleccionar</em></span></button>
  </article>;
}

function SelectedSupplyPanel({ debtor, activeOrder, selectedOrder, selectedTechnician, technicianId, busy, onCreateOrder, onViewOrder, onAssignOrder, onTechnicianChange }: { debtor: DebtorRecord; activeOrder?: WorkOrder; selectedOrder?: WorkOrder; selectedTechnician: string; technicianId?: string; busy: boolean; onCreateOrder: (event: FormEvent) => void; onViewOrder: (orderId: string) => void; onAssignOrder: (event: FormEvent) => void; onTechnicianChange: (technicianId: string) => void }) {
  const currentOrder = selectedOrder && (selectedOrder.debtorId === debtor.debtorId || selectedOrder.accountId === debtor.accountId) ? selectedOrder : undefined;
  const coordinates = debtor.cadastralLatitude !== undefined && debtor.cadastralLongitude !== undefined ? `${debtor.cadastralLatitude.toFixed(6)}, ${debtor.cadastralLongitude.toFixed(6)}` : undefined;
  return <div className="selected-supply-content">
    <div className="selected-supply-heading"><div><span className="eyebrow">Paso 2 · Suministro seleccionado</span><h2 id="selected-supply-title">{debtor.customerName}</h2><p>Revisa información operativa antes de crear una orden.</p></div><span className="status-mark status-mark--active">Activo</span></div>
    <div className="supply-sections">
      <section className="supply-section"><h3>Identificación</h3><div className="supply-data-grid"><Data label="Cuenta" value={debtor.accountId} /><Data label="Medidor" value={`${debtor.meterId}${debtor.meterBrand ? ` · ${debtor.meterBrand}` : ""}`} /><Data label="Estado" value={debtor.supplyStatus ?? "Sin dato"} /></div></section>
      <section className="supply-section"><h3>Ubicación</h3><div className="supply-data-grid"><Data label="Dirección" value={debtor.address} /><Data label="Área / localidad" value={`${debtor.area} · ${debtor.locality}`} /><Data label="Ruta" value={debtor.route} /><Data label="Circuito" value={debtor.circuit} />{coordinates ? <Data label="Coordenadas catastrales" value={coordinates} technical /> : null}</div></section>
      <section className="debt-highlight"><div><span className="eyebrow">Deuda pendiente</span><strong>Bs {formatMoney(debtor.debtCents)}</strong><span>{debtor.monthsPending} facturas pendientes</span></div><span className={debtor.paymentPlan ? "payment-note payment-note--active" : "payment-note"}>{debtor.paymentPlan ? "Plan de pago activo" : "Sin plan de pago"}</span></section>
    </div>

    {activeOrder && !currentOrder ? <section className="existing-order-alert"><div><strong>Este suministro ya tiene una orden activa</strong><span>Creada {formatRelativeDate(activeOrder.createdAt)} · {activeOrder.assignedTechnicianId ? `Asignada a ${technicianName(activeOrder.assignedTechnicianId)}` : "Sin técnico asignado"}</span><TechnicalId label="CUC" value={activeOrder.cuc ?? activeOrder.orderId} /></div><button className="secondary-action" type="button" onClick={() => onViewOrder(activeOrder.orderId)}>Ver orden<span>→</span></button></section> : null}

    {currentOrder ? <section className="assignment-zone"><div className="assignment-zone__heading"><div><span className="eyebrow">Paso 3</span><h3>{currentOrder.assignedTechnicianId ? "Técnico asignado" : "Asignar técnico"}</h3></div><span className={`large-status large-status--${statusTone(currentOrder)}`}>{orderStatusLabel(currentOrder)}</span></div>{currentOrder.assignedTechnicianId ? <div className="assigned-success"><IconCheck /><div><strong>Asignada a {currentOrder.assignedTechnicianName ?? technicianName(currentOrder.assignedTechnicianId)}</strong><span>El técnico puede descargarla en su jornada.</span></div></div> : <form className="assignment-form" onSubmit={onAssignOrder}><label className="text-field"><span>Seleccionar técnico</span><select value={selectedTechnician} onChange={(event) => onTechnicianChange(event.target.value)}>{technicianId ? <option value={technicianId}>Técnico de campo</option> : <><option value="tech-camila">Camila Rojas</option><option value="tech-diego">Diego Vargas</option><option value="tech-juan">Juan Vargas</option></>}</select></label><button className="primary-action" type="submit" disabled={busy || currentOrder.status !== "GENERADO"}>Confirmar asignación<span>→</span></button></form>}</section> : null}

    {!activeOrder && !currentOrder ? <form className="create-order-zone" onSubmit={onCreateOrder}><div className="create-order-summary"><span className="eyebrow">Confirmar creación</span><strong>{debtor.customerName}</strong><span>Deuda: Bs {formatMoney(debtor.debtCents)} · {debtor.monthsPending} facturas pendientes</span><span>Medidor: {debtor.meterId}</span></div><button className="primary-action" type="submit" disabled={busy}>Crear orden de corte<span>→</span></button></form> : null}
  </div>;
}

function OrderRow({ order, selected, onSelect }: { order: WorkOrder; selected: boolean; onSelect: () => void }) { return <button type="button" className={selected ? "order-index-item order-index-item--selected" : "order-index-item"} onClick={onSelect}><span><strong>Orden de corte · {order.context?.customerName ?? order.accountId ?? "Suministro"}</strong><small>{order.assignedTechnicianId ? `Asignada a ${order.assignedTechnicianName ?? technicianName(order.assignedTechnicianId)}` : "Sin técnico asignado"} · {formatDate(order.createdAt)}</small></span><span className={`large-status large-status--${statusTone(order)}`}>{orderStatusLabel(order)}</span></button>; }

function AdminOrderDetail({ order, audit }: { order?: WorkOrder; audit: AuditEvent[] }) {
  const [showFullAudit, setShowFullAudit] = useState(false);
  if (!order) return <section className="panel order-detail-empty"><span className="eyebrow">Paso 4 · Revisar orden</span><h2>Detalle de la orden</h2><p>Selecciona una orden creada para consultar su resumen, deuda asociada y actividad.</p></section>;
  const context = order.context;
  const orderAudit = audit.filter((event) => event.orderId === order.orderId);
  const latestAudit = orderAudit[orderAudit.length - 1];
  return <section className="panel admin-order-detail"><div className="detail-topline"><div><span className="eyebrow">Paso 4 · Revisar orden</span><h2>Orden de corte · {context?.customerName ?? order.accountId ?? "Suministro"}</h2></div><span className={`large-status large-status--${statusTone(order)}`}>{orderStatusLabel(order)}</span></div><div className="detail-meta"><TechnicalId label="CUC" value={order.cuc ?? order.orderId} /><span>Creada: {formatLongDate(order.createdAt)}</span></div>
    {context ? <><section className="order-summary-grid"><Data label="Cliente" value={context.customerName} /><Data label="Cuenta" value={context.accountId} /><Data label="Medidor" value={`${context.meterId}${context.meterBrand ? ` · ${context.meterBrand}` : ""}`} /><Data label="Deuda" value={`Bs ${formatMoney(context.debtCents)}`} emphasis /><Data label="Técnico asignado" value={order.assignedTechnicianName ?? (order.assignedTechnicianId ? technicianName(order.assignedTechnicianId) : "Sin asignar")} /><Data label="Estado" value={orderStatusLabel(order)} /><Data label="Ruta" value={context.route} /><Data label="Dirección" value={context.address} /></section><DebtTable entries={context.kardex} total={context.debtCents} /><section className="additional-info"><div><span>Plan de pago</span><strong>{yesNo(context.paymentPlan)}</strong></div><div><span>Reclamos</span><strong>{yesNo(context.claims)}</strong></div><div><span>Fecha de suspensión</span><strong>{formatDate(context.suspensionDate)}</strong></div><div><span>Reconexión manual</span><strong>{yesNo(context.reconnectionManual)}</strong></div></section></> : <div className="context-missing">Contexto operativo no disponible en esta orden.</div>}
    <section className="audit-section"><div className="audit-heading"><div><span className="eyebrow">Trazabilidad</span><h3>Actividad reciente</h3></div><button className="filter-reset" type="button" onClick={() => setShowFullAudit((current) => !current)}>{showFullAudit ? "Ocultar detalle" : "Ver trazabilidad completa"}</button></div>{latestAudit ? <article className="recent-activity"><IconCheck /><div><strong>{humanAuditAction(latestAudit.action)}</strong><span>{formatLongDate(latestAudit.occurredAt)} · {latestAudit.actorRole === "ADMIN" ? "Administrador" : latestAudit.actorId}</span></div></article> : <p className="activity-empty">Todavía no hay actividad registrada para esta orden.</p>}{showFullAudit ? <div className="audit-detail-list">{orderAudit.map((event) => <article className="audit-entry" key={event.auditId}><strong>{humanAuditAction(event.action)}</strong><span>{event.actorRole === "ADMIN" ? "Administrador" : event.actorId} · {formatLongDate(event.occurredAt)} · {event.result === "accepted" ? "Aceptada" : "Rechazada"}</span>{event.operationId ? <TechnicalId label="Operación" value={event.operationId} /> : null}</article>)}</div> : null}</section>
  </section>;
}

function DebtTable({ entries, total }: { entries: DebtorRecord["kardex"]; total: number }) { return <section className="debt-section"><div className="detail-section-heading"><div><span className="eyebrow">Deuda asociada</span><p>Facturas pendientes que originan esta orden</p></div><strong>Total Bs {formatMoney(total)}</strong></div><div className="debt-table"><div className="debt-row debt-row--header"><span>Periodo</span><span>Facturación</span><span>Monto</span><span>Estado</span><span>Días mora</span><span>Origen</span></div>{entries.map((entry) => <div className="debt-row" key={entry.entryId}><span>{entry.period}</span><span>{entry.billingDate ? formatDate(entry.billingDate) : "—"}</span><span>Bs {formatMoney(entry.amountCents)}</span><span>{entry.status === "PENDING" ? "Pendiente" : "Pagada"}</span><span>{entry.daysLate ?? "—"}</span><span className="technical-cell">{entry.invoiceOrigin ?? "—"}</span></div>)}</div></section>; }

function Data({ label, value, technical = false, emphasis = false }: { label: string; value?: string | number; technical?: boolean; emphasis?: boolean }) { return <div className={technical ? "data-point data-point--technical" : emphasis ? "data-point data-point--emphasis" : "data-point"}><span>{label}</span><strong>{value === undefined || value === "" ? "Dato no disponible" : value}</strong></div>; }

function TechnicalId({ label, value }: { label: string; value: string }) { const [copied, setCopied] = useState(false); const copy = async () => { try { await navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); } }; return <span className="technical-id" title={value}>{label}: {shortIdentifier(value)} <button type="button" onClick={() => void copy()} aria-label={`Copiar ${label}`}>{copied ? "Copiado" : "Copiar"}</button></span>; }

function formatMoney(cents: number): string { return (cents / 100).toFixed(2); }
function formatDate(value?: string): string { if (!value) return "Sin datos"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Sin datos" : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(date); }
function formatLongDate(value?: string): string { if (!value) return "Sin datos"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Sin datos" : new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date).replace(",", " ·"); }
function formatRelativeDate(value?: string): string { if (!value) return "en fecha no disponible"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "en fecha no disponible"; return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date).replace(",", " ·"); }
function shortIdentifier(value: string): string { return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function yesNo(value?: boolean): string { return value === undefined ? "Dato no disponible" : value ? "Sí" : "No"; }
function isActiveOrder(order: WorkOrder): boolean { return order.status === "GENERADO"; }
function orderStatusLabel(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "Físico incierto"; return order.status === "GENERADO" ? "Generada" : order.status === "EJECUTADO" ? "Ejecutada" : order.status === "RECONEXIÓN" ? "Reconectada" : "Anulada"; }
function statusTone(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "review"; return order.status === "GENERADO" ? "ready" : order.status === "EJECUTADO" ? "done" : order.status === "ANULADO" ? "muted" : "active"; }
function technicianName(id: string): string { return id === "tech-camila" ? "Camila Rojas" : id === "tech-diego" ? "Diego Vargas" : id === "tech-juan" ? "Juan Vargas" : "Técnico de campo"; }
function humanAuditAction(action: string): string { return action === "ORDER_CREATED" ? "Orden creada" : action === "ORDER_ASSIGNED" ? "Técnico asignado" : action.replaceAll("_", " "); }
function readableError(error: unknown): string { return error instanceof Error ? error.message : "No pudimos completar la operación administrativa."; }
function filterOptions(values: string[], selected: string): string[] { return [...new Set([...values, selected].map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "es")); }
function parseMinMonths(value: string): number | undefined { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined; }
