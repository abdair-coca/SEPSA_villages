/**
 * Ficha integral de una orden para el administrador: estado, referencia (CUC) copiable, datos del suministro,
 * técnico asignado y tabla de deuda. Si la orden no tiene técnico, ofrece la acción de asignar.
 */
import { useState } from "react";
import type { DebtorRecord, WorkOrder } from "../domain/types";
import { IconAlertTriangle, IconCheck, IconDocument } from "./common/Icons";
import { AdminDataField, AdminDataIcon } from "./AdminData";
import { adminOrderDomainStatusLabel, adminOrderStatusLabel, adminOrderStatusTone } from "../utils/labels";
import { formatAdminDate, formatAdminMoney, formatAdminOrderHeaderDate, joinAdminValues } from "../utils/format";

export function AdminOrderDetail({ order, onAssign }: { order?: WorkOrder; onAssign?: () => void }) {
  const [copiedReference, setCopiedReference] = useState(false);
  if (!order) return null;
  const context = order.context;
  const reference = order.cuc ?? order.orderId;
  const assignedTechnician = order.assignedTechnicianName ?? (order.assignedTechnicianId ? "Técnico asignado" : "Sin asignar");
  const headerStatus = adminOrderDomainStatusLabel(order.status);
  const copyReference = async () => { try { await navigator.clipboard?.writeText(reference); setCopiedReference(true); window.setTimeout(() => setCopiedReference(false), 1400); } catch { setCopiedReference(false); } };
  return <section className="panel admin-order-detail" aria-labelledby="order-detail-title">
    <header className="order-sheet-header">
      <div className="order-sheet-title"><span className="order-sheet-title__icon"><IconDocument /></span><div><h2 id="order-detail-title">Ficha integral de corte</h2><p>Detalle completo de la orden seleccionada.</p></div></div>
      <div className="order-sheet-status"><span className={`order-sheet-status__badge order-status-label order-sheet-status__badge--${adminOrderStatusTone(order)}`}>{order.status === "ANULADO" ? <IconAlertTriangle /> : <IconCheck />}{headerStatus}</span><span>Generada el {formatAdminOrderHeaderDate(order.createdAt)}</span></div>
    </header>
    <div className="order-sheet-reference">
      <span className="order-sheet-reference__icon"><IconDocument /></span>
      <div className="order-sheet-reference__content"><div className="order-sheet-reference__value"><strong title={reference}>{reference}</strong><button type="button" onClick={() => void copyReference()} aria-label="Copiar CUC">{copiedReference ? "Copiado" : "⧉"}</button></div><span>Cuenta {context?.accountId ?? order.accountId ?? "Dato no disponible"} · Versión {order.version ?? "Dato no disponible"}</span></div>
      {!order.assignedTechnicianId && onAssign ? <button className="order-sheet-assign" type="button" onClick={onAssign}><AdminDataIcon kind="client" />Asignar técnico</button> : null}
    </div>
    {context ? <>
      <section className="order-sheet-summary" aria-label="Resumen de la orden">
        <AdminDataField label="Cliente" value={context.customerName} icon="client" />
        <AdminDataField label="Dirección" value={context.address} icon="address" />
        <AdminDataField label="Medidor" value={joinAdminValues(context.meterId, context.meterBrand)} icon="meter" />
        <AdminDataField label="Circuito" value={context.circuit} icon="circuit" />
        <AdminDataField label="Técnico asignado" value={assignedTechnician} icon="client" />
        <AdminDataField label="Deuda total" value={`Bs ${formatAdminMoney(context.debtCents)}`} icon="debt" emphasis />
        {order.physicalStatus === "PHYSICAL_UNKNOWN" ? <div className="data-point data-point--with-icon order-sheet-status-field"><AdminDataIcon kind="tariff" /><div className="data-point__content"><span>Estado físico</span><strong className={`order-sheet-status-value order-sheet-status-value--${adminOrderStatusTone(order)}`}>{adminOrderStatusLabel(order)}</strong></div></div> : null}
        <AdminDataField label="Área / Localidad" value={joinAdminValues(context.areaName ?? context.area, context.locality)} icon="area" />
      </section>
      <DebtTable entries={context.kardex} total={context.debtCents} />
    </> : <div className="context-missing" role="status">Contexto operativo no disponible en esta orden.</div>}
    </section>;
}

function DebtTable({ entries, total }: { entries: DebtorRecord["kardex"]; total: number }) { return <section className="debt-section"><div className="detail-section-heading"><div className="debt-section-title"><AdminDataIcon kind="tariff" /><strong>Deuda asociada</strong></div><strong className="debt-section-total"><span>Total</span> Bs {formatAdminMoney(total)}</strong></div><div className="debt-table"><div className="debt-row debt-row--header"><span>Periodo</span><span>Fecha facturación</span><span>Origen</span><span>Monto</span><span>Días mora</span></div>{entries.map((entry) => <div className="debt-row" key={entry.entryId}><span>{entry.period || "Dato no disponible"}</span><span>{entry.billingDate ? formatAdminDate(entry.billingDate) : "Dato no disponible"}</span><span className="technical-cell">{entry.invoiceOrigin ?? "Dato no disponible"}</span><span>Bs {formatAdminMoney(entry.amountCents)}</span><span>{entry.daysLate ?? "Dato no disponible"}</span></div>)}</div></section>; }
