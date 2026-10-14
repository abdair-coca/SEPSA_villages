import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { DebtorRecord, ReconciliationItem, Session, TechnicianRecord } from "../domain/types";
import type { OperationsAuthorityPort } from "../ports/authority";
import { OperationsApp } from "./OperationsApp";
import { DebtorSearchPanel } from "../components/DebtorSearchPanel";
import { AdminReconciliation } from "../components/AdminReconciliation";
import { createDemoPackage } from "../bootstrap/simulated-runtime";

// Minimal hook scheduler: callbacks run from the actual component, effects retain
// dependencies/cleanup, and renders explicitly flush state. No browser dependency.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, pending: [] as (() => void)[], writes: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.slots[index], (value: unknown) => {
      hooks.writes++;
      hooks.slots[index] = typeof value === "function" ? value(hooks.slots[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    return hooks.slots[index] ??= { current: initial };
  },
  useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index] as { dependencies?: unknown[]; cleanup?: () => void } | undefined;
    if (!old || !dependencies || dependencies.some((value, i) => !Object.is(value, old.dependencies?.[i]))) {
      hooks.pending.push(() => { old?.cleanup?.(); hooks.slots[index] = { dependencies, cleanup: effect() }; });
    }
  },
}));

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  // El panel de búsqueda antes era JSX en línea de la pantalla: se expande para seguir viendo su formulario y sus controles.
  if (element.type === DebtorSearchPanel) return [element, ...elements(DebtorSearchPanel(element.props as unknown as Parameters<typeof DebtorSearchPanel>[0]))];
  return [element, ...elements(element.props.children)];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
