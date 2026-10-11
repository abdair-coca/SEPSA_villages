import { useState } from "react";
import type { AppState, AppStore } from "../state/store";
import type { WorkOrder } from "../domain/types";
import type { SyncItem } from "../ports/sync";
import { PaginationControls } from "./common/PaginationControls";
import { AppStateCard } from "./common/UiState";
import { activityTimestampsByOperation, formatDate, isUsable, queueActionLabel, queueReviewMessage, shortTechnicalId, sortSyncItemsForDisplay, syncItemTimestamp, syncStatusLabel } from "../utils/field-app-utils";

export function QueuePanel({ state, store }: { state: AppState; store: AppStore }) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const activityByOperation = activityTimestampsByOperation(state.activity);
  const items = sortSyncItemsForDisplay(state.syncItems, state.activity);
  const canRunQueueSync = isUsable(state.mode) && state.busyAction !== "SYNC";
  const { page, pageCount, item: mobileItem } = queuePageItem(items, requestedPage);
  const renderItem = (item: SyncItem, mobile: boolean) => (
    <QueueItem key={item.operationId} item={item} displayedAt={syncItemTimestamp(item, activityByOperation)} order={state.orders.find((order) => order.orderId === item.orderId)} onRetry={() => void store.sync()} onViewOrder={(orderId) => { store.setTab("orders"); store.selectOrder(orderId); }} onViewFullDetails={() => setShowFullDetails(true)} canRetry={!mobile || canRunQueueSync} canVerify={canRunQueueSync} mobile={mobile} />
  );
  return (
    <section className="queue-panel panel" aria-label="Cola de sincronización">
      <div className="panel-heading"><div><div className="eyebrow">TRAZABILIDAD LOCAL</div><h2>Cola de sincronización</h2></div><div className="queue-panel__actions"><button type="button" className="toolbar-action" onClick={() => store.setTab("orders")}>Volver a mis órdenes</button></div></div>
      <p className="queue-intro">Los registros permanecen en este dispositivo hasta recibir confirmación válida.</p>
      {items.length ? <>
        {showFullDetails && mobileItem ? <section className="queue-full-details" aria-label="Detalle completo de operación"><button type="button" className="queue-item__detail" onClick={() => setShowFullDetails(false)}>Volver a cola</button><h3>Detalle de operación</h3><p><strong>Identificador:</strong> <span className="queue-full-details__technical" title={mobileItem.operationId}>{mobileItem.operationId}</span></p>{mobileItem.orderId ? <p><strong>Orden:</strong> {mobileItem.orderId}</p> : null}{state.orders.find((order) => order.orderId === mobileItem.orderId)?.context?.customerName ? <p><strong>Cliente:</strong> {state.orders.find((order) => order.orderId === mobileItem.orderId)?.context?.customerName}</p> : null}<p><strong>Estado:</strong> {syncStatusLabel(mobileItem.status)}</p><p><strong>Fecha:</strong> {formatDate(syncItemTimestamp(mobileItem, activityByOperation))}</p><p><strong>Intentos:</strong> {mobileItem.attempts}</p>{mobileItem.errorCode ? <p className="queue-error"><strong>Error:</strong> {mobileItem.errorCode}</p> : null}{queueReviewMessage(mobileItem) ? <p className="queue-review">{queueReviewMessage(mobileItem)}</p> : null}</section> : <><div className="queue-list queue-list--desktop">{items.map((item) => renderItem(item, false))}</div><div className="queue-list queue-list--mobile" aria-label="Operación de cola">{mobileItem ? renderItem(mobileItem, true) : null}</div></>}
        <PaginationControls className="queue-pagination" label="Paginación de cola" page={page} totalPages={pageCount} onPrevious={() => setRequestedPage(Math.max(1, page - 1))} onNext={() => setRequestedPage(Math.min(pageCount, page + 1))} />
      </> : <AppStateCard layout="inline" tone="empty" className="empty-state" title="Cola despejada" description="No hay operaciones locales para mostrar." />}
    </section>
  );
}

export function queuePageItem(items: SyncItem[], requestedPage: number) {
  const pageCount = Math.max(1, items.length);
  const page = Number.isFinite(requestedPage) ? Math.min(pageCount, Math.max(1, Math.trunc(requestedPage))) : 1;
  return { page, pageCount, item: items[page - 1] };
}

function QueueItem({ item, displayedAt, order, onRetry, onViewOrder, onViewFullDetails, canRetry, canVerify, mobile }: { item: SyncItem; displayedAt?: string; order?: WorkOrder; onRetry: () => void; onViewOrder: (orderId: string) => void; onViewFullDetails: () => void; canRetry: boolean; canVerify: boolean; mobile: boolean }) {
  const manualReview = Boolean(item.manualReview);
  const uncertain = Boolean(item.uncertain);
  const protectedFromRetry = manualReview || uncertain;
  const reviewMessage = queueReviewMessage(item);
  return (
    <article className="queue-item">
      <div className="queue-item__header"><div><strong>{queueActionLabel(item.action)}</strong><span className="queue-item__customer" title={`${order?.context?.customerName || "Cliente no disponible"} · ${item.orderId ?? "Orden no disponible"}`} aria-label={`Cliente ${order?.context?.customerName || "no disponible"}; orden ${item.orderId ?? "no disponible"}`}>{order?.context?.customerName || "Cliente no disponible"} · {item.orderId ?? "Orden no disponible"}</span></div><span className={`queue-status queue-status--${item.status}`}>{syncStatusLabel(item.status)}</span></div>
      <div className="queue-item__meta"><span>{formatDate(displayedAt)}</span><span>{item.attempts} intento(s)</span><span className="technical-id" title={item.operationId} aria-label={`Identificador completo de operación: ${item.operationId}`}>Operación {shortTechnicalId(item.operationId)}</span></div>
      {mobile && reviewMessage ? <p className="queue-review queue-review--mobile">{reviewMessage}</p> : null}
      {mobile && item.errorCode && item.errorCode.length <= 36 ? <p className="queue-error queue-error--mobile">Error: {item.errorCode}</p> : null}
      <div className="queue-item__actions">
        {(item.status === "pending" || item.status === "failed") && !protectedFromRetry ? <button type="button" className="queue-item__retry" disabled={!canRetry} onClick={onRetry}>Reintentar</button> : null}
        {mobile && item.status === "failed" && uncertain && !manualReview ? <button type="button" className="queue-item__verify" disabled={!canVerify} onClick={onRetry}>Verificar estado</button> : null}
        {mobile && (item.errorCode || manualReview || uncertain) ? <button type="button" className="queue-item__detail" onClick={onViewFullDetails}>Ver error y contexto</button> : null}
        {!mobile && item.errorCode ? <p className="queue-error">{manualReview ? "Requiere revisión humana. " : "Último aviso: "}{item.errorCode}</p> : null}
        {!mobile && reviewMessage ? <p className="queue-review">{reviewMessage}</p> : null}
        {item.orderId ? <button type="button" className="queue-item__detail" onClick={() => onViewOrder(item.orderId ?? "")}>Ver detalle</button> : null}
      </div>
    </article>
  );
}

export { queueReviewMessage } from "../utils/field-app-utils";
