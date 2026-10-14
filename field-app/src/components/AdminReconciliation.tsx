/**
 * Operaciones por conciliar, solo lectura (D024), en un diálogo que el administrador abre desde su menú de cuenta:
 * conflictos de sincronización, autorizaciones usadas cuya operación no llegó y operaciones cerradas porque su
 * autorización no se usó. Sin acciones: el técnico las verifica o pide una autorización nueva desde su dispositivo (D022).
 */
import { useState, type ComponentType } from "react";
import type { ReconciliationItem } from "../domain/types";
import { formatDate, shortTechnicalId } from "../utils/format";
import { ADMIN_RECONCILIATION_PAGE_SIZE, getAdminOrderPage } from "../utils/pagination";
import { PaginationControls } from "./common/PaginationControls";
import { AppModal } from "./common/Modal";
import { IconAlertTriangle, IconClock, IconInfo } from "./common/Icons";
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

/** Cada tipo usa un token semántico; el texto y el icono también lo identifican, no solo el color. */
const KIND_TONE: Record<ReconciliationKind, "conflict" | "pending" | "closed"> = {
  SYNC_CONFLICT: "conflict",
  CONSUMED_NOT_SYNCED: "pending",
  CLOSED_NOT_CONSUMED: "closed",
};

const KIND_ICON: Record<ReconciliationKind, ComponentType> = {
  SYNC_CONFLICT: IconAlertTriangle,
  CONSUMED_NOT_SYNCED: IconClock,
  CLOSED_NOT_CONSUMED: IconInfo,
};

const ACTION_LABEL: Record<string, string> = { CUT: "Corte", RECONNECTION: "Reconexión", VISIT: "Visita" };

/** Texto del número de casos, reutilizado en el menú de cuenta. */
export function reconciliationCaseLabel(count: number): string {
  if (count === 0) return "Sin casos";
  return count === 1 ? "1 caso" : `${count} casos`;
}

export function AdminReconciliation({ items, onClose }: { items: ReconciliationItem[]; onClose: () => void }) {
  const [page, setPage] = useState(1);
  // Los casos se listan por tipo, en el mismo orden que sus contadores.
  const ordered = KINDS.flatMap((kind) => items.filter((item) => item.kind === kind));
  const counts = KINDS.map((kind) => ({ kind, count: items.filter((item) => item.kind === kind).length }));
  const pageData = getAdminOrderPage(ordered, page, ADMIN_RECONCILIATION_PAGE_SIZE);

  return (
    <AppModal
      titleId="admin-reconciliation-title"
      eyebrow="Seguimiento"
      title="Operaciones por conciliar"
      onClose={onClose}
      describedBy="admin-reconciliation-intro"
      className="admin-reconciliation-modal"
    >
      <p id="admin-reconciliation-intro" className="admin-modal__intro">Solo lectura. El técnico las verifica o las resuelve desde su dispositivo.</p>

      <ul className="admin-reconciliation__summary" aria-label="Casos por tipo">
        {counts.map(({ kind, count }) => {
          const Icon = KIND_ICON[kind];
          return (
            <li key={kind} className={`admin-reconciliation__card admin-reconciliation__card--${KIND_TONE[kind]}`}>
              <span className="admin-reconciliation__card-icon" aria-hidden="true"><Icon /></span>
              <strong>{count}</strong>
              <span className="admin-reconciliation__card-label">{KIND_SUMMARY[kind]}</span>
            </li>
          );
        })}
      </ul>

      <div className="admin-modal__context admin-reconciliation__body">
        {ordered.length === 0 ? (
          <AppStateCard tone="empty" layout="inline" title="Sin operaciones por conciliar" description="Cuando un técnico tenga una operación pendiente de conciliar, aparecerá aquí." />
        ) : (
          <>
            <ul className="admin-reconciliation__list" aria-label="Operaciones por conciliar">
              {pageData.items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <li key={`${item.kind}-${item.operationId}`} className={`admin-reconciliation__item admin-reconciliation__item--${KIND_TONE[item.kind]}`}>
                    <div className="admin-reconciliation__item-head">
                      <span className="admin-reconciliation__kind"><Icon /><span>{KIND_LABEL[item.kind]}</span></span>
                      <time dateTime={item.since}>{formatDate(item.since)}</time>
                    </div>
                    <strong className="admin-reconciliation__customer">{item.customerName ?? "Cliente no disponible"}</strong>
                    <dl className="admin-reconciliation__facts">
                      <div><dt>Cuenta</dt><dd>{item.accountId ?? "No disponible"}</dd></div>
                      <div><dt>Acción</dt><dd>{ACTION_LABEL[item.action ?? ""] ?? "Operación"}</dd></div>
                      <div><dt>Técnico</dt><dd>{item.technicianName ?? shortTechnicalId(item.technicianId)}</dd></div>
                      <div><dt>Operación</dt><dd><span className="technical-id" title={item.operationId}>{shortTechnicalId(item.operationId)}</span></dd></div>
                    </dl>
                    {item.detail && item.kind === "SYNC_CONFLICT" ? <p className="admin-reconciliation__detail">{item.detail}</p> : null}
                  </li>
                );
              })}
            </ul>
            {pageData.totalPages > 1 ? (
              <PaginationControls
                className="admin-reconciliation__pagination"
                label="Paginación de operaciones por conciliar"
                page={pageData.page}
                totalPages={pageData.totalPages}
                onPrevious={() => setPage(pageData.page - 1)}
                onNext={() => setPage(pageData.page + 1)}
              />
            ) : null}
          </>
        )}
      </div>
    </AppModal>
  );
}
