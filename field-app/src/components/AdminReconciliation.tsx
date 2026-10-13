/**
 * Operaciones por conciliar, solo lectura (D024): conflictos de sincronización, autorizaciones usadas cuya operación
 * no llegó y operaciones cerradas porque su autorización no se usó. El administrador no tiene acciones aquí: el
 * técnico verifica o pide una autorización nueva desde su dispositivo (D022).
 */
import type { ReconciliationItem } from "../domain/types";
import { formatDate, shortTechnicalId } from "../utils/format";

const KIND_LABEL: Record<ReconciliationItem["kind"], string> = {
  SYNC_CONFLICT: "El servidor rechazó la sincronización",
  CONSUMED_NOT_SYNCED: "Autorización usada; la operación aún no llega del dispositivo",
  CLOSED_NOT_CONSUMED: "Cerrada: la autorización no se usó y se pidió otra",
};

const ACTION_LABEL: Record<string, string> = { CUT: "Corte", RECONNECTION: "Reconexión", VISIT: "Visita" };

export function AdminReconciliation({ items }: { items: ReconciliationItem[] }) {
  return (
    <section className="admin-reconciliation panel" aria-labelledby="admin-reconciliation-title">
      <div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h2 id="admin-reconciliation-title">Operaciones por conciliar</h2></div></div>
      <p className="admin-reconciliation__intro">Solo lectura. El técnico las verifica o las resuelve desde su dispositivo.</p>
      {items.length === 0 ? <p className="admin-reconciliation__empty">Sin operaciones por conciliar.</p> : (
        <ul className="admin-reconciliation__list">
          {items.map((item) => (
            <li key={`${item.kind}-${item.operationId}`} className={`admin-reconciliation__item admin-reconciliation__item--${item.kind.toLowerCase()}`}>
              <strong>{KIND_LABEL[item.kind]}</strong>
              <span>{ACTION_LABEL[item.action ?? ""] ?? "Operación"} · Cuenta {item.accountId ?? "no disponible"}{item.customerName ? ` · ${item.customerName}` : ""}</span>
              <span>Técnico {item.technicianName ?? shortTechnicalId(item.technicianId)} · {formatDate(item.since)}</span>
              {item.detail && item.kind === "SYNC_CONFLICT" ? <small>{item.detail}</small> : null}
              <small className="technical-id" title={item.operationId}>Operación {shortTechnicalId(item.operationId)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
