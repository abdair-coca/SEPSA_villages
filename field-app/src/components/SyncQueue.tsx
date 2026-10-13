/**
 * Cola de sincronización visible para el técnico: estado, intentos y errores de cada operación. Ofrece
 * reintentar solo lo que es seguro reintentar; las operaciones inciertas o en revisión humana no se reenvían.
 */
import { useState } from "react";
import type { AppState, AppStore } from "../state/store";
import type { OperationRecord, WorkOrder } from "../domain/types";
import { NewAuthorizationAction } from "./NewAuthorizationAction";
import type { SyncItem } from "../ports/sync";
import { PaginationControls } from "./common/PaginationControls";
import { AppStateCard } from "./common/UiState";
import { isUsable } from "../domain/policies";
import { queueActionLabel, syncStatusLabel, queueReviewMessage } from "../utils/labels";
import { errorGuidance } from "../utils/error-catalog";
import { sortSyncItemsForDisplay, activityTimestampsByOperation, syncItemTimestamp } from "../utils/sorting";
import { formatDate, shortTechnicalId } from "../utils/format";
import { queuePageItem } from "../utils/pagination";

export function QueuePanel({ state, store }: { state: AppState; store: AppStore }) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const activityByOperation = activityTimestampsByOperation(state.activity);
  const items = sortSyncItemsForDisplay(state.syncItems, state.activity);
  const canRunQueueSync = isUsable(state.mode) && state.busyAction !== "SYNC";
  const { page, pageCount, item: mobileItem } = queuePageItem(items, requestedPage);
  const operations = new Map(state.activity.flatMap((entry) => entry.record.kind === "VISIT" ? [] : [[entry.record.operationId, entry.record as OperationRecord] as const]));
  const renderItem = (item: SyncItem, mobile: boolean) => (
    <QueueItem key={item.operationId} item={item} operation={operations.get(item.operationId)} busy={Boolean(state.busyAction)} onRetryWithNewAuthorization={() => void store.retryWithNewAuthorization(item.operationId)} displayedAt={syncItemTimestamp(item, activityByOperation)} order={state.orders.find((order) => order.orderId === item.orderId)} onRetry={() => void store.sync()} onVerifyReconnection={() => void store.verifyReconnection(item.operationId)} onViewOrder={(orderId) => { store.setTab("orders"); store.selectOrder(orderId); }} onViewFullDetails={() => setShowFullDetails(true)} canRetry={!mobile || canRunQueueSync} canVerify={canRunQueueSync} mobile={mobile} />
  );
  return (
    <section className="queue-panel panel" aria-label="Cola de sincronización">
      <div className="panel-heading"><div><div className="eyebrow">TRAZABILIDAD LOCAL</div><h2>Cola de sincronización</h2></div><div className="queue-panel__actions"><button type="button" className="toolbar-action" onClick={() => store.setTab("orders")}>Volver a mis órdenes</button></div></div>
      <p className="queue-intro">Los registros permanecen en este dispositivo hasta recibir confirmación válida.</p>
      {items.length ? <>
        {showFullDetails && mobileItem ? <section className="queue-full-details" aria-label="Detalle completo de operación"><button type="button" className="queue-item__detail" onClick={() => setShowFullDetails(false)}>Volver a cola</button><h3>Detalle de operación</h3><p><strong>Identificador:</strong> <span className="queue-full-details__technical" title={mobileItem.operationId}>{mobileItem.operationId}</span></p>{mobileItem.orderId ? <p><strong>Orden:</strong> {mobileItem.orderId}</p> : null}{state.orders.find((order) => order.orderId === mobileItem.orderId)?.context?.customerName ? <p><strong>Cliente:</strong> {state.orders.find((order) => order.orderId === mobileItem.orderId)?.context?.customerName}</p> : null}<p><strong>Estado:</strong> {syncStatusLabel(mobileItem.status)}</p><p><strong>Fecha:</strong> {formatDate(syncItemTimestamp(mobileItem, activityByOperation))}</p><p><strong>Intentos:</strong> {mobileItem.attempts}</p>{mobileItem.errorCode ? <p className="queue-error"><strong>Último aviso:</strong> {mobileItem.errorCode}</p> : null}<ErrorDetails item={mobileItem} />{queueReviewMessage(mobileItem) ? <p className="queue-review">{queueReviewMessage(mobileItem)}</p> : null}</section> : <><div className="queue-list queue-list--desktop">{items.map((item) => renderItem(item, false))}</div><div className="queue-list queue-list--mobile" aria-label="Operación de cola">{mobileItem ? renderItem(mobileItem, true) : null}</div></>}
        <PaginationControls className="queue-pagination" label="Paginación de cola" page={page} totalPages={pageCount} onPrevious={() => setRequestedPage(Math.max(1, page - 1))} onNext={() => setRequestedPage(Math.min(pageCount, page + 1))} />
      </> : <AppStateCard layout="inline" tone="empty" className="empty-state" title="Cola despejada" description="No hay operaciones locales para mostrar." />}
    </section>
  );
}

