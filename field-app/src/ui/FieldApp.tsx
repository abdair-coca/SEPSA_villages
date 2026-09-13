import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import type { ActivityEntry, AppStore, ActionInput, AppState, OrderFilter } from "../app/index";
import { selectVisibleOrders } from "../app/index";
import type { ConnectivityMode, WorkOrder } from "../domain";

export interface FieldAppProps {
  store: AppStore;
}

export function FieldApp({ store }: FieldAppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => {
    void store.init();
  }, [store]);

  return (
    <div className="field-app">
      <Header state={state} onModeChange={store.setMode} />
      {state.message ? <div className={`message message--${state.message.tone}`} role="status">{state.message.text}</div> : null}
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState text={state.error ?? "No pudimos cargar el paquete local."} onRetry={store.init} /> : null}
      {state.status === "ready" ? <Workbench state={state} store={store} /> : null}
    </div>
  );
}

function Header({ state, onModeChange }: { state: AppState; onModeChange: (mode: ConnectivityMode) => void }) {
  return (
    <header className="app-header">
      <div className="identity-block">
        <div className="eyebrow">SEPSA · CAMPO</div>
        <h1>Jornada de campo</h1>
        <p className="identity">Técnico <strong>tech-camila</strong> · dispositivo <strong>device-rugged-01</strong></p>
      </div>
      <div className="header-meta">
        <div className="network-control">
          <span className={`network-dot network-dot--${state.mode}`} aria-hidden="true" />
          <label htmlFor="network-mode">Red</label>
          <select id="network-mode" value={state.mode} onChange={(event) => onModeChange(event.target.value as ConnectivityMode)}>
            <option value="online">Conectada</option>
            <option value="weak">Señal débil</option>
            <option value="offline">Sin conexión</option>
          </select>
        </div>
        <p className="last-update">Última actualización<br /><strong>{formatDate(state.package?.downloadedAt ?? state.lastRefreshAt)}</strong></p>
      </div>
      <div className="simulation-banner">{"Simulación, sin conexión a SEPSA"}</div>
    </header>
  );
}

function Workbench({ state, store }: { state: AppState; store: AppStore }) {
  const visibleOrders = selectVisibleOrders(state);
  const selectedOrder = state.orders.find((order) => order.orderId === state.selectedOrderId);
  return (
    <main className="workbench">
      <nav className="section-tabs" aria-label="Secciones de trabajo">
        <button className={state.tab === "orders" ? "tab tab--active" : "tab"} onClick={() => store.setTab("orders")}>Órdenes <span>{state.orders.length}</span></button>
        <button className={state.tab === "queue" ? "tab tab--active" : "tab"} onClick={() => store.setTab("queue")}>Cola <span>{pendingCount(state.syncItems)}</span></button>
      </nav>
      {state.tab === "orders" ? (
        <section className="orders-layout" aria-label="Órdenes asignadas">
          <OrdersPanel state={state} orders={visibleOrders} store={store} />
          {selectedOrder ? <OrderDetail order={selectedOrder} state={state} store={store} /> : <EmptyDetail />}
        </section>
      ) : <QueuePanel state={state} store={store} />}
    </main>
  );
}

function OrdersPanel({ state, orders, store }: { state: AppState; orders: WorkOrder[]; store: AppStore }) {
  const filters: Array<{ value: OrderFilter; label: string }> = [
    { value: "ALL", label: "Todas" },
    { value: "GENERADO", label: "Por ejecutar" },
    { value: "EJECUTADO", label: "Ejecutadas" },
    { value: "RECONEXIÓN", label: "Reconectadas" },
    { value: "ANULADO", label: "Anuladas" },
    { value: "REVIEW", label: "Revisión" },
  ];
  return (
    <div className="orders-panel panel">
      <div className="panel-heading">
        <div><div className="eyebrow">PAQUETE v{state.package?.version ?? "—"}</div><h2>Mis órdenes</h2></div>
        <span className="count-badge">{orders.length}</span>
      </div>
      <label className="search-field" htmlFor="order-search"><span aria-hidden="true">⌕</span><input id="order-search" type="search" value={state.query} onChange={(event) => store.setQuery(event.target.value)} placeholder="Buscar por ID de orden" /></label>
      <div className="filter-row" aria-label="Filtrar órdenes">
        {filters.map((filter) => <button key={filter.value} className={state.filter === filter.value ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => store.setFilter(filter.value)}>{filter.label}</button>)}
      </div>
      {orders.length ? <div className="order-list">{orders.map((order) => <OrderListItem key={order.orderId} order={order} selected={state.selectedOrderId === order.orderId} onSelect={() => store.selectOrder(order.orderId)} />)}</div> : <EmptyOrders />}
    </div>
  );
}

