/**
 * Pantalla del administrador: búsqueda de suministros morosos con filtros, selección (una o varias),
 * creación y asignación de órdenes a un técnico, ficha de la orden y conteo de trazas de auditoría.
 * Cada comando lleva un `operationId` único y la versión esperada de la orden; la autoridad
 * (`ports/authority.ts`) valida permisos y conflictos, y la pantalla solo muestra el resultado.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  generateOperationId,
  type DebtorRecord,
  type Session,
  type TechnicianRecord,
  type WorkOrder,
} from "../domain/types";
import type { DebtorFilterRecord, OperationsAuthorityPort } from "../ports/authority";
import { AppHeader, type AppHeaderRoleSwitch } from "../components/AppHeader";
import { NOTIFICATION_AUTO_DISMISS_MS, Notification, shouldAutoDismissNotification } from "../components/common/Notification";
import { AdminOverview } from "../components/AdminOverview";
import { AdminReconciliation } from "../components/AdminReconciliation";
import type { ReconciliationItem } from "../domain/types";
import { DebtorSearchPanel, type SearchFilters } from "../components/DebtorSearchPanel";
import { SelectedSupplyPanel, EmptySupplyPanel, RecentOrdersPreview } from "../components/AdminSupplyPanel";
import { AdminOrderDetail } from "../components/AdminOrderDetail";
import { OrderCreationModal, OrderAssignmentModal, type OrderCreationDialog } from "../components/AdminOrderModals";
import { findActiveOrderForSupply } from "../domain/policies";
import { ADMIN_SUPPLIES_PAGE_SIZE, getAdminOrderPage } from "../utils/pagination";
import { getAdminFilterOptions, matchesFilterValue, getMissingOrderCreationDebtorIds } from "../utils/filters";

interface OperationsAppProps {
  authority: OperationsAuthorityPort;
  session: Session;
  onLogout: () => void;
  roleSwitch?: AppHeaderRoleSwitch;
}

type MessageTone = "info" | "success" | "error";

/** `load`: primera carga; `search`: búsqueda o filtros; `page`: otra página; `refresh`: tras una acción. */
type SupplyLoadMode = "load" | "search" | "page" | "refresh";

const DEFAULT_SEARCH_FILTERS: SearchFilters = { query: "", area: "", locality: "", route: "", minMonthsPending: "2", supplyStatus: "A" };