const session: Session = { sessionId: "admin-session", userId: "admin", username: "admin", role: "ADMIN", permissions: [], authenticity: "SIMULATED", issuedAt: "2026-09-29", expiresAt: "2026-10-06" };
const technician: TechnicianRecord = { userId: "tech-1", username: "tech.one", displayName: "Tech One", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" };
const debtor: DebtorRecord = { debtorId: "supply-1", accountId: "account-1", supplyId: "meter-1", customerName: "Current result", address: "Address", references: "", meterId: "meter-1", area: "A", locality: "Town", route: "1", debtCents: 100, monthsPending: 2, updatedAt: "2026-09-29", source: "SIMULATED", kardex: [] };

function setup() {
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  const a = deferred<DebtorRecord[]>(), b = deferred<DebtorRecord[]>();
  const requests = [a, b];
  // `findDebtors` es la lista completa que simula la autoridad; `findDebtorPage` la corta por página como el servidor.
  const findDebtors = vi.fn((query) => "minMonthsPending" in query ? requests.shift()!.promise : Promise.resolve([]));
  const findDebtorPage = vi.fn(async (query: { offset: number; limit: number }) => {
    const debtors = await findDebtors(query);
    return { debtors: debtors.slice(query.offset, query.offset + query.limit), total: debtors.length };
  });
  const authority = {
    findDebtors, findDebtorPage, listDebtorFilterRecords: vi.fn().mockResolvedValue([]),
    listOrders: vi.fn().mockResolvedValue([]), countAudit: vi.fn().mockResolvedValue(0), listTechnicians: vi.fn().mockResolvedValue([technician]),
    listReconciliation: vi.fn().mockResolvedValue([]),
  } as unknown as OperationsAuthorityPort;
  let activeSession = session;
  const render = () => {
    hooks.cursor = 0;
    const nodes = elements(OperationsApp({ authority, session: activeSession, onLogout() {} }));
    hooks.pending.splice(0).forEach((effect) => effect());
    return nodes;
  };
  const search = () => (render().find((node) => node.type === "form")!.props.onSubmit as Function)({ preventDefault() {} }) as Promise<void>;
  const unmount = () => {
    for (const slot of hooks.slots) (slot as { cleanup?: () => void } | undefined)?.cleanup?.();
  };
  render();
  return {
    a, b, render, search, unmount, findDebtors, findDebtorPage, authority,
    changeSession: () => { activeSession = { ...session, sessionId: "new-session" }; render(); },
    revalidateSession: () => { activeSession = { ...session }; render(); },
  };
}
const hasMessage = (nodes: ReturnType<typeof elements>, text: string) => nodes.some((node) => node.props.message === text || node.props.text === text || node.props.children === text);
const isSearching = (nodes: ReturnType<typeof elements>) => nodes.some((node) => Array.isArray(node.props.children) && node.props.children.includes("Consultando…"));
const makeOrder = (orderId: string, debtorId: string) => ({ ...createDemoPackage("2026-09-29").orders[0], orderId, debtorId, accountId: `account-${debtorId}`, version: 1 });
function openSingleCreation(render: () => ReactElement<Record<string, unknown>>[]) {
  (render().find((node) => node.props.debtor === debtor && "onSelect" in node.props)!.props.onSelect as Function)();
  (render().find((node) => "onCreateOrder" in node.props)!.props.onCreateOrder as Function)({ preventDefault() {} });
}
function confirmCreation(render: () => ReactElement<Record<string, unknown>>[]) {
  (render().find((node) => "onConfirm" in node.props)!.props.onConfirm as Function)();
}

afterEach(() => { hooks.slots = []; hooks.pending = []; hooks.writes = 0; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("administrative request ownership", () => {
  it("does not reload when the same session is revalidated as a new object", async () => {
    const { a, authority, findDebtors, revalidateSession } = setup();
    a.resolve([debtor]);
    await settle();
    revalidateSession();
    await settle();
    expect(findDebtors).toHaveBeenCalledTimes(1);
    expect(authority.listOrders).toHaveBeenCalledTimes(1);
    expect(authority.countAudit).toHaveBeenCalledTimes(1);
  });

  it("keeps an in-flight load when the same session is revalidated as a new object", async () => {
    const { a, render, revalidateSession } = setup();
    revalidateSession();
    a.resolve([debtor]);
    await settle();
    expect(render().some((node) => node.props.debtor === debtor)).toBe(true);
  });

  it("shows a current load failure and recovers through retry", async () => {
    const { a, b, render } = setup();
    a.reject(new Error("Current load failed"));
    await settle();
    const error = render().find((node) => node.props.message === "Current load failed")!;
    expect(error).toBeDefined();
    (error.props.onRetry as Function)();
    b.resolve([debtor]);
    await settle();
    expect(hasMessage(render(), "Current load failed")).toBe(false);
    expect(render().some((node) => node.props.debtor === debtor)).toBe(true);
  });

  it("shows a current search failure and releases searching state", async () => {
    const { a, b, render, search } = setup();
    a.resolve([debtor]);
    await settle();
    const pending = search();
    b.reject(new Error("Current search failed"));
    await pending;
    expect(hasMessage(render(), "Current search failed")).toBe(true);
    expect(isSearching(render())).toBe(false);
    expect(render().some((node) => node.props.debtor === debtor)).toBe(true);
  });

  it("clears filters immediately and cancels a queued live search", async () => {
    vi.useFakeTimers();
    const { a, b, render, findDebtors } = setup();
    a.resolve([debtor]);
    await settle();
    (render().find((node) => node.props.id === "admin-search")!.props.onChange as Function)("queued");
    render();
    await vi.advanceTimersByTimeAsync(100);
    const pending = (render().find((node) => node.props.className === "filter-reset")!.props.onClick as Function)();
    render();
    await vi.advanceTimersByTimeAsync(300);
    expect(findDebtors).toHaveBeenCalledTimes(2);
    expect(findDebtors.mock.calls[1][0]).toMatchObject({ query: "", minMonthsPending: 2, supplyStatus: "A" });
    b.resolve([debtor]);
    await pending;
    await settle();
    expect(render().find((node) => node.props.id === "admin-search")!.props.value).toBe("");
  });

  it("returns refreshed orders to duplicate-order recovery without creating again", async () => {
    const { a, authority, render, findDebtors } = setup();
    const existing = { ...createDemoPackage("2026-09-29").orders[0], debtorId: debtor.debtorId, accountId: debtor.accountId };
    authority.createOrder = vi.fn().mockRejectedValue({ code: "ACTIVE_ORDER_EXISTS" });
    a.resolve([debtor]);
    await settle();
    (render().find((node) => node.props.debtor === debtor && "onSelect" in node.props)!.props.onSelect as Function)();
    (render().find((node) => "onCreateOrder" in node.props)!.props.onCreateOrder as Function)({ preventDefault() {} });
    findDebtors.mockResolvedValue([debtor]);
    vi.mocked(authority.listOrders).mockResolvedValue([existing]);
    (render().find((node) => "onConfirm" in node.props)!.props.onConfirm as Function)();
    await settle();
    await settle();
    expect(authority.createOrder).toHaveBeenCalledOnce();
    expect(render().some((node) => node.props.order === existing)).toBe(true);
    expect(hasMessage(render(), "Este suministro ya tiene una orden activa. Revise su ficha para asignarla.")).toBe(true);
  });

  it("keeps seven supplies/four orders per page and selections across paging", async () => {
    const { a, b, authority, render, changeSession, findDebtors, findDebtorPage } = setup();
    const orders = Array.from({ length: 5 }, (_, index) => ({ ...createDemoPackage("2026-09-29").orders[0], orderId: `order-${index}` }));
    vi.mocked(authority.listOrders).mockResolvedValue(orders);
    a.resolve([]);
    await settle();
    // Entrar de nuevo carga órdenes, auditoría y la primera página; una búsqueda sola no recarga las órdenes.
    const supplies = Array.from({ length: 8 }, (_, index) => ({ ...debtor, debtorId: `supply-${index}` }));
    changeSession();
    b.resolve(supplies);
    await settle();
    const rows = render().filter((node) => "debtor" in node.props && "onToggle" in node.props);
    expect(rows).toHaveLength(7);
    (rows[0].props.onToggle as Function)();
    // Cada página se pide al servidor con su offset; la selección sobrevive al cambio de página.
    findDebtors.mockResolvedValue(supplies);
    (render().find((node) => node.props.label === "Paginación de suministros")!.props.onNext as Function)();
    await settle();
    expect(findDebtorPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 7, limit: 7 }));
    const secondPage = render().filter((node) => "debtor" in node.props && "onToggle" in node.props);
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].props.position).toBe(8);
    const summary = render().find((node) => "visibleSelectedCount" in node.props)!;
    expect(summary.props.selectedCount).toBe(1);
    expect(summary.props.visibleSelectedCount).toBe(0);
    (render().find((node) => node.props.label === "Paginación de suministros")!.props.onPrevious as Function)();
    await settle();
    expect(render().find((node) => node.props.debtor === supplies[0])!.props.checked).toBe(true);
    const recent = render().find((node) => "totalOrders" in node.props)!;
    expect(recent.props.orders).toEqual(orders.slice(0, 4));
    expect(recent.props.totalPages).toBe(2);
    (recent.props.onPageChange as Function)(2);
    expect(render().find((node) => "totalOrders" in node.props)!.props.orders).toEqual(orders.slice(4));
  });

  it("opens the reconciliation dialog from the account menu with the current cases", async () => {
    const { a, authority, render, changeSession } = setup();
    const item: ReconciliationItem = { kind: "CONSUMED_NOT_SYNCED", operationId: "cut-1", orderId: "order-1", action: "CUT", technicianId: "tech-1", since: "2026-10-12T10:00:00.000Z" };
    a.resolve([]);
    await settle();
    vi.mocked(authority.listReconciliation!).mockResolvedValue([item]);
    changeSession();
    await settle();

    const menuAction = render().find((node) => node.props.accountAction)!.props.accountAction as { detail: string; onSelect: () => void };
    expect(menuAction.detail).toBe("1 caso");
    expect(render().some((node) => node.type === AdminReconciliation)).toBe(false);
    menuAction.onSelect();
    const dialog = render().find((node) => node.type === AdminReconciliation)!;
    expect(dialog.props.items).toEqual([item]);
  });

  it("does not offer the reconciliation dialog when the backend has no reconciliation list", async () => {
    const { a, authority, render, changeSession } = setup();
    a.resolve([]);
    await settle();
    vi.mocked(authority.listReconciliation!).mockRejectedValue(new Error("Older backend"));
    changeSession();
    await settle();

    expect(render().some((node) => node.props.accountAction)).toBe(false);
  });

  it("a search loads only the supply page; orders, technicians and filter options are not reloaded", async () => {
    const { a, b, authority, search } = setup();
    a.resolve([debtor]);
    await settle();
    const pending = search();
    b.resolve([debtor]);
    await pending;
    expect(authority.findDebtorPage).toHaveBeenCalledTimes(2);
    expect(authority.listOrders).toHaveBeenCalledTimes(1);
    expect(authority.listTechnicians).toHaveBeenCalledTimes(1);
    expect(authority.listDebtorFilterRecords).toHaveBeenCalledTimes(1);
  });

  it("selects only the visible page with the select-all action", async () => {
    const { a, render } = setup();
    const supplies = Array.from({ length: 8 }, (_, index) => ({ ...debtor, debtorId: `supply-${index}` }));
    a.resolve(supplies);
    await settle();
    (render().find((node) => typeof node.props.className === "string" && node.props.className.includes("filter-select-all"))!.props.onClick as Function)();
    expect(render().find((node) => "visibleSelectedCount" in node.props)!.props.selectedCount).toBe(7);
  });

  it("ignores an older load rejection while search B is still pending", async () => {
    const { a, b, render, search } = setup();
    const pending = search();
    a.reject(new Error("Old load failed"));
    await settle();
    expect(hasMessage(render(), "Old load failed")).toBe(false);
    expect(isSearching(render())).toBe(true);
    b.resolve([debtor]);
    await pending;
    expect(render().some((node) => node.props.debtor === debtor)).toBe(true);
    expect(isSearching(render())).toBe(false);
  });

  it.each(["success", "failure"])("keeps B results after obsolete A %s", async (outcome) => {
    const { a, b, render, search } = setup();
    const pending = search();
    b.resolve([debtor]);
    await pending;
    if (outcome === "success") a.resolve([{ ...debtor, customerName: "Old result" }]);
    else a.reject(new Error("Old failure"));
    await settle();
    expect(render().some((node) => node.props.debtor === debtor)).toBe(true);
    expect(hasMessage(render(), "Old failure")).toBe(false);
  });

  it("guards catch/finally of live search A after manual search B begins", async () => {
    vi.useFakeTimers();
    const { a, b, render, search, findDebtors } = setup();
    a.resolve([debtor]);
    await settle();
    const live = deferred<DebtorRecord[]>();
    findDebtors.mockImplementationOnce(() => live.promise).mockImplementationOnce(() => b.promise);
    const field = render().find((node) => node.props.id === "admin-search")!;
    if (field.type === "input") (field.props.onChange as Function)({ target: { value: "current" } });
    else (field.props.onChange as Function)("current");
    render();
    await vi.advanceTimersByTimeAsync(280);
    const pending = search();
    live.reject(new Error("Old live failure"));
    await settle();
    expect(hasMessage(render(), "Old live failure")).toBe(false);
    expect(isSearching(render())).toBe(true);
    b.resolve([debtor]);
    await pending;
  });

  it("invalidates pending load when session changes", async () => {
    const { a, b, render, changeSession } = setup();
    changeSession();
    a.reject(new Error("Previous session failed"));
    await settle();
    expect(hasMessage(render(), "Previous session failed")).toBe(false);
    b.resolve([debtor]);
    await settle();
    expect(render().some((node) => node.props.debtor === debtor)).toBe(true);
  });

  it.each(["success", "failure"])("does not write state after unmount and late %s", async (outcome) => {
    const { a, unmount } = setup();
    unmount();
    const writes = hooks.writes;
    if (outcome === "success") a.resolve([debtor]);
    else a.reject(new Error("Unmounted failure"));
    await settle();
    expect(hooks.writes).toBe(writes);
  });

  it("creates one order, assigns it, refreshes in order, and presents success", async () => {
    const { a, authority, render } = setup();
    const order = makeOrder("order-created", debtor.debtorId);
    a.resolve([debtor]);
    await settle();

    const events: string[] = [];
    vi.clearAllMocks();
    vi.mocked(authority.findDebtors).mockImplementation(async () => { events.push("findDebtors"); return [debtor]; });
    vi.mocked(authority.listOrders).mockImplementation(async () => { events.push("listOrders"); return [order]; });
    authority.createOrder = vi.fn().mockImplementation(async () => { events.push("createOrder"); return order; });
    authority.assignOrder = vi.fn().mockImplementation(async () => { events.push("assignOrder"); return order; });

    openSingleCreation(render);
    confirmCreation(render);
    await settle();

    expect(authority.createOrder).toHaveBeenCalledWith({ operationId: expect.stringMatching(/^create-order-/), debtorId: debtor.debtorId, purpose: "CUT", session });
    expect(authority.assignOrder).toHaveBeenCalledWith({ operationId: expect.stringMatching(/^assign-order-/), orderId: order.orderId, technicianId: "tech-1", expectedOrderVersion: 1, session });
    expect(events.slice(0, 2)).toEqual(["createOrder", "assignOrder"]);
    expect(events.indexOf("assignOrder")).toBeLessThan(events.indexOf("findDebtors"));
    expect(hasMessage(render(), "Orden creada y asignada al técnico seleccionado.")).toBe(true);
    expect(render().some((node) => node.props.order === order)).toBe(true);
  });

  it("creates and assigns the batch result while reporting skipped supplies", async () => {
    const secondDebtor = { ...debtor, debtorId: "supply-2", accountId: "account-2" };
    const skippedDebtor = { ...debtor, debtorId: "supply-3", accountId: "account-3" };
    const { a, b, authority, render } = setup();
    a.resolve([debtor, secondDebtor, skippedDebtor]);
    b.resolve([debtor, secondDebtor, skippedDebtor]);
    await settle();
    const firstOrder = makeOrder("batch-order-1", debtor.debtorId);
    const secondOrder = makeOrder("batch-order-2", secondDebtor.debtorId);
    vi.clearAllMocks();
    vi.mocked(authority.findDebtors).mockResolvedValue([debtor, secondDebtor, skippedDebtor]);
    vi.mocked(authority.listOrders).mockResolvedValue([firstOrder, secondOrder]);
    authority.createOrdersBatch = vi.fn().mockResolvedValue({ batchId: "batch-1", requestedDebtorIds: [debtor.debtorId, secondDebtor.debtorId, skippedDebtor.debtorId], created: [firstOrder, secondOrder], skipped: [{ debtorId: skippedDebtor.debtorId, reason: "ACTIVE_ORDER_EXISTS", message: "Already active" }] });
    authority.assignOrder = vi.fn().mockResolvedValue(firstOrder);

    for (const row of render().filter((node) => "debtor" in node.props && "onToggle" in node.props)) (row.props.onToggle as Function)();
    (render().find((node) => typeof node.props.className === "string" && node.props.className.includes("filter-batch-action"))!.props.onClick as Function)();
    confirmCreation(render);
    await settle();

    expect(authority.createOrdersBatch).toHaveBeenCalledWith({ batchId: expect.stringMatching(/^create-order-batch-/), debtorIds: [debtor.debtorId, secondDebtor.debtorId, skippedDebtor.debtorId], purpose: "CUT", session });
    expect(authority.assignOrder).toHaveBeenCalledTimes(2);
    expect(hasMessage(render(), "Lote creado y asignado: 2 órdenes, 1 omitidas por validación o duplicado.")).toBe(true);
  });

  it.each([0, 1])("presents an empty batch result with %i skipped supplies and clears selection", async (skippedCount) => {
    const secondDebtor = { ...debtor, debtorId: "supply-2", accountId: "account-2" };
    const { a, b, authority, render } = setup();
    a.resolve([debtor, secondDebtor]);
    b.resolve([debtor, secondDebtor]);
    await settle();
    vi.clearAllMocks();
    vi.mocked(authority.findDebtors).mockResolvedValue([debtor, secondDebtor]);
    authority.createOrdersBatch = vi.fn().mockResolvedValue({
      batchId: "empty-batch",
      requestedDebtorIds: [debtor.debtorId, secondDebtor.debtorId],
      created: [],
      skipped: skippedCount ? [{ debtorId: secondDebtor.debtorId, reason: "ACTIVE_ORDER_EXISTS", message: "Already active" }] : [],
    });
    authority.assignOrder = vi.fn();

    for (const row of render().filter((node) => "debtor" in node.props && "onToggle" in node.props)) (row.props.onToggle as Function)();
    (render().find((node) => typeof node.props.className === "string" && node.props.className.includes("filter-batch-action"))!.props.onClick as Function)();
    confirmCreation(render);
    await settle();

    expect(authority.createOrdersBatch).toHaveBeenCalledOnce();
    expect(authority.assignOrder).not.toHaveBeenCalled();
    expect(render().find((node) => "visibleSelectedCount" in node.props)!.props.selectedCount).toBe(0);
    expect(hasMessage(render(), `Lote creado y asignado: 0 órdenes${skippedCount ? ", 1 omitidas por validación o duplicado" : ""}.`)).toBe(true);
  });

  it("assigns batch orders sequentially and stops after the first assignment failure", async () => {
    const secondDebtor = { ...debtor, debtorId: "supply-2", accountId: "account-2" };
    const thirdDebtor = { ...debtor, debtorId: "supply-3", accountId: "account-3" };
    const { a, b, authority, render } = setup();
    a.resolve([debtor, secondDebtor, thirdDebtor]);
    b.resolve([debtor, secondDebtor, thirdDebtor]);
    await settle();
    const orders = [makeOrder("batch-order-1", debtor.debtorId), makeOrder("batch-order-2", secondDebtor.debtorId), makeOrder("batch-order-3", thirdDebtor.debtorId)];
    vi.clearAllMocks();
    vi.mocked(authority.findDebtors).mockResolvedValue([debtor, secondDebtor, thirdDebtor]);
    vi.mocked(authority.listOrders).mockResolvedValue(orders);
    authority.createOrdersBatch = vi.fn().mockResolvedValue({ batchId: "batch-2", requestedDebtorIds: [debtor.debtorId, secondDebtor.debtorId, thirdDebtor.debtorId], created: orders, skipped: [] });
    const firstAssignment = deferred<ReturnType<typeof makeOrder>>();
    authority.assignOrder = vi.fn().mockReturnValueOnce(firstAssignment.promise).mockRejectedValueOnce(new Error("Assignment failed")).mockResolvedValue(orders[2]);

    for (const row of render().filter((node) => "debtor" in node.props && "onToggle" in node.props)) (row.props.onToggle as Function)();
    (render().find((node) => typeof node.props.className === "string" && node.props.className.includes("filter-batch-action"))!.props.onClick as Function)();
    confirmCreation(render);
    await settle();

    expect(authority.assignOrder).toHaveBeenCalledOnce();
    expect(authority.assignOrder).toHaveBeenNthCalledWith(1, expect.objectContaining({ orderId: orders[0].orderId, session }));
    firstAssignment.resolve(orders[0]);
    await settle();
    expect(authority.assignOrder).toHaveBeenCalledTimes(2);
    expect(authority.assignOrder).toHaveBeenNthCalledWith(2, expect.objectContaining({ orderId: orders[1].orderId, session }));
    expect(authority.assignOrder).not.toHaveBeenCalledWith(expect.objectContaining({ orderId: orders[2].orderId }));
    expect(hasMessage(render(), "Se crearon 3 órdenes, pero no pudimos completar todas las asignaciones. Revise el detalle y reintente.")).toBe(true);
  });

  it("presents an ordinary creation rejection without assigning or refreshing", async () => {
    const { a, authority, render } = setup();
    a.resolve([debtor]);
    await settle();
    vi.clearAllMocks();
    authority.createOrder = vi.fn().mockRejectedValue(new Error("Creation failed"));
    authority.assignOrder = vi.fn();

    openSingleCreation(render);
    confirmCreation(render);
    await settle();

    expect(authority.createOrder).toHaveBeenCalledOnce();
    expect(authority.assignOrder).not.toHaveBeenCalled();
    expect(authority.listOrders).not.toHaveBeenCalled();
    expect(hasMessage(render(), "Creation failed")).toBe(true);
  });

  it("keeps the partial-assignment message and retries refresh after a successful assignment refresh failure", async () => {
    const { a, authority, render } = setup();
    const order = makeOrder("order-refresh-failure", debtor.debtorId);
    a.resolve([debtor]);
    await settle();
    vi.clearAllMocks();
    vi.mocked(authority.findDebtors).mockResolvedValue([debtor]);
    vi.mocked(authority.listOrders).mockRejectedValueOnce(new Error("Refresh failed")).mockResolvedValue([order]);
    authority.createOrder = vi.fn().mockResolvedValue(order);
    authority.assignOrder = vi.fn().mockResolvedValue(order);

    openSingleCreation(render);
    confirmCreation(render);
    await settle();

    expect(authority.createOrder).toHaveBeenCalledOnce();
    expect(authority.assignOrder).toHaveBeenCalledOnce();
    expect(authority.listOrders).toHaveBeenCalledTimes(2);
    expect(authority.findDebtorPage).toHaveBeenCalledTimes(2);
    expect(authority.countAudit).toHaveBeenCalledTimes(2);
    // Tras una acción no se vuelven a pedir técnicos ni opciones de filtros.
    expect(authority.listTechnicians).not.toHaveBeenCalled();
    expect(hasMessage(render(), "Se crearon 1 órdenes, pero no pudimos completar todas las asignaciones. Revise el detalle y reintente.")).toBe(true);
  });

  it.each(["session-change", "unmount"])("continues pending writes but guards UI state after %s", async (ownershipChange) => {
    const { a, authority, render, changeSession, unmount } = setup();
    const order = makeOrder("order-pending", debtor.debtorId);
    const created = deferred<typeof order>();
    const assigned = deferred<typeof order>();
    a.resolve([debtor]);
    await settle();
    vi.clearAllMocks();
    vi.mocked(authority.findDebtors).mockResolvedValue([debtor]);
    vi.mocked(authority.listOrders).mockResolvedValue([order]);
    authority.createOrder = vi.fn().mockReturnValue(created.promise);
    authority.assignOrder = vi.fn().mockReturnValue(assigned.promise);

    openSingleCreation(render);
    confirmCreation(render);
    if (ownershipChange === "session-change") {
      changeSession();
      await settle();
    } else {
      unmount();
    }
    const writes = hooks.writes;

    created.resolve(order);
    await settle();
    expect(authority.assignOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.orderId, session }));
    assigned.resolve(order);
    await settle();

    expect(hooks.writes).toBe(writes);
    if (ownershipChange === "session-change") {
      expect(hasMessage(render(), "Orden creada y asignada al técnico seleccionado.")).toBe(false);
      expect(hasMessage(render(), "Se crearon 1 órdenes, pero no pudimos completar todas las asignaciones. Revise el detalle y reintente.")).toBe(false);
    }
  });
});
