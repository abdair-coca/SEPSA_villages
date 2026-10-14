/**
 * Operaciones por conciliar, solo lectura (D024): conflictos de sincronización, autorizaciones usadas cuya operación
 * no llegó y operaciones cerradas porque su autorización no se usó. El administrador no tiene acciones aquí: el
 * técnico verifica o pide una autorización nueva desde su dispositivo (D022).
 */
import { Fragment } from "react";
import type { ReconciliationItem } from "../domain/types";
import { formatDate, shortTechnicalId } from "../utils/format";
import { AppStateCard } from "./common/UiState";

type ReconciliationKind = ReconciliationItem["kind"];

const KINDS: readonly ReconciliationKind[] = ["SYNC_CONFLICT", "CONSUMED_NOT_SYNCED", "CLOSED_NOT_CONSUMED"];

const KIND_LABEL: Record<ReconciliationKind, string> = {
  SYNC_CONFLICT: "El servidor rechazó la sincronización",
  CONSUMED_NOT_SYNCED: "Autorización usada; la operación aún no llega del dispositivo",
  CLOSED_NOT_CONSUMED: "Cerrada: la autorización no se usó y se pidió otra",
};

const KIND_SUMMARY: Record<ReconciliationKind, string> = {
  SYNC_CONFLICT: "Conflictos",
  CONSUMED_NOT_SYNCED: "Pendientes de llegar",
  CLOSED_NOT_CONSUMED: "Cerradas sin usar",
};

/** Cada tipo usa un token semántico; el texto del tipo también lo identifica, no solo el color. */
const KIND_TONE: Record<ReconciliationKind, "conflict" | "pending" | "closed"> = {
  SYNC_CONFLICT: "conflict",
  CONSUMED_NOT_SYNCED: "pending",
  CLOSED_NOT_CONSUMED: "closed",
};

const ACTION_LABEL: Record<string, string> = { CUT: "Corte", RECONNECTION: "Reconexión", VISIT: "Visita" };

export function AdminReconciliation({ items }: { items: ReconciliationItem[] }) {
  const groups = KINDS.map((kind) => ({ kind, items: items.filter((item) => item.kind === kind) }));

  return (
    <section className="admin-reconciliation panel" aria-labelledby="admin-reconciliation-title">
      <div className="admin-reconciliation__heading">
        <div>
          <span className="eyebrow">SEGUIMIENTO</span>
          <h2 id="admin-reconciliation-title">Operaciones por conciliar</h2>
        </div>
        {items.length > 0 ? <span className="admin-reconciliation__count">{items.length === 1 ? "1 caso" : `${items.length} casos`}</span> : null}
      </div>
      <p className="admin-reconciliation__intro">Solo lectura. El técnico las verifica o las resuelve desde su dispositivo.</p>

      {items.length === 0 ? (
        <AppStateCard tone="empty" layout="inline" className="admin-reconciliation__empty" title="Sin operaciones por conciliar" description="Cuando un técnico tenga una operación pendiente de conciliar, aparecerá aquí." />
      ) : (
        <>
          <ul className="admin-reconciliation__summary">
            {groups.map(({ kind, items: group }) => (
              <li key={kind} className={`admin-reconciliation__summary-item admin-reconciliation__summary-item--${KIND_TONE[kind]}`}>
                <span>{KIND_SUMMARY[kind]}</span>
                <strong>{group.length}</strong>
              </li>
            ))}
          </ul>

          {groups.filter(({ items: group }) => group.length > 0).map(({ kind, items: group }) => (
            <section key={kind} className={`admin-reconciliation__group admin-reconciliation__group--${KIND_TONE[kind]}`} aria-labelledby={`admin-reconciliation-${kind}`}>
              <h3 id={`admin-reconciliation-${kind}`}>{KIND_LABEL[kind]}</h3>
              <div className="admin-reconciliation__scroll">
                <table className="admin-reconciliation__table" aria-labelledby={`admin-reconciliation-${kind}`}>
                  <thead>
                    <tr>
                      <th scope="col">Cuenta</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Acción</th>
                      <th scope="col">Técnico</th>
                      <th scope="col">Desde</th>
                      <th scope="col">Operación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((item) => (
                      <Fragment key={`${item.kind}-${item.operationId}`}>
                        <tr>
                          <td data-label="Cuenta">{item.accountId ?? "No disponible"}</td>
                          <td data-label="Cliente">{item.customerName ?? "No disponible"}</td>
                          <td data-label="Acción">{ACTION_LABEL[item.action ?? ""] ?? "Operación"}</td>
                          <td data-label="Técnico">{item.technicianName ?? shortTechnicalId(item.technicianId)}</td>
                          <td data-label="Desde"><time dateTime={item.since}>{formatDate(item.since)}</time></td>
                          <td data-label="Operación"><span className="technical-id" title={item.operationId}>{shortTechnicalId(item.operationId)}</span></td>
                        </tr>
                        {item.detail && item.kind === "SYNC_CONFLICT" ? (
                          <tr className="admin-reconciliation__detail">
                            <td colSpan={6}>{item.detail}</td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
