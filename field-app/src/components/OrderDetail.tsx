/**
 * Ficha de una orden para el técnico: datos del cliente y suministro, deuda y kardex, mapa, actividad local y
 * las acciones permitidas (visita, corte, reconexión). Abre `CaptureForm` para registrar una acción y muestra
 * el resultado distinguiendo confirmado, guardado localmente, bloqueado e incierto.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { ActionResult, ActivityEntry, AppState, AppStore } from "../state/store";
import type { ConnectivityMode, WorkOrder, ActionKind, OperationRecord, TechnicianRecordEntry } from "../domain/types";
import { TechnicianRecordDialog } from "./TechnicianRecordDialog";
import { NewAuthorizationAction } from "./NewAuthorizationAction";
import { FieldMap } from "./FieldMap";
import { IconAlertTriangle, IconCheckCircle, IconMap, IconPin, IconScissors } from "./common/Icons";
import { AppModal } from "./common/Modal";
import { CaptureForm } from "./CaptureForm";
import { isManualVisitAllowed, hasCadastralCoordinates } from "../domain/policies";
import { activityLabel, activityDetail, activityException, orderStatusLabel, fieldOrderStatusLabel, physicalStatusLabel, orderStatusTone, syncStatusLabel } from "../utils/labels";
import { displayValue, formatDebt, formatDate, shortHash, shortTechnicalId, orderActivityReviewPages } from "../utils/format";
import { paginateReviewFields } from "../utils/pagination";

export type OrderReviewView = "review" | "details" | "map" | "activity";

export function OrderDetail({
  order,
  state,
  store,
  enableReconnection,
  technicianName,
  initialAction,
  listServerRecord,
  onBack,
}: {
  order: WorkOrder;
  state: AppState;
  store: AppStore;
  enableReconnection: boolean;
  technicianName?: string;
  initialAction?: ActionKind | null;
  /** Registro del servidor de esta orden; sin él (modo simulado) la ficha no ofrece la consulta. */
  listServerRecord?: (orderId: string) => Promise<TechnicianRecordEntry[]>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<ActionKind | null>(initialAction === "VISIT" && !isManualVisitAllowed(order) ? null : initialAction ?? null);
  const [actionCompletion, setActionCompletion] = useState<ActionResult>();
  const [serverRecordOpen, setServerRecordOpen] = useState(false);
  const [mobileView, setMobileView] = useState<OrderReviewView>("review");
  const [kardexIndex, setKardexIndex] = useState(0);
  // Corte o reconexión de esta orden que quedó incierto y que el técnico puede verificar con el servidor.
  const unresolvedOperation = state.activity.map((entry) => entry.record).find((record): record is OperationRecord => record.orderId === order.orderId && record.kind !== "VISIT" && record.physicalStatus === "PHYSICAL_UNKNOWN");
  const verifyUnresolved = () => {
    if (!unresolvedOperation) return;
    void (unresolvedOperation.kind === "RECONNECTION" ? store.verifyReconnection(unresolvedOperation.operationId) : store.sync());
  };
  const uncertainActions = unresolvedOperation ? <>
    <button type="button" className="secondary-action" disabled={Boolean(state.busyAction)} onClick={verifyUnresolved}>Verificar con servidor</button>
    <NewAuthorizationAction record={unresolvedOperation} busy={Boolean(state.busyAction)} onConfirm={() => void store.retryWithNewAuthorization(unresolvedOperation.operationId)} />
  </> : null;
  const [detailsPageIndex, setDetailsPageIndex] = useState(0);
  const [activityPageIndex, setActivityPageIndex] = useState(0);
  const isCancelled = order.status === "ANULADO";
  const canCut = order.status === "GENERADO" && order.physicalStatus === "NONE";
  const canRegisterVisit = isManualVisitAllowed(order);
  const locationHref = order.context && hasCadastralCoordinates(order.context)
    ? `https://www.google.com/maps/search/?api=1&query=${order.context.cadastralLatitude},${order.context.cadastralLongitude}`
    : undefined;

  useEffect(() => {
    setMobileView("review");
    setKardexIndex(0);
    setDetailsPageIndex(0);
    setActivityPageIndex(0);
  }, [order.orderId]);

  useEffect(() => {
    if (initialAction && (initialAction !== "VISIT" || canRegisterVisit)) setDraft(initialAction);
  }, [canRegisterVisit, initialAction]);

  return (
    <section className="detail-panel panel detail-panel--fullscreen" aria-label={`Detalle de ${order.orderId}`}>
      <MobileOrderReview
        order={order}
        mode={state.mode}
        entries={state.activity.filter((entry) => entry.record.orderId === order.orderId)}
        view={mobileView}
        onViewChange={setMobileView}
        onBack={onBack}
        canCut={canCut}
        canRegisterVisit={canRegisterVisit}
        canReconnect={enableReconnection && order.status === "EJECUTADO" && order.physicalStatus === "CONFIRMED"}
        busy={Boolean(state.busyAction)}
        onCut={() => setDraft("CUT")}
        onVisit={() => setDraft("VISIT")}
        onReconnect={() => setDraft("RECONNECTION")}
        kardexIndex={kardexIndex}
        onKardexIndexChange={setKardexIndex}
        detailsPageIndex={detailsPageIndex}
        onDetailsPageIndexChange={setDetailsPageIndex}
        activityPageIndex={activityPageIndex}
        onActivityPageIndexChange={setActivityPageIndex}
        hidden={Boolean(draft)}
        uncertainActions={uncertainActions}
        onOpenServerRecord={listServerRecord ? () => setServerRecordOpen(true) : undefined}
      />
      <div className="order-detail-legacy">
        <div className="detail-navigation-bar">
          <button type="button" className="btn-back" onClick={onBack}>← Volver a la bandeja de órdenes</button>
        </div>

        {isCancelled ? (
          <div className="alert-banner alert-banner-warning" role="alert">
            <strong>ORDEN ANULADA:</strong> La orden fue anulada administrativamente.
          </div>
        ) : null}

        <header className="order-detail-header">
          <div className="order-detail-header__identity">
            <span className="eyebrow">ORDEN ACTUAL</span>
            <h2>Cuenta / suministro {order.context?.accountId || order.accountId || "Cuenta no disponible"} · Medidor {order.context?.meterId || "Medidor no disponible"}</h2>
            <p>{order.context?.customerName || order.orderId}</p>
          </div>
          <div className="order-detail-header__status">
            <span className={`status-badge order-status-label status-badge--${orderStatusTone(order)}`}>
              {orderStatusLabel(order.status)}
            </span>
            <div className="order-detail-identifiers">
              <span className="technical-id">Orden {shortTechnicalId(order.orderId)}</span>
              {order.cuc ? <span className="technical-id">CUC: {shortTechnicalId(order.cuc)}</span> : null}
            </div>
          </div>
        </header>

        {order.physicalStatus !== "NONE" ? (
          <div className="order-detail-physical-status">
            <span>Estado físico</span>
            <strong>{physicalStatusLabel(order.physicalStatus)}</strong>
            {order.physicalStatus === "PHYSICAL_UNKNOWN" ? <small>Revisión humana requerida. No repetir acción.</small> : null}
          </div>
        ) : null}

        {order.physicalStatus === "PHYSICAL_UNKNOWN" ? (
          <div className="review-callout" role="alert">
            <strong>Resultado incierto</strong>
            {unresolvedOperation ? (
              <>
                <span>Verifique {unresolvedOperation.kind === "CUT" ? "el corte" : "la reconexión"} con el servidor. No repita la acción.</span>
                {uncertainActions}
              </>
            ) : <span>Espere conciliación operativa. No hay acción de repetición disponible.</span>}
          </div>
        ) : null}

        {order.context ? <OperationalContext context={order.context} /> : <div className="context-missing">Contexto operativo no disponible en este paquete.</div>}
        <ActivityPanel entries={state.activity.filter((entry) => entry.record.orderId === order.orderId)} />

        <div className="order-detail-actions">
          {canCut ? (
            <button className="primary-action" disabled={Boolean(state.busyAction)} onClick={() => setDraft("CUT")}>
              <IconScissors />
              Registrar corte
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
          <div className="order-detail-actions__secondary">
            {listServerRecord ? <button type="button" className="secondary-action" onClick={() => setServerRecordOpen(true)}>Ver registro del servidor</button> : null}
            {canRegisterVisit ? (
              <button className={canCut ? "secondary-action" : "primary-action"} disabled={Boolean(state.busyAction)} onClick={() => setDraft("VISIT")}>
                Registrar visita
                <span aria-hidden="true">→</span>
              </button>
            ) : null}
            {locationHref ? (
              <a className="secondary-action" href={locationHref} target="_blank" rel="noreferrer"><IconMap />Ver ubicación</a>
            ) : (
              <button type="button" className="secondary-action" disabled><IconMap />Ver ubicación</button>
            )}
            {enableReconnection && order.status === "EJECUTADO" && order.physicalStatus === "CONFIRMED" ? (
              <button className="secondary-action" disabled={Boolean(state.busyAction)} onClick={() => setDraft("RECONNECTION")}>
                Preparar reconexión <span aria-hidden="true">→</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {draft ? (
        <CaptureForm
          kind={draft}
          order={order}
          store={store}
          technicianName={technicianName}
          busy={state.busyAction === draft}
          blocked={order.physicalStatus === "PHYSICAL_UNKNOWN" || order.status === "ANULADO"}
          onCancel={() => setDraft(null)}
          onSubmit={async (input) => {
            let completed: boolean;
            if (draft === "VISIT") {
              const result = await store.registerVisit(order.orderId, input);
              setActionCompletion(result);
              completed = result.localSaved;
            } else if (draft === "CUT") {
              const result = await store.executeCut(order.orderId, input);
              setActionCompletion(result);
              completed = result.localSaved;
            } else {
              const result = await store.executeReconnection(order.orderId, input);
              setActionCompletion(result);
              completed = result.localSaved;
            }
            if (completed) setDraft(null);
            return completed;
          }}
        />
      ) : null}
      {serverRecordOpen && listServerRecord ? <TechnicianRecordDialog orderId={order.orderId} listRecord={listServerRecord} onClose={() => setServerRecordOpen(false)} /> : null}
      {actionCompletion ? <ActionCompletionDialog result={actionCompletion} onDismiss={() => setActionCompletion(undefined)} /> : null}
    </section>
  );
}

export function ActionCompletionDialog({ result, onDismiss }: { result: ActionResult; onDismiss: () => void }) {
  const content = completionDialogContent(result);
  const showSuccessIcon = result.outcome !== "review";
  return (
    <AppModal variant="completion" className={`cut-completion--${result.outcome}`} titleId="cut-completion-title" title={content.title} describedBy="cut-completion-message" icon={showSuccessIcon ? <IconCheckCircle /> : <IconAlertTriangle />} hideCloseButton onClose={onDismiss}>
      <p id="cut-completion-message">{content.message}</p>
      <button type="button" className="primary-action" onClick={onDismiss}>Listo</button>
    </AppModal>
  );
}

function completionDialogContent(result: ActionResult): { title: string; message: string } {
  if (result.requestedAction === "RECONNECTION" && result.outcome === "review" && result.recordedAction === "RECONNECTION" && result.physicalStatus === "CONFIRMED") return { title: "Sincronización incierta", message: "La reposición quedó guardada localmente, pero falta confirmar el ACK del servidor. Verifique el estado y no vuelva a ejecutar la acción." };
  if (result.outcome === "review") return { title: "Resultado incierto", message: "Los datos siguen guardados, pero se requiere revisión humana. No repita la acción." };
  if (result.requestedAction === "RECONNECTION") {
    if (!result.localSaved) return { title: "Reposición bloqueada", message: "No se confirmó la habilitación. La acción no quedó registrada como reposición." };
    if (result.recordedAction === "VISIT") return { title: "Reposición bloqueada", message: "La visita quedó guardada, pero la reposición no se ejecutó porque la habilitación no fue confirmada." };
    if (result.outcome === "blocked") return { title: "Reposición bloqueada", message: "El intento quedó guardado para auditoría, pero no se registró como una reposición completada." };
    return result.outcome === "confirmed"
      ? { title: "Reposición confirmada", message: "La reposición y sus datos históricos quedaron guardados y confirmados por el servidor." }
      : { title: "Reposición guardada", message: "La reposición y sus datos quedaron guardados en este dispositivo. El servidor todavía no confirmó la sincronización." };
  }
  if (result.requestedAction === "CUT" && result.recordedAction === "VISIT") {
    return result.syncStatus === "synced"
      ? { title: "Visita confirmada", message: "La visita y los datos capturados quedaron guardados y fueron confirmados por el servidor. El corte no se ejecutó porque requiere autorización online." }
      : { title: "Visita guardada", message: "La visita y los datos capturados quedaron guardados en este dispositivo. El corte no se ejecutó porque requiere autorización online. Se enviarán automáticamente cuando haya conexión." };
  }
  if (result.recordedAction === "VISIT") return result.outcome === "confirmed"
    ? { title: "Visita confirmada", message: "La visita quedó guardada y fue confirmada por el servidor." }
    : { title: "Visita guardada", message: "La visita quedó guardada en este dispositivo y se subirá automáticamente cuando haya conexión." };
  if (result.outcome === "confirmed") return { title: "Corte confirmado", message: "El corte quedó guardado y confirmado por el servidor." };
  if (result.outcome === "blocked") return { title: "Corte no ejecutado", message: "El corte fue bloqueado por una validación externa. Los datos quedaron guardados y no debe repetir la acción." };
  return { title: "Datos del corte guardados", message: "La información quedó guardada en este dispositivo. El servidor todavía no la confirmó. No repita la acción." };
}

function MobileOrderReview({
  order, mode, entries, view, onViewChange, onBack, canCut, canRegisterVisit, canReconnect, busy,
  onCut, onVisit, onReconnect, kardexIndex, onKardexIndexChange, detailsPageIndex, onDetailsPageIndexChange,
  activityPageIndex, onActivityPageIndexChange, hidden, uncertainActions, onOpenServerRecord,
}: {
  order: WorkOrder;
  mode: ConnectivityMode;
  entries: ActivityEntry[];
  view: OrderReviewView;
  onViewChange: (view: OrderReviewView) => void;
  onBack: () => void;
  canCut: boolean;
  canRegisterVisit: boolean;
  canReconnect: boolean;
  busy: boolean;
  onCut: () => void;
  onVisit: () => void;
  onReconnect: () => void;
  kardexIndex: number;
  onKardexIndexChange: (index: number) => void;
  detailsPageIndex: number;
  onDetailsPageIndexChange: (index: number) => void;
  activityPageIndex: number;
  onActivityPageIndexChange: (index: number) => void;
  hidden: boolean;
  uncertainActions?: ReactNode;
  onOpenServerRecord?: () => void;
}) {
  const context = order.context;
  const kardex = context?.kardex ?? [];
  const currentKardex = kardex[kardexIndex];
  const activityPages = orderActivityReviewPages(entries);
  const currentActivityPage = activityPages[activityPageIndex];
  const status = fieldOrderStatusLabel(order);
  const debt = formatDebt(context?.debtCents);
  const account = context?.accountId || order.accountId;
  const meter = context?.meterId;
  const detailFields = context ? [
    { label: "Referencia", value: context.references },
    { label: "Ruta", value: context.route },
    { label: "Circuito", value: context.circuit },
    { label: "Localidad", value: context.locality },
    { label: "Estado del suministro", value: context.supplyStatus === "A" ? "Activo" : context.supplyStatus },
    { label: "Actualización", value: formatDate(context.updatedAt) },
    { label: "Tarifa", value: context.tariff },
    { label: "Coordenadas", value: hasCadastralCoordinates(context) ? `${context.cadastralLatitude!.toFixed(6)}, ${context.cadastralLongitude!.toFixed(6)}` : undefined },
  ] : [];
  const detailPages = paginateReviewFields(detailFields);
  const detailsPageCount = detailPages.length;
  const showKardex = detailsPageIndex === detailsPageCount;
  const detailPageLabel = showKardex ? "Kardex" : `Datos ${detailsPageIndex + 1} de ${detailsPageCount}`;

  return (
    <section className="order-review-mobile" aria-label="Revisión de orden" hidden={hidden}>
      <div className="order-review-toolbar"><button type="button" className="order-review-back" onClick={onBack}>← Volver</button><span>Orden {shortTechnicalId(order.orderId)}</span></div>
      <nav className="order-review-navigation" aria-label="Vistas de la orden">
        {([ ["review", "Resumen"], ["details", "Datos"], ["map", "Mapa"], ["activity", "Actividad"] ] as const).filter(([target]) => target !== "activity" || entries.length > 0).map(([target, label]) => (
          <button key={target} type="button" aria-pressed={view === target} onClick={() => onViewChange(target)}>{label}{target === "activity" && entries.length ? ` ${entries.length}` : ""}</button>
        ))}
      </nav>

      {view === "review" ? (
        <div className="order-review-screen order-review-screen--summary" role="region" aria-label="Resumen prioritario de la orden">
          <header className="order-review-identity"><h2>Cuenta {displayValue(account)} · Medidor {displayValue(meter)}</h2><p>{displayValue(context?.customerName)}</p></header>
          {order.status === "ANULADO" ? <div className="order-review-alert order-review-alert--cancelled" role="alert"><strong>Corte bloqueado</strong><span>La orden fue anulada administrativamente. No registrar corte ni visita.</span></div> : null}
          {order.physicalStatus === "PHYSICAL_UNKNOWN" ? <div className="order-review-alert order-review-alert--unknown" role="alert"><strong>No repetir acción</strong><span>{uncertainActions ? "Verifique con el servidor." : "Revisión humana requerida."}</span>{uncertainActions}</div> : null}
          <div className="order-review-facts">
            <div className="order-review-fact order-review-fact--address"><span>Dirección</span><strong>{displayValue(context?.address)}</strong></div>
            <div className="order-review-fact"><span>Deuda</span><strong className="order-review-debt">{displayValue(debt)}</strong><small>{context?.monthsPending === undefined ? "Dato no disponible" : `${context.monthsPending} facturas pendientes`}</small></div>
            <div className="order-review-fact"><span>Estado</span><strong>{status}</strong>{order.physicalStatus !== "NONE" ? <small>Físico: {physicalStatusLabel(order.physicalStatus)}</small> : null}</div>
          </div>
          <div className="order-review-actions">
            {canCut ? <button type="button" className="primary-action" disabled={busy} onClick={onCut}><IconScissors />Registrar corte</button> : null}
            {canReconnect ? <button type="button" className="primary-action" disabled={busy} onClick={onReconnect}>Preparar reconexión</button> : null}
            {canRegisterVisit && canCut ? <button type="button" className="order-review-secondary-action" disabled={busy} onClick={onVisit}>Registrar visita</button> : null}
            {onOpenServerRecord ? <button type="button" className="order-review-secondary-action" onClick={onOpenServerRecord}>Ver registro del servidor</button> : null}
            {!canCut && !canReconnect && !canRegisterVisit ? <p className="order-review-no-action">Sin acciones disponibles para este estado.</p> : null}
          </div>
        </div>
      ) : null}

      {view === "details" ? (
        <section className="order-review-screen order-review-screen--details" aria-label="Datos secundarios de la orden">
          <h2>Datos del suministro</h2>
          {context ? <>
            {!showKardex ? <div className="order-review-detail-grid">{detailPages[detailsPageIndex]?.map((field) => <ReviewData key={field.label} label={field.label} value={field.value} />)}</div> : null}
            {showKardex ? <section className="order-review-kardex" aria-label="Kardex de deuda"><div><strong>Kardex</strong><span>{kardex.length ? `${kardexIndex + 1} de ${kardex.length}` : "No disponible"}</span></div>{currentKardex ? <p>{currentKardex.period} · {formatDebt(currentKardex.amountCents) ?? "Dato no disponible"} · {currentKardex.daysLate ?? "Dato no disponible"} días mora</p> : <p>Historial no disponible en paquete local.</p>}{kardex.length > 1 ? <div className="order-review-pager"><button type="button" disabled={kardexIndex <= 0} onClick={() => onKardexIndexChange(kardexIndex - 1)}>Anterior</button><button type="button" disabled={kardexIndex >= kardex.length - 1} onClick={() => onKardexIndexChange(kardexIndex + 1)}>Siguiente</button></div> : null}</section> : null}
            <div className="order-review-pager" role="group" aria-label="Páginas de datos"><button type="button" disabled={detailsPageIndex <= 0} onClick={() => onDetailsPageIndexChange(detailsPageIndex - 1)}>Anterior</button><span>{detailPageLabel}</span><button type="button" disabled={detailsPageIndex >= detailsPageCount} onClick={() => onDetailsPageIndexChange(detailsPageIndex + 1)}>Siguiente</button></div>
          </> : <p className="order-review-no-action">Datos operativos no disponibles en este paquete local.</p>}
        </section>
      ) : null}

      {view === "map" ? <OrderReviewMap order={order} mode={mode} onViewChange={onViewChange} /> : null}
      {view === "activity" && activityPages.length > 0 ? <section className="order-review-screen order-review-screen--activity" aria-label="Actividad de la orden"><article className="order-review-activity-page" aria-live="polite"><h3>{currentActivityPage?.title}</h3><p>{currentActivityPage?.text}</p></article>{activityPages.length > 1 ? <div className="order-review-pager"><button type="button" disabled={activityPageIndex <= 0} onClick={() => onActivityPageIndexChange(activityPageIndex - 1)}>Anterior</button><span>{activityPageIndex + 1} de {activityPages.length}</span><button type="button" disabled={activityPageIndex >= activityPages.length - 1} onClick={() => onActivityPageIndexChange(activityPageIndex + 1)}>Siguiente</button></div> : null}</section> : null}
    </section>
  );
}

export function OrderReviewMap({ order, mode, onViewChange }: { order: WorkOrder; mode: ConnectivityMode; onViewChange: (view: OrderReviewView) => void }) {
  const context = order.context;
  const hasCoordinates = hasCadastralCoordinates(context);
  return (
    <section className="order-review-screen order-review-screen--map" aria-label="Mapa de ubicación">
      <div className="order-review-map-address"><strong>{displayValue(context?.address)}</strong><span>{displayValue(context?.references)}</span></div>
      {hasCoordinates ? <FieldMap orders={[order]} selectedOrderId={order.orderId} onSelectOrder={() => onViewChange("details")} mode={mode} /> : <div className="field-map-container field-map-container--empty" role="group" aria-label="Ubicación de esta orden no disponible"><div className="field-map-empty" role="status"><IconMap /><strong>Ubicación de esta orden no disponible</strong></div></div>}
    </section>
  );
}

function ReviewData({ label, value }: { label: string; value?: string }) {
  return <div className="order-review-fact"><span>{label}</span><strong>{displayValue(value)}</strong></div>;
}

function OperationalContext({ context }: { context: NonNullable<WorkOrder["context"]> }) {
  return (
    <section className="order-detail-context" aria-label="Cliente y suministro">
      <div className="order-detail-section-heading"><div><span className="eyebrow">DATOS PARA TRABAJAR</span><h3>Cliente y suministro</h3></div><span className="context-source">Actualizado {formatDate(context.updatedAt)}</span></div>
      <div className="detail-location"><IconPin /><div><span>Dirección</span><strong>{context.address || "Dato no disponible"}</strong><small>{context.references || "Sin referencia adicional"}</small></div></div>
      <div className="detail-debt"><div><span>Deuda de referencia</span><strong>{formatDebt(context.debtCents) ?? "Dato no disponible"}</strong></div><span>{context.monthsPending} facturas pendientes</span></div>
      <div className="context-grid"><div className="data-point"><span>Cuenta / suministro</span><strong>{context.accountId || "Dato no disponible"} · {context.supplyId || "Dato no disponible"}</strong></div><div className="data-point"><span>Medidor</span><strong>{context.meterId || "Dato no disponible"}{context.meterBrand ? ` · ${context.meterBrand}` : ""}</strong></div><div className="data-point"><span>Ruta / circuito</span><strong>{context.route || "Dato no disponible"} · {context.circuit || "Dato no disponible"}</strong></div><div className="data-point"><span>Localidad / estado</span><strong>{context.locality || "Dato no disponible"} · {context.supplyStatus || "Dato no disponible"}</strong></div></div>
      <section className="order-detail-kardex" aria-label="Kardex y deuda"><div className="order-detail-section-heading order-detail-section-heading--compact"><h3>Kardex y deuda</h3></div>{context.kardex.length ? <div className="kardex-table-wrap"><table className="kardex-table"><thead><tr><th scope="col">Periodo</th><th scope="col">Monto</th><th scope="col">Días mora</th></tr></thead><tbody>{context.kardex.map((entry) => <tr key={entry.entryId}><td>{entry.period}</td><td>{formatDebt(entry.amountCents) ?? "Dato no disponible"}</td><td>{entry.daysLate ?? "Dato no disponible"}</td></tr>)}</tbody></table></div> : <p className="kardex-empty">Historial no disponible en paquete local.</p>}</section>
      <details className="order-detail-technical"><summary>Datos técnicos</summary><div className="order-detail-technical__grid"><div className="data-point"><span>Tarifa</span><strong>{context.tariff || "Dato no disponible"}</strong></div><div className="data-point"><span>Coordenadas</span><strong>{context.cadastralLatitude !== undefined && context.cadastralLongitude !== undefined ? `${context.cadastralLatitude.toFixed(6)}, ${context.cadastralLongitude.toFixed(6)}` : "No disponibles"}</strong></div></div></details>
    </section>
  );
}

function ActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="order-detail-local-state" aria-label="Estado local">
      <div className="order-detail-local-state__heading"><h3>Estado local</h3></div>
      {entries.length ? <div className="activity-entry-list">{entries.map((entry) => <article className="activity-entry" key={entry.record.operationId}><div className="activity-entry__top"><strong>{activityLabel(entry.record.kind)}</strong><span>{syncStatusLabel(entry.record.syncStatus)}</span></div><p>{formatDate(entry.record.recordedAt)} · {activityDetail(entry.record)}</p>{entry.evidence.length ? <div className="evidence-list">{entry.evidence.map((evidence) => <div className="evidence-meta" key={evidence.evidenceId}><strong>{evidence.mimeType === "image/jpeg" ? "JPEG" : "PNG"} · {evidence.width} × {evidence.height}</strong><span>Guardada localmente · SHA-256 {shortHash(evidence.contentHash)}</span></div>)}</div> : activityException(entry.record) ? <div className="exception-meta">Excepción: {activityException(entry.record)}</div> : null}</article>)}</div> : <p className="order-detail-local-state__empty">Sin actividad local registrada.</p>}
    </section>
  );
}