export function OperationsApp({ authority, session, onLogout, roleSwitch }: OperationsAppProps) {
  const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
  const [debtorTotal, setDebtorTotal] = useState(0);
  // Suministros vistos en alguna página: la selección sigue disponible aunque cambie la página o la búsqueda.
  const [knownDebtors, setKnownDebtors] = useState<Record<string, DebtorRecord>>({});
  const [filterRecords, setFilterRecords] = useState<DebtorFilterRecord[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianRecord[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [reconciliation, setReconciliation] = useState<ReconciliationItem[]>();
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_SEARCH_FILTERS });
  const [selectedDebtor, setSelectedDebtor] = useState("");
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<string[]>([]);
  const [orderCreationDialog, setOrderCreationDialog] = useState<OrderCreationDialog>();
  const [orderAssignmentDialog, setOrderAssignmentDialog] = useState<WorkOrder>();
  const [selectedOrder, setSelectedOrder] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [suppliesPage, setSuppliesPage] = useState(1);
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const refreshSequence = useRef(0);
  const supplySequence = useRef(0);
  const mounted = useRef(false);
  const scopeRef = useRef({ authority, session });
  const filtersRef = useRef(filters);
  const liveSearchTimer = useRef<number | undefined>(undefined);
  const lastLiveQuery = useRef(filters.query);
  const skipNextLiveSearch = useRef(false);
  const orderDetailRef = useRef<HTMLDivElement>(null);
  filtersRef.current = filters;
  scopeRef.current = { authority, session };

  // Se compara el `sessionId`, no el objeto: revalidar la misma sesión produce un objeto nuevo y no debe descartar la carga en curso.
  function isActiveSession(): boolean {
    return mounted.current && scopeRef.current.authority === authority && scopeRef.current.session.sessionId === session.sessionId;
  }

  function isCurrentRequest(sequence: number): boolean {
    return isActiveSession() && sequence === refreshSequence.current;
  }

  function isCurrentSupplyRequest(sequence: number): boolean {
    return isActiveSession() && sequence === supplySequence.current;
  }

  /** Carga una sola página de suministros con su total. Una respuesta vieja nunca reemplaza a una más nueva. */
  async function loadSupplyPage(nextFilters: SearchFilters, page: number, mode: SupplyLoadMode): Promise<void> {
    const sequence = isActiveSession() ? ++supplySequence.current : -1;
    if (isCurrentSupplyRequest(sequence)) {
      setLoading(mode === "load");
      setSearching(mode === "search" || mode === "page");
      setLoadError("");
      if (mode === "search") setMessage("");
    }
    try {
      const requestedPage = Math.max(1, Math.trunc(page));
      const result = await authority.findDebtorPage({
        query: nextFilters.query, area: nextFilters.area, locality: nextFilters.locality, route: nextFilters.route,
        minMonthsPending: parseMinMonths(nextFilters.minMonthsPending), supplyStatus: nextFilters.supplyStatus,
        offset: (requestedPage - 1) * ADMIN_SUPPLIES_PAGE_SIZE, limit: ADMIN_SUPPLIES_PAGE_SIZE, session,
      });
      if (!isCurrentSupplyRequest(sequence)) return;
      // Si la página pedida ya no existe (por ejemplo, tras una acción), se muestra la última.
      const lastPage = Math.max(1, Math.ceil(result.total / ADMIN_SUPPLIES_PAGE_SIZE));
      if (requestedPage > lastPage) return await loadSupplyPage(nextFilters, lastPage, mode);
      setDebtors(result.debtors);
      setDebtorTotal(result.total);
      setKnownDebtors((current) => ({ ...current, ...Object.fromEntries(result.debtors.map((debtor) => [debtor.debtorId, debtor])) }));
      setSuppliesPage(requestedPage);
    } catch (error) {
      if (isCurrentSupplyRequest(sequence) && mode !== "refresh") {
        const text = readableError(error);
        setLoadError(text);
        if (mode === "search") notify(text, "error");
      }
      throw error;
    } finally {
      if (isCurrentSupplyRequest(sequence)) {
        setLoading(false);
        setSearching(false);
      }
    }
  }

  /** Órdenes, auditoría y operaciones por conciliar. Una respuesta vieja no reemplaza a una más nueva. */
  async function loadSummary(): Promise<WorkOrder[]> {
    const sequence = isActiveSession() ? ++refreshSequence.current : -1;
    const [nextOrders, nextAuditTotal] = await Promise.all([authority.listOrders(session), authority.countAudit(session)]);
    // Lista de solo lectura: si falla (por ejemplo, un backend anterior), no bloquea el resto de la vista.
    const nextReconciliation = authority.listReconciliation ? await authority.listReconciliation(session).catch(() => undefined) : undefined;
    if (!isCurrentRequest(sequence)) return nextOrders;
    setReconciliation(nextReconciliation);
    setOrders(nextOrders);
    setAuditTotal(nextAuditTotal);
    setOrdersPage(1);
    setSelectedOrder((current) => nextOrders.some((order) => order.orderId === current) ? current : "");
    return nextOrders;
  }

  /** Opciones de filtros y técnicos: se cargan una vez al entrar, no en cada búsqueda. */
  async function loadReferenceData(): Promise<void> {
    const [nextFilterRecords, nextTechnicians] = await Promise.all([authority.listDebtorFilterRecords(session), authority.listTechnicians(session)]);
    if (!isActiveSession()) return;
    setFilterRecords(nextFilterRecords);
    setTechnicians(nextTechnicians);
    setSelectedTechnician((current) => nextTechnicians.some((technician) => technician.userId === current) ? current : nextTechnicians[0]?.userId ?? "");
  }

  /** Tras una acción: vuelve a cargar órdenes, auditoría, conciliación y la página de suministros que se ve. */
  async function refresh(): Promise<WorkOrder[]> {
    const [nextOrders] = await Promise.all([loadSummary(), loadSupplyPage(filters, suppliesPage, "refresh")]);
    return nextOrders;
  }

  function notify(text: string, tone: MessageTone = "info"): void {
    if (!isActiveSession()) return;
    setMessage(text);
    setMessageTone(tone);
  }

  useEffect(() => {
    if (!message) return;
    const isMobile = window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (!shouldAutoDismissNotification(messageTone, { isMobile })) return;
    const timeout = window.setTimeout(() => setMessage((current) => current === message ? "" : current), NOTIFICATION_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [message, messageTone]);

  async function loadAdminData(): Promise<void> {
    // La página de suministros presenta sus propios errores (con control de versión); aquí solo se cargan las demás secciones.
    const supplies = loadSupplyPage(filtersRef.current, 1, "load").catch(() => undefined);
    try {
      await Promise.all([loadReferenceData(), loadSummary()]);
    } catch (error) {
      if (isActiveSession()) setLoadError(readableError(error));
    }
    await supplies;
  }

  useEffect(() => {
    mounted.current = true;
    setBusy(false);
    setOrderCreationDialog(undefined);
    setOrderAssignmentDialog(undefined);
    void loadAdminData();
    return () => {
      mounted.current = false;
      refreshSequence.current++;
      supplySequence.current++;
      cancelLiveSearch();
    };
  }, [authority, session.sessionId]);

  useEffect(() => {
    if (lastLiveQuery.current === filters.query) return;
    lastLiveQuery.current = filters.query;
    if (skipNextLiveSearch.current) {
      skipNextLiveSearch.current = false;
      return;
    }
    cancelLiveSearch();
    liveSearchTimer.current = window.setTimeout(() => {
      liveSearchTimer.current = undefined;
      void loadSupplyPage(filtersRef.current, 1, "search").catch(() => { /* Current request owns error presentation. */ });
    }, 280);
    return () => {
      cancelLiveSearch();
    };
  }, [filters.query, authority, session.sessionId]);

  useEffect(() => {
    if (!selectedOrder || !orderDetailRef.current) return;
    orderDetailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedOrder, orders.length]);

  async function search(event: FormEvent) {
    event.preventDefault();
    cancelLiveSearch();
    try { await loadSupplyPage(filters, 1, "search"); } catch { /* Current request owns error presentation. */ }
  }

  async function clearFilters(): Promise<void> {
    cancelLiveSearch();
    skipNextLiveSearch.current = filters.query !== "";
    setFilters({ ...DEFAULT_SEARCH_FILTERS });
    setSelectedDebtor("");
    setSelectedDebtorIds([]);
    try { await loadSupplyPage(DEFAULT_SEARCH_FILTERS, 1, "search"); } catch { /* Current request owns error presentation. */ }
  }

  function changeSuppliesPage(page: number): void {
    void loadSupplyPage(filtersRef.current, page, "page").catch(() => { /* Current request owns error presentation. */ });
  }

  function cancelLiveSearch(): void {
    if (liveSearchTimer.current === undefined) return;
    window.clearTimeout(liveSearchTimer.current);
    liveSearchTimer.current = undefined;
  }

  /** Registros de los suministros indicados, en el orden dado; los que aún no se conocen se omiten. */
  function debtorRecordsFor(debtorIds: readonly string[]): DebtorRecord[] {
    return debtorIds.flatMap((debtorId) => knownDebtors[debtorId] ? [knownDebtors[debtorId]] : []);
  }

  function openSingleOrderDialog(event: FormEvent): void {
    event.preventDefault();
    if (!selectedDebtor) return notify("Seleccione un suministro antes de crear la orden.", "error");
    setOrderCreationDialog({ mode: "single", debtorIds: [selectedDebtor] });
  }

  function openBatchOrderDialog(): void {
    if (!selectedDebtorIds.length) return notify("Seleccione al menos un suministro para preparar el lote.", "error");
    setOrderCreationDialog({ mode: "batch", debtorIds: [...selectedDebtorIds] });
  }

  async function assignCreatedOrders(createdOrders: WorkOrder[]): Promise<void> {
    for (const order of createdOrders) {
      await authority.assignOrder({
        operationId: generateOperationId("assign-order"),
        orderId: order.orderId,
        technicianId: selectedTechnician,
        expectedOrderVersion: order.version ?? 0,
        session,
      });
    }
  }

  async function confirmOrderCreation(): Promise<void> {
    if (!orderCreationDialog || busy || !isActiveSession()) return;
    const creationDialog = orderCreationDialog;
    const missingDebtorIds = getMissingOrderCreationDebtorIds(creationDialog.debtorIds, Object.values(knownDebtors));
    if (missingDebtorIds.length) {
      notify(`No se pueden crear órdenes: faltan datos de los suministros seleccionados (${missingDebtorIds.join(", ")}).`, "error");
      return;
    }
    if (!selectedTechnician) {
      notify("No hay técnicos habilitados para asignar esta orden.", "error");
      return;
    }
    let createdOrders: WorkOrder[] = [];
    let skippedCount = 0;
    setBusy(true);
    try {
      if (creationDialog.mode === "single") {
        const order = await authority.createOrder({
          operationId: generateOperationId("create-order"),
          debtorId: creationDialog.debtorIds[0],
          purpose: "CUT",
          session,
        });
        createdOrders = [order];
      } else {
        const result = await authority.createOrdersBatch({
          batchId: generateOperationId("create-order-batch"),
          debtorIds: creationDialog.debtorIds,
          purpose: "CUT",
          session,
        });
        createdOrders = result.created;
        skippedCount = result.skipped.length;
      }

      if (isActiveSession()) setOrderCreationDialog(undefined);
      await assignCreatedOrders(createdOrders);
      presentOrderCreationSuccess(creationDialog.mode, createdOrders, skippedCount);
      await refresh();
    } catch (error) {
      await handleOrderCreationFailure(error, creationDialog, createdOrders);
    } finally {
      if (isActiveSession()) setBusy(false);
    }
  }

  function presentOrderCreationSuccess(mode: OrderCreationDialog["mode"], createdOrders: WorkOrder[], skippedCount: number): void {
    if (!isActiveSession()) return;
    const firstOrder = createdOrders[0];
    if (mode === "single") {
      setSelectedOrder(firstOrder.orderId);
      notify("Orden creada y asignada al técnico seleccionado.", "success");
      return;
    }

    if (firstOrder) {
      setSelectedDebtor(firstOrder.debtorId ?? "");
      setSelectedOrder(firstOrder.orderId);
    }
    const skippedSummary = skippedCount ? `, ${skippedCount} omitidas por validación o duplicado` : "";
    notify(`Lote creado y asignado: ${createdOrders.length} órdenes${skippedSummary}.`, "success");
    setSelectedDebtorIds([]);
  }

  async function handleOrderCreationFailure(error: unknown, dialog: OrderCreationDialog, createdOrders: WorkOrder[]): Promise<void> {
    if (!isActiveSession()) return;
    setOrderCreationDialog(undefined);

    // Conservar las órdenes creadas aunque falle la asignación o el refresco final.
    if (createdOrders.length) {
      setSelectedOrder(createdOrders[0].orderId);
      notify(`Se crearon ${createdOrders.length} órdenes, pero no pudimos completar todas las asignaciones. Revise el detalle y reintente.`, "error");
      await refresh();
      return;
    }

    if (isActiveOrderConflict(error)) {
      try {
        const refreshedOrders = await refresh();
        if (!isActiveSession()) return;
        const firstDebtorId = dialog.debtorIds[0];
        const debtor = knownDebtors[firstDebtorId];
        const activeOrder = findActiveOrderForSupply(refreshedOrders, firstDebtorId, debtor?.accountId);
        if (activeOrder) {
          setSelectedOrder(activeOrder.orderId);
          notify("Este suministro ya tiene una orden activa. Revise su ficha para asignarla.", "info");
          return;
        }
      } catch {
        // Si el refresco no termina, se mantiene el mensaje de conflicto original.
      }
    }
    notify(readableError(error), "error");
  }

  async function confirmOrderAssignment(): Promise<void> {
    const order = orderAssignmentDialog;
    if (!order || busy || !isActiveSession()) return;
    setBusy(true);
    try {
      await authority.assignOrder({ operationId: generateOperationId("assign-order"), orderId: order.orderId, technicianId: selectedTechnician, expectedOrderVersion: order.version ?? 0, session });
      if (isActiveSession()) setOrderAssignmentDialog(undefined);
      notify("Técnico asignado.", "success");
      await refresh();
    } catch (error) {
      notify(readableError(error), "error");
    } finally { if (isActiveSession()) setBusy(false); }
  }

  function selectDebtor(debtorId: string): void {
    setSelectedDebtor(debtorId);
    setSelectedOrder("");
  }

  function changeArea(area: string): void {
    setFilters((current) => {
      const localities = getAdminFilterOptions(filterRecords, area).localities;
      return { ...current, area, locality: localities.some((value) => matchesFilterValue(value.value, current.locality)) ? current.locality : "" };
    });
  }

  function toggleDebtor(debtorId: string): void {
    setSelectedDebtorIds((current) => current.includes(debtorId) ? current.filter((id) => id !== debtorId) : [...current, debtorId]);
  }

  /** Selecciona o quita los suministros de la página visible; la selección de otras páginas se conserva. */
  function toggleAllDebtors(): void {
    const pageIds = debtors.map((debtor) => debtor.debtorId);
    const pageSelected = pageIds.length > 0 && pageIds.every((debtorId) => selectedDebtorIds.includes(debtorId));
    setSelectedDebtorIds((current) => pageSelected
      ? current.filter((debtorId) => !pageIds.includes(debtorId))
      : [...current, ...pageIds.filter((debtorId) => !current.includes(debtorId))]);
  }

  function prepareBatch(): void {
    openBatchOrderDialog();
  }

  const selectedDebtorRecord = selectedDebtor ? knownDebtors[selectedDebtor] : undefined;
  const selectedOrderRecord = orders.find((order) => order.orderId === selectedOrder);
  const activeOrderForSupply = selectedDebtorRecord ? findActiveOrderForSupply(orders, selectedDebtorRecord.debtorId, selectedDebtorRecord.accountId) : undefined;
  const availableFilterOptions = getAdminFilterOptions(filterRecords, filters.area, filters.locality, filters.route, filters.supplyStatus);
  const recentOrdersPage = getAdminOrderPage(orders, ordersPage);
  const suppliesPageData = { items: debtors, page: suppliesPage, totalPages: Math.max(1, Math.ceil(debtorTotal / ADMIN_SUPPLIES_PAGE_SIZE)) };

  return (
    <div className="operations-app">
      <AppHeader
        role="admin"
        title="Centro de control de órdenes de corte"
        description="Busca suministros con mora, genera órdenes y asigna técnicos."
        user={{ displayName: session.displayName ?? session.username, roleLabel: "Admin" }}
        onLogout={onLogout}
        roleSwitch={roleSwitch ? { ...roleSwitch, disabled: roleSwitch.disabled || busy } : undefined}
      />

      {message ? <Notification tone={messageTone} text={message} onDismiss={() => setMessage("")} /> : null}

      <main className="operations-main">
        <AdminOverview orders={orders} traceCount={auditTotal} />
        {reconciliation ? <AdminReconciliation items={reconciliation} /> : null}

        <div className="operations-grid admin-workspace">
          <DebtorSearchPanel
            filters={filters}
            availableFilterOptions={availableFilterOptions}
            debtors={debtors}
            totalDebtors={debtorTotal}
            suppliesPageData={suppliesPageData}
            selectedDebtor={selectedDebtor}
            selectedDebtorIds={selectedDebtorIds}
            loading={loading}
            loadError={loadError}
            searching={searching}
            busy={busy}
            onFiltersChange={setFilters}
            onAreaChange={changeArea}
            onSearch={search}
            onClear={clearFilters}
            onToggleAll={toggleAllDebtors}
            onPrepareBatch={prepareBatch}
            onSelectDebtor={selectDebtor}
            onToggleDebtor={toggleDebtor}
            onRetry={loadAdminData}
            onSuppliesPageChange={changeSuppliesPage}
          />

          <section className="panel operations-orders selected-supply-panel" aria-labelledby="selected-supply-title">
            {selectedDebtorRecord ? <SelectedSupplyPanel debtor={selectedDebtorRecord} activeOrder={activeOrderForSupply} busy={busy} onCreateOrder={openSingleOrderDialog} onViewOrder={(orderId) => setSelectedOrder(orderId)} /> : <EmptySupplyPanel />}
            <RecentOrdersPreview orders={recentOrdersPage.items} totalOrders={orders.length} selectedOrderId={selectedOrder} page={recentOrdersPage.page} totalPages={recentOrdersPage.totalPages} onSelect={(orderId) => setSelectedOrder(orderId)} onPageChange={setOrdersPage} />
          </section>
        </div>

         <div ref={orderDetailRef}><AdminOrderDetail order={selectedOrderRecord} onAssign={() => { if (selectedOrderRecord) setOrderAssignmentDialog(selectedOrderRecord); }} /></div>
       </main>
        {orderCreationDialog ? <OrderCreationModal dialog={orderCreationDialog} debtors={debtorRecordsFor(orderCreationDialog.debtorIds)} technicians={technicians} selectedTechnician={selectedTechnician} busy={busy} onTechnicianChange={setSelectedTechnician} onCancel={() => setOrderCreationDialog(undefined)} onConfirm={() => void confirmOrderCreation()} /> : null}
        {orderAssignmentDialog ? <OrderAssignmentModal order={orderAssignmentDialog} technicians={technicians} selectedTechnician={selectedTechnician} busy={busy} onTechnicianChange={setSelectedTechnician} onCancel={() => setOrderAssignmentDialog(undefined)} onConfirm={() => void confirmOrderAssignment()} /> : null}
      </div>
  );
}

function isActiveOrderConflict(error: unknown): boolean {
  return errorCode(error) === "DUPLICATE_ORDER" || errorCode(error) === "ACTIVE_ORDER_EXISTS";
}
function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
function readableError(error: unknown): string {
  if (isActiveOrderConflict(error)) return "Este suministro ya tiene una orden activa. Revise su ficha para asignarla.";
  return error instanceof Error ? error.message : "No pudimos completar la operación administrativa.";
}
function parseMinMonths(value: string): number | undefined { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined; }
