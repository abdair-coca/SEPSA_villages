/**
 * Pantalla del técnico (jornada de campo). Lee el estado del store (`state/store.ts`) y tiene cuatro
 * pestañas: inicio (resumen y próxima orden), órdenes (búsqueda y filtros), mapa y cola de sincronización.
 * Al abrir una orden muestra `OrderDetail`, desde donde se registran visita, corte o reconexión.
 * No contiene reglas de negocio: elegibilidad y autorización viven en `domain/` y `use-cases/`.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AppMessage, AppStore, AppState } from "../state/store";
import { selectVisibleOrders } from "../state/store";
import { BrowserConnectivity } from "../adapters/browser/connectivity";
import type { ConnectivityMode, ActionKind } from "../domain/types";
import type { ServerRecordSource } from "../ports/technician-record";
import { AppHeader, type AppHeaderRoleSwitch } from "../components/AppHeader";
import { IconDevice, IconDownload, IconRefresh, IconUser } from "../components/common/Icons";
import { NOTIFICATION_AUTO_DISMISS_MS, Notification, shouldAutoDismissNotification } from "../components/common/Notification";
import { AppStateCard } from "../components/common/UiState";
import { OrderDetail } from "../components/OrderDetail";
import { QueuePanel } from "../components/SyncQueue";
import { FieldHome } from "../components/FieldHome";
import { OrdersPanel } from "../components/OrderList";
import { DesktopNavigation, BottomNavigation, type NavigationTab } from "../components/FieldBottomNav";
import { FieldMapPanel } from "../components/FieldMapPanel";
import { LastUpdateDisplay } from "../components/LastUpdateDisplay";
import { isManualVisitAllowed } from "../domain/policies";
import { sortOrdersForNext, pendingCount } from "../utils/sorting";
import { shortTechnicalId } from "../utils/format";
import { syncThenRefreshAssigned } from "../state/field-commands";

export interface FieldAppProps {
  store: AppStore;
  technicianId: string;
  technicianName?: string;
  deviceId: string;
  enableReconnection?: boolean;
  onRefreshAssigned?: () => Promise<void>;
  onLogout?: () => void;
  roleSwitch?: AppHeaderRoleSwitch;
  /** Registro del servidor de una orden (solo lectura); sin él la ficha no ofrece la consulta. */
  serverRecord?: ServerRecordSource;
}

