/** Resumen del administrador: conteo de órdenes por estado y total de trazas de auditoría. */
import type { WorkOrder } from "../domain/types";

export function AdminOverview({ orders, traceCount }: { orders: WorkOrder[]; traceCount: number }) {
  const generated = orders.filter((order) => order.status === "GENERADO").length;
  const executed = orders.filter((order) => order.status === "EJECUTADO").length;
  const cancelled = orders.filter((order) => order.status === "ANULADO").length;
  const unassigned = orders.filter((order) => !order.assignedTechnicianId).length;
  const assigned = orders.filter((order) => Boolean(order.assignedTechnicianId)).length;

  return (
        <section className="admin-summary" aria-label="Resumen de órdenes">
          <div className="overview-stats">
            <Stat label="Generadas" value={generated} tone="ready" />
            <Stat label="Sin asignar" value={unassigned} tone="review" />
            <Stat label="Asignadas" value={assigned} tone="active" />
            <Stat label="Ejecutadas" value={executed} tone="done" />
            <Stat label="Anuladas" value={cancelled} tone="muted" />
            <Stat label="Trazas" value={traceCount} tone="traces" />
          </div>
        </section>
  );
}

function Stat({ label, value, tone, detail }: { label: string; value: number; tone: string; detail?: string }) { return <div className={`overview-stat overview-stat--${tone}`}><span className="overview-stat__icon" aria-hidden="true" /><div className="overview-stat__content"><span className={`status-mark status-mark--${tone}`}>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div></div>; }
