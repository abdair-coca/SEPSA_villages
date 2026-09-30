import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { DebtorRecord, Session } from "../domain";
import type { OperationsAuthorityPort } from "../ports";
import { OperationsApp } from "./OperationsApp";
import { createDemoPackage } from "../app/index";

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
const debtor: DebtorRecord = { debtorId: "supply-1", accountId: "account-1", supplyId: "meter-1", customerName: "Current result", address: "Address", references: "", meterId: "meter-1", area: "A", locality: "Town", route: "1", debtCents: 100, monthsPending: 2, updatedAt: "2026-09-29", source: "SIMULATED", kardex: [] };

function setup() {
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  const a = deferred<DebtorRecord[]>(), b = deferred<DebtorRecord[]>();
  const requests = [a, b];
  const findDebtors = vi.fn((query) => "minMonthsPending" in query ? requests.shift()!.promise : Promise.resolve([]));
  const authority = { findDebtors, listOrders: vi.fn().mockResolvedValue([]), listAudit: vi.fn().mockResolvedValue([]), listTechnicians: vi.fn().mockResolvedValue([{ userId: "tech-1", username: "tech.one", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" }]) } as unknown as OperationsAuthorityPort;
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
  return { a, b, render, search, unmount, findDebtors, authority, changeSession: () => { activeSession = { ...session, sessionId: "new-session" }; render(); } };
}
const hasMessage = (nodes: ReturnType<typeof elements>, text: string) => nodes.some((node) => node.props.message === text || node.props.text === text || node.props.children === text);
const isSearching = (nodes: ReturnType<typeof elements>) => nodes.some((node) => Array.isArray(node.props.children) && node.props.children.includes("Consultando…"));

afterEach(() => { hooks.slots = []; hooks.pending = []; hooks.writes = 0; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("administrative request ownership", () => {
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
    expect(findDebtors).toHaveBeenCalledTimes(4);
    expect(findDebtors.mock.calls[2][0]).toMatchObject({ query: "", minMonthsPending: 2, supplyStatus: "A" });
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
    const { a, b, authority, render, search } = setup();
    const orders = Array.from({ length: 5 }, (_, index) => ({ ...createDemoPackage("2026-09-29").orders[0], orderId: `order-${index}` }));
    vi.mocked(authority.listOrders).mockResolvedValue(orders);
    // Reload using the search callback so the changed order stub belongs to this request.
    a.resolve([]);
    await settle();
    const supplies = Array.from({ length: 8 }, (_, index) => ({ ...debtor, debtorId: `supply-${index}` }));
    const pending = search();
    b.resolve(supplies);
    await pending;
    const rows = render().filter((node) => "debtor" in node.props && "onToggle" in node.props);
    expect(rows).toHaveLength(7);
    (rows[0].props.onToggle as Function)();
    const pager = render().find((node) => node.props.label === "Paginación de suministros")!;
    (pager.props.onNext as Function)();
    const secondPage = render().filter((node) => "debtor" in node.props && "onToggle" in node.props);
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].props.position).toBe(8);
    const summary = render().find((node) => "visibleSelectedCount" in node.props)!;
    expect(summary.props.selectedCount).toBe(1);
    expect(summary.props.visibleSelectedCount).toBe(0);
    (pager.props.onPrevious as Function)();
    expect(render().find((node) => node.props.debtor === supplies[0])!.props.checked).toBe(true);
    const recent = render().find((node) => "totalOrders" in node.props)!;
    expect(recent.props.orders).toEqual(orders.slice(0, 4));
    expect(recent.props.totalPages).toBe(2);
    (recent.props.onPageChange as Function)(2);
    expect(render().find((node) => "totalOrders" in node.props)!.props.orders).toEqual(orders.slice(4));
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
    findDebtors.mockImplementationOnce(() => live.promise).mockImplementationOnce(() => Promise.resolve([]));
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
});