export function FieldApp({
  store,
  technicianId,
  technicianName,
  deviceId,
  enableReconnection = true,
  onRefreshAssigned,
  onLogout,
  roleSwitch,
  serverRecord,
}: FieldAppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const pending = pendingCount(state.syncItems);
  const [isProbingNetwork, setIsProbingNetwork] = useState(false);
  const [isRefreshingAssigned, setIsRefreshingAssigned] = useState(false);
  const [assignedRefreshError, setAssignedRefreshError] = useState<string>();
  const [dismissedMessage, setDismissedMessage] = useState<AppMessage>();
  const connectivityRef = useRef<BrowserConnectivity | null>(null);
  const prevModeRef = useRef<ConnectivityMode>(state.mode);

  useEffect(() => {
    setDismissedMessage(undefined);
  }, [state.message]);

  useEffect(() => {
    const message = state.message;
    if (!message) return;
    const isMobile = window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (!shouldAutoDismissNotification(message.tone, { isMobile, hasAction: pending > 0, transient: message.transient })) return;
    const timeout = window.setTimeout(() => setDismissedMessage(message), NOTIFICATION_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [state.message, pending]);

  useEffect(() => {
    void store.init();
  }, [store]);

  // Adaptador de conectividad real para el navegador
  useEffect(() => {
    if (typeof window === "undefined") return;
    const connectivity = new BrowserConnectivity();
    connectivityRef.current = connectivity;

    const unsubscribe = connectivity.subscribe((nextMode) => {
      store.setMode(nextMode);
    });

    // Sondeo inicial
    void connectivity.probe();

    return () => {
      unsubscribe();
      connectivity.stop();
      connectivityRef.current = null;
    };
  }, [store]);

  // Auto-sincronización en segundo plano al recuperar señal
  useEffect(() => {
    const wasDisconnected = prevModeRef.current === "offline" || prevModeRef.current === "weak";
    const isNowOnline = state.mode === "online";
    if (wasDisconnected && isNowOnline) {
      const hasPendingSync = state.syncItems.some((item) => item.status !== "synced");
      if (hasPendingSync && state.busyAction !== "SYNC") {
        void store.sync();
      }
    }
    prevModeRef.current = state.mode;
  }, [state.mode, state.syncItems, state.busyAction, store]);

  const handleRefreshAssigned = async (): Promise<void> => {
    if (isRefreshingAssigned) return;
    setIsRefreshingAssigned(true);
    setAssignedRefreshError(undefined);
    try {
      await syncThenRefreshAssigned(store, onRefreshAssigned ?? (() => store.refresh()));
    } catch (error) {
      setAssignedRefreshError(error instanceof Error ? error.message : "No pudimos actualizar la bandeja.");
    } finally {
      setIsRefreshingAssigned(false);
    }
  };

  const handleRetryConnection = async () => {
    if (isProbingNetwork) return;
    setIsProbingNetwork(true);
    try {
      if (connectivityRef.current) {
        const nextMode = await connectivityRef.current.checkNow();
        store.setMode(nextMode);
      } else {
        const online = typeof navigator !== "undefined" ? navigator.onLine : true;
        store.setMode(online ? "online" : "offline");
      }
      if (store.getSnapshot().mode !== "offline") {
        await syncThenRefreshAssigned(store, onRefreshAssigned ?? (() => store.refresh()));
        setAssignedRefreshError(undefined);
      } else if (store.getSnapshot().syncItems.some((item) => item.status !== "synced")) {
        setAssignedRefreshError("Sin conexión. Las operaciones pendientes siguen guardadas en este dispositivo.");
      }
    } catch (error) {
      setAssignedRefreshError(error instanceof Error ? error.message : "No pudimos completar la sincronización.");
    } finally {
      setIsProbingNetwork(false);
    }
  };

  const modeLabel = state.mode === "online" ? "Red disponible" : state.mode === "weak" ? "Señal débil" : "Sin conexión";
  const openPendingQueue = () => {
    if (state.message) setDismissedMessage(state.message);
    store.selectOrder(null);
    store.setTab("queue");
  };

  return (
    <div className="field-app">
      <AppHeader
        role="field"
        title="Jornada de campo"
        description="Órdenes asignadas, ejecución de cortes y sincronización en terreno."
        user={{ displayName: technicianName ?? technicianId, roleLabel: "Técnico" }}
        variant={state.tab === "home" ? "standard" : "minimal"}
        viewKey={state.tab}
        onLogout={onLogout}
        roleSwitch={roleSwitch ? { ...roleSwitch, disabled: roleSwitch.disabled || Boolean(state.busyAction) || isRefreshingAssigned || isProbingNetwork } : undefined}
        context={state.tab === "home" ? (
          <div className="field-header-context-card">
            <div className="field-header-context__item">
              <span className="field-header-context__icon" aria-hidden="true"><IconDevice /></span>
              <span className="field-header-context__copy">
                <span className="field-header-context__label">Dispositivo</span>
                <strong>{shortTechnicalId(deviceId)}</strong>
              </span>
            </div>
            <span className="field-header-context__divider" aria-hidden="true" />
            <div className="field-header-context__item">
              <span className="field-header-context__icon" aria-hidden="true"><IconUser /></span>
              <span className="field-header-context__copy">
                <span className="field-header-context__label">Técnico</span>
                <strong>{technicianName ?? technicianId}</strong>
              </span>
            </div>
          </div>
        ) : undefined}
        status={{
          tone: state.mode === "online" ? "positive" : state.mode === "weak" ? "warning" : "negative",
          label: modeLabel,
        }}
        menuActions={state.tab !== "home" ? [
          {
            id: "sync-and-refresh",
            label: "Enviar pendientes y actualizar",
            busyLabel: "Enviando y actualizando…",
            icon: <IconDownload />,
            busy: isRefreshingAssigned,
            onSelect: () => void handleRefreshAssigned(),
          },
          {
            id: "retry",
            label: "Reintentar envío",
            busyLabel: "Probando…",
            icon: <IconRefresh />,
            busy: isProbingNetwork,
            onSelect: () => void handleRetryConnection(),
          },
        ] : undefined}
        actions={state.tab === "home" ? <div className="header-action-row">
          <button type="button" className="header-refresh-button" onClick={() => void handleRefreshAssigned()} disabled={isRefreshingAssigned}>
            <IconDownload />
            <span>{isRefreshingAssigned ? "Enviando y actualizando…" : "Enviar pendientes y actualizar"}</span>
          </button>
          <div className="header-action-row__secondary">
            <LastUpdateDisplay
              timestamp={state.lastRefreshAt ?? state.package?.downloadedAt}
              isRefreshing={isProbingNetwork || isRefreshingAssigned}
              onRefresh={() => void handleRefreshAssigned()}
            />
            <button
              type="button"
              className={`btn-network-retry ${isProbingNetwork ? "is-probing" : ""}`}
              onClick={handleRetryConnection}
              disabled={isProbingNetwork}
              title="Reintentar envío de operaciones pendientes"
              aria-label="Reintentar envío"
            >
              <span className="retry-icon" aria-hidden="true"><IconRefresh /></span>
              <span>{isProbingNetwork ? "Probando…" : "Reintentar envío"}</span>
            </button>
          </div>
        </div> : undefined}
      />
      {state.message && dismissedMessage !== state.message ? (
        <Notification
          tone={state.message.tone}
          text={state.message.text}
          action={pending ? { label: "Ver operaciones pendientes", onClick: openPendingQueue } : undefined}
          onDismiss={() => { if (state.message) setDismissedMessage(state.message); }}
        />
      ) : null}
      {assignedRefreshError ? <Notification tone="warning" text={assignedRefreshError} onDismiss={() => setAssignedRefreshError(undefined)} /> : null}
      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? (
        <ErrorState text={state.error ?? "No pudimos cargar el paquete local."} onRetry={store.init} />
      ) : null}
      {state.status === "ready" ? (
        <Workbench
          state={state}
          store={store}
          enableReconnection={enableReconnection}
          technicianName={technicianName}
          onRefreshAssigned={onRefreshAssigned ? () => void handleRefreshAssigned() : undefined}
          serverRecord={serverRecord}
        />
      ) : null}
    </div>
  );
}

function Workbench({
  state,
  store,
  enableReconnection,
  technicianName,
  onRefreshAssigned,
  serverRecord,
}: {
  state: AppState;
  store: AppStore;
  enableReconnection: boolean;
  technicianName?: string;
  onRefreshAssigned?: () => void;
  serverRecord?: ServerRecordSource;
}) {
  const visibleOrders = selectVisibleOrders(state);
  const selectedOrder = state.orders.find((order) => order.orderId === state.selectedOrderId);
  const [pendingAction, setPendingAction] = useState<{ orderId: string; kind: ActionKind } | null>(null);
  const [returnToJourney, setReturnToJourney] = useState(false);

  const openIncident = (orderId: string) => {
    const order = state.orders.find((candidate) => candidate.orderId === orderId);
    if (!order || !isManualVisitAllowed(order)) return;
    setPendingAction({ orderId, kind: "VISIT" });
    store.selectOrder(orderId);
  };

  const prioritizedOrders = sortOrdersForNext(state.orders);
  const navigate = (tab: NavigationTab) => {
    setPendingAction(null);
    setReturnToJourney(false);
    store.selectOrder(null);
    store.setTab(tab);
  };
  const content = state.tab === "orders"
    ? selectedOrder ? (
      <OrderDetail
        order={selectedOrder}
        state={state}
        store={store}
        enableReconnection={enableReconnection}
        technicianName={technicianName}
        initialAction={pendingAction?.orderId === selectedOrder.orderId ? pendingAction.kind : null}
        serverRecord={serverRecord}
        onBack={() => { setPendingAction(null); store.selectOrder(null); if (returnToJourney) store.setTab("home"); setReturnToJourney(false); }}
      />
    ) : (
      <OrdersPanel state={state} orders={visibleOrders} store={store} onRefreshAssigned={onRefreshAssigned} onOpenOrder={() => setReturnToJourney(false)} />
    )
    : state.tab === "map"
      ? <FieldMapPanel state={state} store={store} />
      : state.tab === "queue"
        ? <QueuePanel state={state} store={store} />
        : <FieldHome state={state} store={store} orders={prioritizedOrders} onOpenIncident={openIncident} onReviewOrder={() => setReturnToJourney(true)} />;

  return (
    <main className="workbench">
      <DesktopNavigation activeTab={state.tab} onNavigate={navigate} pending={pendingCount(state.syncItems)} />
      {content}
      <BottomNavigation activeTab={state.tab} onNavigate={navigate} pending={pendingCount(state.syncItems)} />
    </main>
  );
}

function LoadingState() {
  return <AppStateCard as="main" className="state-card" tone="loading" title="Cargando paquete local" description="Recuperando órdenes asignadas y cola persistida." />;
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => Promise<void> }) {
  return <AppStateCard as="main" className="state-card state-card--error" tone="error" title="No pudimos abrir jornada" description={text} action={{ label: "Reintentar", onClick: () => void onRetry() }} />;
}

