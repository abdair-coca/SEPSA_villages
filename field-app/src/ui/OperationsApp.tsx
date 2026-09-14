import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateOperationId, type AuditEvent, type DebtorRecord, type Session, type WorkOrder } from "../domain";
import type { OperationsAuthorityPort } from "../ports";

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
      setMessage("Orden creada. Revise el registro y asígnela a un técnico.");
      await refresh();
    } catch (error) { setMessage(readableError(error)); } finally { setBusy(false); }
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
  const generated = orders.filter((order) => order.status === "GENERADO").length;
  const executed = orders.filter((order) => order.status === "EJECUTADO").length;
  const cancelled = orders.filter((order) => order.status === "ANULADO").length;
  const unassigned = orders.filter((order) => !order.assignedTechnicianId).length;
  const physicalUnknown = orders.filter((order) => order.physicalStatus === "PHYSICAL_UNKNOWN").length;
  const syncReview = audit.filter((event) => event.action.startsWith("SYNC_") && event.result === "rejected").length;
  const selectedDebtors = debtors.filter((debtor) => selectedDebtorIds.includes(debtor.debtorId));
  const selectedDebtTotal = selectedDebtors.reduce((total, debtor) => total + debtor.debtCents, 0);
  const allDebtorsSelected = debtors.length > 0 && selectedDebtorIds.length === debtors.length;
  const areaOptions = filterOptions(debtors.map((debtor) => debtor.area), filters.area);
  const localityOptions = filterOptions(debtors.map((debtor) => debtor.locality), filters.locality);
  const routeOptions = filterOptions(debtors.map((debtor) => debtor.route), filters.route);
  const statusOptions = filterOptions(debtors.map((debtor) => debtor.supplyStatus ?? ""), filters.supplyStatus);

  return (
    <div className="operations-app">
      <header className="operations-header">
        <div>
          <span className="eyebrow">SEPSA · SISTEMA DE OPERACIONES</span>
          <h1>Centro de control</h1>
          <p className="identity">Sesión administrativa · {session.displayName ?? session.username}</p>
        </div>
        <div className="operations-header__actions">
          <span className="simulation-banner--inline">Datos de demostración · fuente pendiente de validación con SEPSA</span>
          <button className="secondary-action" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </header>
      {message ? <div className="message message--info" role="status">{message}</div> : null}
      <main className="operations-main">
        <section className="operations-overview" aria-label="Resumen operacional">
          <div><span className="eyebrow">OPERACIÓN DEL DÍA</span><h2>Órdenes de corte</h2><p>Control de suministros, asignaciones y resultados físicos.</p></div>
          <div className="overview-stats"><Stat label="Generadas" value={generated} tone="ready" /><Stat label="Ejecutadas" value={executed} tone="done" /><Stat label="Sin asignar" value={unassigned} tone="ready" /><Stat label="Físico incierto" value={physicalUnknown} tone="review" /><Stat label="Anuladas" value={cancelled} tone="muted" /><Stat label="Revisión sync" value={syncReview} tone="review" /><Stat label="Trazas" value={audit.length} tone="active" /></div>
        </section>
        <section className="process-strip" aria-label="Flujo de operación">
          <ProcessStep number="01" label="Buscar suministro" active={debtors.length > 0} />
          <ProcessStep number="02" label="Crear orden" active={orders.length > 0} />
          <ProcessStep number="03" label="Asignar técnico" active={orders.some((order) => Boolean(order.assignedTechnicianId))} />
          <ProcessStep number="04" label="Ejecutar corte" active={executed > 0} />
        </section>
        <div className="operations-grid">
          <section className="panel operations-search">
            <div className="panel-heading"><div><span className="eyebrow">P-02 · BÚSQUEDA DE MOROSIDAD</span><h2>Suministros morosos</h2></div><span className="count-badge">{debtors.length}</span></div>
            <form className="admin-search-form admin-search-form--extended" onSubmit={search}>
              <label className="search-field" htmlFor="admin-search"><span aria-hidden="true">⌕</span><input id="admin-search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Cuenta, suministro, nombre o medidor" /></label>
              <label className="text-field"><span>Área regional</span><select value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}><option value="">Todas</option>{areaOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="text-field"><span>Localidad</span><select value={filters.locality} onChange={(event) => setFilters({ ...filters, locality: event.target.value })}><option value="">Todas</option>{localityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="text-field"><span>Ruta</span><select value={filters.route} onChange={(event) => setFilters({ ...filters, route: event.target.value })}><option value="">Todas</option>{routeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="text-field"><span>Facturas vencidas desde</span><input type="number" min="0" inputMode="numeric" value={filters.minMonthsPending} onChange={(event) => setFilters({ ...filters, minMonthsPending: event.target.value })} /></label>
              <label className="text-field"><span>Estado del cliente</span><select value={filters.supplyStatus} onChange={(event) => setFilters({ ...filters, supplyStatus: event.target.value })}><option value="">Todos</option>{statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <div className="filter-actions"><button className="primary-action" type="submit" disabled={searching || busy}>{searching ? "Consultando…" : "Aplicar filtros"}</button><button className="filter-reset" type="button" onClick={() => void clearFilters()} disabled={searching || busy}>Limpiar</button></div>
            </form>
            <div className="selection-toolbar"><div><strong>{selectedDebtorIds.length ? `${selectedDebtorIds.length} seleccionados` : "Ningún suministro seleccionado"}</strong><span>{debtors.length} resultados actuales</span></div><button className="toolbar-action" type="button" onClick={toggleAllDebtors} disabled={!debtors.length}>{allDebtorsSelected ? "Quitar selección" : "Seleccionar todos"}</button></div>
            {selectedDebtorIds.length ? <section className={batchPreview ? "batch-command batch-command--ready" : "batch-command"} aria-label="Creación masiva"><div className="batch-command__summary"><strong>{batchPreview ? "Lote listo para confirmar" : `Crear órdenes para ${selectedDebtorIds.length} suministros`}</strong><span>Deuda referencial: Bs {formatMoney(selectedDebtTotal)}</span></div>{batchPreview ? <div className="batch-preview-actions"><button className="secondary-action" type="button" onClick={() => setBatchPreview(undefined)} disabled={busy}>Volver</button><button className="primary-action" type="button" onClick={() => void confirmBatch()} disabled={busy}>{busy ? "Creando…" : "Confirmar creación"} <span>→</span></button></div> : <button className="primary-action" type="button" onClick={prepareBatch}>Revisar lote <span>→</span></button>}{batchPreview ? <p>Se crearán órdenes elegibles. Cuentas con una orden activa quedarán omitidas con causa.</p> : null}</section> : null}
            <div className="admin-record-list">{debtors.map((debtor) => <DebtorItem key={debtor.debtorId} debtor={debtor} selected={selectedDebtor === debtor.debtorId} checked={selectedDebtorIds.includes(debtor.debtorId)} onSelect={() => setSelectedDebtor(debtor.debtorId)} onToggle={() => toggleDebtor(debtor.debtorId)} />)}</div>
            {!debtors.length ? <div className="empty-state"><strong>No encontramos suministros</strong><span>Ajuste búsqueda y vuelva a consultar.</span></div> : null}
          </section>
          <section className="panel operations-orders">
            <div className="panel-heading"><div><span className="eyebrow">P-01 · CONTROL ADMINISTRATIVO</span><h2>Crear y asignar</h2></div><span className="count-badge">{orders.length}</span></div>
            {selectedDebtorRecord ? <AdminContext debtor={selectedDebtorRecord} /> : <div className="context-missing">Seleccione suministro para revisar contexto antes de crear una orden.</div>}
            <form className="admin-command-form" onSubmit={createOrder}><button className="primary-action" disabled={busy || !selectedDebtor} type="submit">Crear orden individual <span>→</span></button></form>
            <div className="order-list admin-order-list">{orders.map((order) => <OrderRow key={order.orderId} order={order} selected={selectedOrder === order.orderId} onSelect={() => setSelectedOrder(order.orderId)} />)}</div>
            {selectedOrderRecord ? <form className="assignment-form" onSubmit={assignOrder}><div className="form-heading"><div><span className="eyebrow">P-03 · ASIGNACIÓN</span><h3>Orden seleccionada</h3></div><span className={`large-status large-status--${statusTone(selectedOrderRecord)}`}>{orderStatusLabel(selectedOrderRecord)}</span></div><p>{selectedOrderRecord.cuc ?? selectedOrderRecord.orderId} · versión {selectedOrderRecord.version ?? "—"}</p><label className="text-field"><span>Técnico asignado</span><select value={selectedTechnician} onChange={(event) => setSelectedTechnician(event.target.value)}>{technicianId ? <option value={technicianId}>Técnico de campo</option> : <><option value="tech-camila">Camila Rojas</option><option value="tech-diego">Diego Vargas</option></>}</select></label><button className="secondary-action" type="submit" disabled={busy || selectedOrderRecord.status !== "GENERADO"}>Confirmar asignación <span>→</span></button></form> : null}
          </section>
        </div>
        <AdminOrderDetail order={selectedOrderRecord} audit={audit} />
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="overview-stat"><span className={`status-mark status-mark--${tone}`}>{label}</span><strong>{value}</strong></div>; }
function ProcessStep({ number, label, active }: { number: string; label: string; active: boolean }) { return <div className={active ? "process-step process-step--active" : "process-step"}><span>{number}</span><strong>{label}</strong></div>; }
function DebtorItem({ debtor, selected, checked, onSelect, onToggle }: { debtor: DebtorRecord; selected: boolean; checked: boolean; onSelect: () => void; onToggle: () => void }) { return <article className={selected ? "admin-record admin-record--selected" : "admin-record"}><label className="record-select"><input type="checkbox" checked={checked} onChange={onToggle} /><span>Seleccionar</span></label><button type="button" className="record-review" onClick={onSelect}><strong>{debtor.customerName}</strong><span>Cuenta {debtor.accountId} · suministro {debtor.supplyId}</span><b>Bs {formatMoney(debtor.debtCents)} · {debtor.monthsPending} meses pendientes · Estado {debtor.supplyStatus ?? "Sin dato"}</b><small>Revisar contexto →</small></button></article>; }
function OrderRow({ order, selected, onSelect }: { order: WorkOrder; selected: boolean; onSelect: () => void }) { return <button type="button" className={selected ? "admin-record admin-record--selected" : "admin-record"} onClick={onSelect}><strong>{order.cuc ?? order.orderId}</strong><span>Cuenta {order.accountId ?? "—"} · {order.assignedTechnicianId ? `Técnico ${order.assignedTechnicianId}` : "Sin asignar"}</span><b>{orderStatusLabel(order)} · {formatDate(order.createdAt)}</b></button>; }

function AdminContext({ debtor }: { debtor: DebtorRecord }) {
  const coordinates = debtor.cadastralLatitude !== undefined && debtor.cadastralLongitude !== undefined ? `${debtor.cadastralLatitude.toFixed(6)}, ${debtor.cadastralLongitude.toFixed(6)}` : undefined;
  return <section className="context-panel" aria-label="Contexto completo del suministro"><div className="context-grid"><Data label="Cuenta" value={debtor.accountId} /><Data label="Suministro" value={debtor.supplyId} /><Data label="Cliente" value={debtor.customerName} /><Data label="CI / NIT" value={debtor.customerCi} /><Data label="Teléfono de contacto" value={debtor.contactPhone} /><Data label="Dirección" value={debtor.address} /><Data label="Referencias" value={debtor.references} /><Data label="Área / localidad" value={`${debtor.area} · ${debtor.locality}`} /><Data label="Ruta / orden" value={`${debtor.route} · ${debtor.routeOrder ?? "—"}`} /><Data label="Circuito" value={debtor.circuit} /><Data label="Tarifa / estado" value={`${debtor.tariff ?? "—"} · ${debtor.supplyStatus ?? "—"}`} /><Data label="Título habilitante" value={debtor.enablingTitle} /><Data label="Medidor / marca" value={`${debtor.meterId}${debtor.meterBrand ? ` · ${debtor.meterBrand}` : ""}`} /><Data label="Índice / multiplicador" value={`${debtor.meterIndex ?? "—"} · ${debtor.meterMultiplier ?? "—"}`} /><Data label="Coordenadas catastrales" value={coordinates} /><Data label="Deuda" value={`Bs ${formatMoney(debtor.debtCents)} · ${debtor.monthsPending} meses`} /></div><div className="context-source">Actualizado {formatDate(debtor.updatedAt)} · Datos de demostración</div></section>;
}
function AdminOrderDetail({ order, audit }: { order?: WorkOrder; audit: AuditEvent[] }) {
  if (!order) return <section className="panel order-detail-empty"><span className="eyebrow">P-04 · FICHA INTEGRAL</span><h2>Seleccione una orden</h2><p>La ficha mostrará contexto, deuda, salvaguardas y trazabilidad.</p></section>;
  const context = order.context;
  return <section className="panel admin-order-detail"><div className="detail-topline"><span className="eyebrow">P-04 · FICHA INTEGRAL DE CORTE</span><span className={`large-status large-status--${statusTone(order)}`}>{orderStatusLabel(order)}</span></div><div className="detail-heading"><div><h2>{order.cuc ?? order.orderId}</h2><p>Cuenta {order.accountId ?? context?.accountId ?? "—"} · creado {formatDate(order.createdAt)}</p></div><span className="version-tag">Versión {order.version ?? "—"} · {daysSince(order.createdAt)} días</span></div>{context ? <><div className="context-grid context-grid--detail"><Data label="Cliente" value={context.customerName} /><Data label="Dirección" value={context.address} /><Data label="Medidor" value={`${context.meterId}${context.meterBrand ? ` · ${context.meterBrand}` : ""}`} /><Data label="Circuito" value={context.circuit} /><Data label="Técnico asignado" value={order.assignedTechnicianId || "Sin asignar"} /><Data label="Deuda mes tope" value={`Bs ${formatMoney(context.debtCents)}`} /></div><DebtTable entries={context.kardex} total={context.debtCents} /><div className="safeguard-grid"><Data label="Tiene reclamos" value={yesNo(context.claims)} /><Data label="Plan de pago" value={yesNo(context.paymentPlan)} /><Data label="Fecha suspensión" value={formatDate(context.suspensionDate)} /><Data label="Reconexión manual" value={yesNo(context.reconnectionManual)} /></div></> : <div className="context-missing">Contexto operativo no disponible en esta orden.</div>}<section className="audit-section"><div className="eyebrow">TRAZABILIDAD ADMINISTRATIVA</div>{audit.filter((event) => event.orderId === order.orderId).map((event) => <article className="audit-entry" key={event.auditId}><strong>{event.action}</strong><span>{event.actorRole ?? "Usuario"} · {event.actorId} · {formatDate(event.occurredAt)} · {event.result === "accepted" ? "Aceptada" : "Rechazada"}</span>{event.operationId || event.deviceId ? <p>{event.operationId ? `Operación ${event.operationId}` : ""}{event.deviceId ? ` · Dispositivo ${event.deviceId}` : ""}</p> : null}{event.reason ? <p>{event.reason}</p> : null}</article>)}{!audit.some((event) => event.orderId === order.orderId) ? <p className="activity-empty">Sin eventos de auditoría para esta orden.</p> : null}</section></section>;
}
function DebtTable({ entries, total }: { entries: DebtorRecord["kardex"]; total: number }) { return <section className="debt-section"><div className="detail-section-heading"><span className="eyebrow">DEUDA ASOCIADA</span><strong>Total Bs {formatMoney(total)}</strong></div><div className="debt-table"><div className="debt-row debt-row--header"><span>Periodo</span><span>Facturación</span><span>Origen</span><span>Monto</span><span>Estado</span><span>Días mora</span></div>{entries.map((entry) => <div className="debt-row" key={entry.entryId}><span>{entry.period}</span><span>{entry.billingDate ? formatDate(entry.billingDate) : "—"}</span><span>{entry.invoiceOrigin ?? "—"}</span><span>Bs {formatMoney(entry.amountCents)}</span><span>{entry.status === "PENDING" ? "Pendiente" : "Pagada"}</span><span>{entry.daysLate ?? "—"}</span></div>)}</div></section>; }
function Data({ label, value }: { label: string; value?: string | number }) { return <div className="data-point"><span>{label}</span><strong>{value === undefined || value === "" ? "Dato no disponible" : value}</strong></div>; }
function formatMoney(cents: number): string { return (cents / 100).toFixed(2); }
function formatDate(value?: string): string { if (!value) return "Sin datos"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Sin datos" : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(date); }
function daysSince(value?: string): string { if (!value) return "0.00"; const generated = Date.parse(value); if (Number.isNaN(generated)) return "0.00"; return Math.max(0, (Date.now() - generated) / 86_400_000).toFixed(2); }
function yesNo(value?: boolean): string { return value === undefined ? "Dato no disponible" : value ? "Sí" : "No"; }
function orderStatusLabel(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "Físico incierto"; return order.status === "GENERADO" ? "Generada" : order.status === "EJECUTADO" ? "Ejecutada" : order.status === "RECONEXIÓN" ? "Reconectada" : "Anulada"; }
function statusTone(order: WorkOrder): string { if (order.physicalStatus === "PHYSICAL_UNKNOWN") return "review"; return order.status === "GENERADO" ? "ready" : order.status === "EJECUTADO" ? "done" : order.status === "ANULADO" ? "muted" : "active"; }
function readableError(error: unknown): string { return error instanceof Error ? error.message : "No pudimos completar la operación administrativa."; }
function filterOptions(values: string[], selected: string): string[] { return [...new Set([...values, selected].map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "es")); }
function parseMinMonths(value: string): number | undefined { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined; }