function OrderListItem({ order, selected, onSelect }: { order: WorkOrder; selected: boolean; onSelect: () => void }) {
  return (
    <button className={selected ? "order-item order-item--selected" : "order-item"} onClick={onSelect} aria-pressed={selected}>
      <span className="order-item__main"><strong>{order.orderId}</strong><span className="order-state">{orderStatusLabel(order.status)}</span></span>
      <span className="order-item__side"><span className={`status-mark status-mark--${orderStatusTone(order)}`}>{physicalStatusLabel(order.physicalStatus)}</span><span className="chevron" aria-hidden="true">›</span></span>
    </button>
  );
}

function OrderDetail({ order, state, store }: { order: WorkOrder; state: AppState; store: AppStore }) {
  const [draft, setDraft] = useState<ActionKind | null>(null);
  return (
    <section className="detail-panel panel" aria-label={`Detalle de ${order.orderId}`}>
      <div className="detail-topline"><span className="eyebrow">DETALLE DE ORDEN</span><span className="version-tag">Versión {order.version ?? "—"}</span></div>
      <div className="detail-heading"><div><h2>{order.orderId}</h2><p>Orden asignada a tu dispositivo</p></div><span className={`large-status large-status--${orderStatusTone(order)}`}>{orderStatusLabel(order.status)}</span></div>
      <div className="physical-card"><span className="physical-card__label">Estado físico</span><strong>{physicalStatusLabel(order.physicalStatus)}</strong>{order.physicalStatus === "PHYSICAL_UNKNOWN" ? <p>Revisión humana requerida. No repetir acción.</p> : <p>Estado local verificable sin conexión.</p>}</div>
      {order.physicalStatus === "PHYSICAL_UNKNOWN" ? <div className="review-callout" role="alert"><strong>Resultado incierto</strong><span>Espere conciliación operativa. No hay acción de repetición disponible.</span></div> : null}
      <ActivityPanel entries={state.activity.filter((entry) => entry.record.orderId === order.orderId)} />
      <div className="action-stack">
        <button className="primary-action" disabled={Boolean(state.busyAction)} onClick={() => setDraft("VISIT")}>Registrar visita <span>→</span></button>
        {order.status === "GENERADO" && order.physicalStatus === "NONE" ? <button className="secondary-action" disabled={Boolean(state.busyAction)} onClick={() => setDraft("CUT")}>Preparar corte <span>→</span></button> : null}
        {order.status === "EJECUTADO" && order.physicalStatus === "CONFIRMED" ? <button className="secondary-action" disabled={Boolean(state.busyAction)} onClick={() => setDraft("RECONNECTION")}>Preparar reconexión <span>→</span></button> : null}
      </div>
      {draft ? <ActionForm kind={draft} order={order} busy={state.busyAction === draft} onCancel={() => setDraft(null)} onSubmit={async (input) => { if (draft === "VISIT") await store.registerVisit(order.orderId, input); else if (draft === "CUT") await store.executeCut(order.orderId, input); else await store.executeReconnection(order.orderId, input); setDraft(null); }} /> : null}
    </section>
  );
}

function ActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length) return <div className="activity-empty">Sin actividad local registrada.</div>;
  return <section className="activity-panel" aria-label="Actividad local"><div className="eyebrow">ACTIVIDAD LOCAL</div>{entries.map((entry) => <article className="activity-entry" key={entry.record.operationId}><div className="activity-entry__top"><strong>{activityLabel(entry.record.kind)}</strong><span>{syncStatusLabel(entry.record.syncStatus)}</span></div><p>{formatDate(entry.record.recordedAt)} · {activityDetail(entry.record)}</p>{entry.evidence.length ? <div className="evidence-list">{entry.evidence.map((evidence) => <div className="evidence-meta" key={evidence.evidenceId}><strong>{evidence.mimeType === "image/jpeg" ? "JPEG" : "PNG"} · {evidence.width} × {evidence.height}</strong><span>Guardada localmente · SHA-256 {shortHash(evidence.contentHash)}</span></div>)}</div> : activityException(entry.record) ? <div className="exception-meta">Excepción: {activityException(entry.record)}</div> : null}</article>)}</section>;
}

type ActionKind = "VISIT" | "CUT" | "RECONNECTION";

function ActionForm({ kind, order, busy, onCancel, onSubmit }: { kind: ActionKind; order: WorkOrder; busy: boolean; onCancel: () => void; onSubmit: (input: ActionInput) => Promise<void> }) {
  const [file, setFile] = useState<File | undefined>();
  const [useException, setUseException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requiresExternal = kind !== "VISIT";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (kind !== "VISIT" && !file && !useException) return setFormError("Adjunte un archivo JPEG/PNG o marque excepción.");
    if (useException && !exceptionReason.trim()) return setFormError("Escriba una justificación para la excepción.");
    setFormError("");
    setSubmitting(true);
    try { await onSubmit({ file, exceptionReason: useException ? exceptionReason : undefined, reason: requiresExternal ? `Intento de ${actionLabel(kind).toLocaleLowerCase()}` : "Visita de campo sin ejecución" }); } catch { /* Store exposes actionable status. */ } finally { setSubmitting(false); }
  }
  return (
    <form className="action-form" onSubmit={submit}>
      <div className="form-heading"><div><span className="eyebrow">{actionLabel(kind)}</span><h3>Confirmar datos</h3></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Cerrar formulario">×</button></div>
      <p className="form-hint">Orden {order.orderId}. La evidencia queda guardada localmente; esta simulación no afirma envío remoto.</p>
      <label className="file-field"><span>Archivo de evidencia</span><input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0])} /><small>{file ? file.name : "JPEG o PNG preparado"}</small></label>
      <label className="checkbox-field"><input type="checkbox" checked={useException} onChange={(event) => setUseException(event.target.checked)} /><span>No puedo adjuntar evidencia</span></label>
      {useException ? <label className="text-field"><span>Justificación obligatoria</span><textarea value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} rows={3} placeholder="Describa el motivo" /></label> : null}
      {formError ? <p className="form-error" role="alert">{formError}</p> : null}
      <div className="form-actions"><button type="button" className="secondary-action" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-action" disabled={busy || submitting}>{busy || submitting ? "Guardando…" : "Confirmar"}</button></div>
    </form>
  );
}

function QueuePanel({ state, store }: { state: AppState; store: AppStore }) {
  const items = [...state.syncItems].sort((left, right) => Number(right.status !== "synced") - Number(left.status !== "synced"));
  return (
    <section className="queue-panel panel" aria-label="Cola de sincronización">
      <div className="panel-heading"><div><div className="eyebrow">TRAZABILIDAD LOCAL</div><h2>Cola de trabajo</h2></div><button className="sync-button" disabled={!isUsable(state.mode) || state.busyAction === "SYNC"} onClick={() => void store.sync()}>{state.busyAction === "SYNC" ? "Sincronizando…" : "Sincronizar"}</button></div>
      <p className="queue-intro">Los registros permanecen en este dispositivo hasta recibir confirmación válida.</p>
      {items.length ? <div className="queue-list">{items.map((item) => <QueueItem key={item.operationId} item={item} />)}</div> : <div className="empty-state"><strong>Cola despejada</strong><span>No hay operaciones locales para mostrar.</span></div>}
    </section>
  );
}