function QueueItem({ item, operation, busy, onRetryWithNewAuthorization, displayedAt, order, onRetry, onVerifyReconnection, onViewOrder, onViewFullDetails, canRetry, canVerify, mobile }: { item: SyncItem; operation?: OperationRecord; busy: boolean; onRetryWithNewAuthorization: () => void; displayedAt?: string; order?: WorkOrder; onRetry: () => void; onVerifyReconnection: () => void; onViewOrder: (orderId: string) => void; onViewFullDetails: () => void; canRetry: boolean; canVerify: boolean; mobile: boolean }) {
  const manualReview = Boolean(item.manualReview);
  const uncertain = Boolean(item.uncertain);
  // Una acción física guardada antes de confirmar su autorización (la app se cerró a mitad): solo se verifica.
  const awaitingVerification = operation?.status === "INTENT_PERSISTED" && (operation.action === "RECONNECTION" || operation.authorizationConsumption === "immediate");
  const protectedFromRetry = manualReview || uncertain || awaitingVerification;
  const reviewMessage = queueReviewMessage(item);
  return (
    <article className="queue-item">
      <div className="queue-item__header"><div><strong>{queueActionLabel(item.action)}</strong><span className="queue-item__customer" title={`${order?.context?.customerName || "Cliente no disponible"} · ${item.orderId ?? "Orden no disponible"}`} aria-label={`Cliente ${order?.context?.customerName || "no disponible"}; orden ${item.orderId ?? "no disponible"}`}>{order?.context?.customerName || "Cliente no disponible"} · {item.orderId ?? "Orden no disponible"}</span></div><span className={`queue-status queue-status--${item.status}`}>{syncStatusLabel(item.status)}</span></div>
      <div className="queue-item__meta"><span>{formatDate(displayedAt)}</span><span>{item.attempts} intento(s)</span><span className="technical-id" title={item.operationId} aria-label={`Identificador completo de operación: ${item.operationId}`}>Operación {shortTechnicalId(item.operationId)}</span></div>
      {mobile && reviewMessage ? <p className="queue-review queue-review--mobile">{reviewMessage}</p> : null}
      {mobile && item.errorCode && item.errorCode.length <= 36 ? <p className="queue-error queue-error--mobile">Error: {item.errorCode}</p> : null}
      <div className="queue-item__actions">
        {(item.status === "pending" || item.status === "failed") && !protectedFromRetry ? <button type="button" className="queue-item__retry" disabled={!canRetry} onClick={onRetry}>Reintentar</button> : null}
        {item.action === "RECONNECTION" && (uncertain || awaitingVerification) && !manualReview ? <button type="button" className="queue-item__verify" disabled={!canVerify} onClick={onVerifyReconnection}>Verificar con servidor</button> : null}
        {item.action === "CUT" && awaitingVerification && !uncertain && !manualReview ? <button type="button" className="queue-item__verify" disabled={!canVerify} onClick={onRetry}>Verificar con servidor</button> : null}
        {item.status === "failed" && uncertain && !manualReview && item.action !== "RECONNECTION" ? <button type="button" className="queue-item__verify" disabled={!canVerify} onClick={onRetry}>Verificar estado</button> : null}
        {operation && canVerify ? <NewAuthorizationAction record={operation} busy={busy} onConfirm={onRetryWithNewAuthorization} /> : null}
        {mobile && (item.errorCode || manualReview || uncertain) ? <button type="button" className="queue-item__detail" onClick={onViewFullDetails}>Ver error y contexto</button> : null}
        {!mobile && item.errorCode && !reviewMessage?.startsWith("Cerrada") ? <p className="queue-error">{manualReview ? "Requiere revisión humana. " : "Último aviso: "}{item.errorCode}</p> : null}
        {!mobile && item.uncertainCause && item.uncertainCause !== item.errorCode ? <p className="queue-error">Causa original: {item.uncertainCause}</p> : null}
        {!mobile && reviewMessage ? <p className="queue-review">{reviewMessage}</p> : null}
        {item.orderId ? <button type="button" className="queue-item__detail" onClick={() => onViewOrder(item.orderId ?? "")}>Ver detalle</button> : null}
      </div>
    </article>
  );
}

/** Qué pasó, qué quedó guardado y qué hacer, con la causa original cuando la operación quedó incierta. */
function ErrorDetails({ item }: { item: SyncItem }) {
  const guidance = errorGuidance(item.uncertainCause ?? item.errorCode, { uncertain: Boolean(item.uncertain) });
  if (!guidance) return null;
  return (
    <div className="queue-guidance">
      <p><strong>Qué pasó:</strong> {guidance.title}</p>
      <p><strong>Qué quedó guardado:</strong> {guidance.saved}</p>
      <p><strong>Qué hacer:</strong> {guidance.nextStep}</p>
      {item.uncertainCause ? <p className="queue-error"><strong>Causa original:</strong> {item.uncertainCause}</p> : null}
    </div>
  );
}
