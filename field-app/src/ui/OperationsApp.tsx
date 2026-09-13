import { useEffect, useState, type FormEvent } from "react";
import { generateOperationId, type AuditEvent, type DebtorRecord, type Session, type WorkOrder } from "../domain";
import type { OperationsAuthorityPort } from "../ports";

interface OperationsAppProps {
  authority: OperationsAuthorityPort;
  session: Session;
  onLogout: () => void;
  environment?: "SIMULATED" | "PILOT_PROVISIONAL";
}

export function OperationsApp({ authority, session, onLogout, environment = "SIMULATED" }: OperationsAppProps) {
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState("");
  const [selectedDebtor, setSelectedDebtor] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState(environment === "PILOT_PROVISIONAL" ? "10000000-0000-4000-8000-000000000002" : "tech-camila");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [nextDebtors, nextOrders, nextAudit] = await Promise.all([
      authority.findDebtors({ query, session }),
      authority.listOrders(session),
      authority.listAudit({ session, includeRejected: true }),
    ]);
    setDebtors(nextDebtors);
    setOrders(nextOrders);
    setAudit(nextAudit);
  }

  useEffect(() => { void refresh().catch((error) => setMessage(readableError(error))); }, [session]);

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    if (!selectedDebtor) return setMessage("Seleccione suministro para crear orden.");
    setBusy(true);
    try {
      await authority.createOrder({ operationId: generateOperationId("create-order"), debtorId: selectedDebtor, purpose: "CUT", session });
      setMessage("Orden creada y disponible para asignación.");
      await refresh();
    } catch (error) { setMessage(readableError(error)); } finally { setBusy(false); }
  }

  async function assignOrder(event: FormEvent) {
    event.preventDefault();
    const order = orders.find((candidate) => candidate.orderId === selectedOrder);
    if (!order) return setMessage("Seleccione orden para asignar.");
    setBusy(true);
    try {
      await authority.assignOrder({ operationId: generateOperationId("assign-order"), orderId: order.orderId, technicianId: selectedTechnician, expectedOrderVersion: order.version ?? 0, session });
      setMessage(`Orden asignada a ${selectedTechnician}.`);
      await refresh();
    } catch (error) { setMessage(readableError(error)); } finally { setBusy(false); }
  }

  const selectedDebtorRecord = debtors.find((debtor) => debtor.debtorId === selectedDebtor);

  return <div className="operations-app"><header className="operations-header"><div><span className="eyebrow">SEPSA · OPERACIONES</span><h1>Centro de control</h1><p className="identity">Sesión administrativa · {session.username}</p></div><div className="operations-header__actions"><span className="simulation-banner--inline">SIMULATED · sin API SEPSA</span><button className="secondary-action" onClick={onLogout}>Cerrar sesión</button></div></header>{message ? <div className="message message--info" role="status">{message}</div> : null}<main className="operations-grid"><section className="panel operations-search"><div className="panel-heading"><div><span className="eyebrow">BÚSQUEDA ADMINISTRATIVA</span><h2>Deudores y suministros</h2></div><span className="count-badge">{debtors.length}</span></div><form className="admin-search-form" onSubmit={(event) => { event.preventDefault(); void refresh(); }}><label className="search-field" htmlFor="admin-search"><span aria-hidden="true">⌕</span><input id="admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cuenta, suministro, nombre o medidor" /></label><button className="primary-action" type="submit">Buscar</button></form><div className="admin-record-list">{debtors.map((debtor) => <button type="button" className={selectedDebtor === debtor.debtorId ? "admin-record admin-record--selected" : "admin-record"} key={debtor.debtorId} onClick={() => setSelectedDebtor(debtor.debtorId)}><strong>{debtor.customerName}</strong><span>{debtor.accountId} · {debtor.supplyId}</span><b>Bs {formatMoney(debtor.debtCents)} · {debtor.monthsPending} meses</b></button>)}</div></section><section className="panel operations-orders"><div className="panel-heading"><div><span className="eyebrow">ÓRDENES INDIVIDUALES</span><h2>Crear y asignar</h2></div><span className="count-badge">{orders.length}</span></div>{selectedDebtorRecord ? <section className="context-panel" aria-label="Contexto del suministro"><div className="eyebrow">CONTEXTO DEL SUMINISTRO</div><div className="context-grid"><div><span>Dirección</span><strong>{selectedDebtorRecord.address}</strong></div><div><span>Medidor</span><strong>{selectedDebtorRecord.meterId}</strong></div><div><span>Localidad / área / ruta</span><strong>{selectedDebtorRecord.locality} · {selectedDebtorRecord.area} · {selectedDebtorRecord.route}</strong></div><div><span>Actualizado</span><strong>{selectedDebtorRecord.updatedAt}</strong></div><div><span>Fuente</span><strong>{selectedDebtorRecord.source}</strong></div></div></section> : null}<form className="admin-form" onSubmit={createOrder}><button className="primary-action" disabled={busy || !selectedDebtor} type="submit">Crear orden</button></form><div className="order-list">{orders.map((order) => <button type="button" className={selectedOrder === order.orderId ? "order-item order-item--selected" : "order-item"} key={order.orderId} onClick={() => setSelectedOrder(order.orderId)}><span className="order-item__main"><strong>{order.orderId}</strong><span>{order.accountId} · {order.supplyId}</span></span><span className="order-item__side"><span className="order-state">{orderStatusLabel(order.status)}</span><span className="chevron" aria-hidden="true">›</span></span></button>)}</div><form className="admin-form" onSubmit={assignOrder}><label htmlFor="technician-select">Técnico<select id="technician-select" value={selectedTechnician} onChange={(event) => setSelectedTechnician(event.target.value)}><option value="tech-camila">tech-camila</option><option value="tech-diego">tech-diego</option></select></label><button className="secondary-action" disabled={busy || !selectedOrder} type="submit">Asignar orden</button></form></section><section className="panel operations-audit"><div className="panel-heading"><div><span className="eyebrow">AUDITORÍA</span><h2>Trazabilidad</h2></div><span className="count-badge">{audit.length}</span></div>{audit.length ? <div className="activity-panel">{audit.map((event) => <article className="activity-entry" key={event.auditId}><div className="activity-entry__top"><strong>{event.action}</strong><span>{event.result}</span></div><p>{event.actorId}{event.actorRole ? ` · ${event.actorRole}` : ""} · {event.occurredAt}</p>{event.orderId || event.operationId || event.deviceId ? <p>{event.orderId ? `Orden ${event.orderId}` : ""}{event.operationId ? ` · Operación ${event.operationId}` : ""}{event.deviceId ? ` · Dispositivo ${event.deviceId}` : ""}</p> : null}</article>)}</div> : <p>Sin auditoría registrada.</p>}</section></main></div>;
}

function formatMoney(cents: number): string { return (cents / 100).toFixed(2); }
function orderStatusLabel(status: WorkOrder["status"]): string { return status === "GENERADO" ? "Por ejecutar" : status === "EJECUTADO" ? "Ejecutada" : status === "RECONEXIÓN" ? "Reconectada" : "Anulada"; }
function readableError(error: unknown): string { return error instanceof Error ? error.message : "No pudimos completar operación administrativa."; }