function QueueItem({ item }: { item: import("../ports").SyncItem }) {
  const manualReview = item.manualReview || item.uncertain;
  return <article className="queue-item"><div className="queue-item__header"><strong>{item.operationId}</strong><span className={`queue-status queue-status--${item.status}`}>{syncStatusLabel(item.status)}</span></div><div className="queue-item__meta"><span>{actionLabel(item.action)}</span><span>Orden {item.orderId ?? "—"}</span><span>{item.attempts} intento(s)</span></div>{item.errorCode ? <p className="queue-error">{manualReview ? "Requiere revisión humana. " : "Último aviso: "}{item.errorCode}</p> : null}{manualReview ? <p className="queue-review">Resultado incierto: no reenviar automáticamente.</p> : null}</article>;
}

function EmptyDetail() { return <section className="detail-panel panel detail-empty"><span className="empty-rail" aria-hidden="true" /><h2>Elija una orden</h2><p>Seleccione una orden para consultar estado físico y registrar trabajo.</p></section>; }
function EmptyOrders() { return <div className="empty-state"><strong>No encontramos órdenes</strong><span>Pruebe cambiar búsqueda o filtro.</span></div>; }
function LoadingState() { return <main className="state-card"><div className="loading-mark" /><h2>Cargando paquete local</h2><p>Recuperando órdenes asignadas y cola persistida.</p></main>; }
function ErrorState({ text, onRetry }: { text: string; onRetry: () => Promise<void> }) { return <main className="state-card state-card--error"><h2>No pudimos abrir jornada</h2><p>{text}</p><button className="primary-action" onClick={() => void onRetry()}>Reintentar</button></main>; }

function actionLabel(action: ActionKind): string { return action === "VISIT" ? "Visita" : action === "CUT" ? "Corte" : "Reconexión"; }
function activityLabel(kind: import("../ports").StoredRecord["kind"]): string { return kind === "VISIT" ? "Visita sin ejecución" : kind === "CUT" ? "Corte" : "Reconexión"; }
function activityDetail(record: import("../ports").StoredRecord): string { return "reason" in record ? record.reason : record.status === "CONFIRMED" ? "Resultado confirmado localmente" : record.status === "PHYSICAL_UNKNOWN" ? "Resultado incierto" : "Intento registrado"; }
function activityException(record: import("../ports").StoredRecord): string | undefined { return record.exceptionReason; }
function shortHash(hash?: string): string { return hash ? `${hash.slice(0, 10)}…` : "disponible"; }
function orderStatusLabel(status: WorkOrder["status"]): string { return status === "GENERADO" ? "Por ejecutar" : status === "EJECUTADO" ? "Corte ejecutado" : status === "RECONEXIÓN" ? "Reconectada" : "Anulada"; }
function physicalStatusLabel(status: WorkOrder["physicalStatus"]): string { return status === "NONE" ? "Sin ejecución" : status === "CLAIMED" ? "Reclamado" : status === "CONFIRMED" ? "Confirmado" : "Resultado incierto"; }
function orderStatusTone(order: WorkOrder): string { return order.physicalStatus === "PHYSICAL_UNKNOWN" ? "review" : order.status === "RECONEXIÓN" ? "done" : order.status === "EJECUTADO" ? "active" : order.status === "ANULADO" ? "muted" : "ready"; }
function syncStatusLabel(status: import("../domain").SyncStatus): string { return status === "pending" ? "Pendiente" : status === "syncing" ? "Sincronizando" : status === "synced" ? "Sincronizado" : "Falló"; }
function pendingCount(items: import("../ports").SyncItem[]): number { return items.filter((item) => item.status !== "synced").length; }
function isUsable(mode: ConnectivityMode): boolean { return mode !== "offline"; }
function formatDate(value?: string): string { if (!value) return "Sin datos"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Sin datos" : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(date); }
