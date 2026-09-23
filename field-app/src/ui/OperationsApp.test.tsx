import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminOrderDetail, AdminSelectionSummary, ADMIN_SUPPLIES_PAGE_SIZE, filterOptions, findActiveOrderForSupply, formatAdminCoordinates, getAdminFilterOptions, getAdminOrderPage, getMissingOrderCreationDebtorIds, NO_DATA_FILTER_VALUE, OrderCreationModal } from "./OperationsApp";
import { createDemoPackage } from "../app/index";
import type { DebtorRecord } from "../domain";

describe("admin order pagination", () => {
  it("returns four recent orders per page and clamps requested page", () => {
    const orders = Array.from({ length: 9 }, (_, index) => `order-${index + 1}`);

    expect(getAdminOrderPage(orders, 1)).toEqual({ items: ["order-1", "order-2", "order-3", "order-4"], page: 1, totalPages: 3 });
    expect(getAdminOrderPage(orders, 3)).toEqual({ items: ["order-9"], page: 3, totalPages: 3 });
    expect(getAdminOrderPage(orders, 99)).toEqual({ items: ["order-9"], page: 3, totalPages: 3 });
  });

  it("keeps empty results on one stable page", () => {
    expect(getAdminOrderPage([], 4)).toEqual({ items: [], page: 1, totalPages: 1 });
  });
});

describe("admin active order lookup", () => {
  it("finds active order by debtor or account and ignores cancelled orders", () => {
    const baseOrder = createDemoPackage("2026-09-12T10:00:00.000Z").orders[0];
    const activeOrder = { ...baseOrder, debtorId: "debtor-1", accountId: "account-1" };
    const cancelledOrder = { ...activeOrder, status: "ANULADO" as const };

    expect(findActiveOrderForSupply([activeOrder], "debtor-1")).toBe(activeOrder);
    expect(findActiveOrderForSupply([activeOrder], "other-debtor", "account-1")).toBe(activeOrder);
    expect(findActiveOrderForSupply([cancelledOrder], "debtor-1", "account-1")).toBeUndefined();
  });
});

describe("admin order detail statuses", () => {
  it("shows order state once and preserves uncertain physical state", () => {
    const order = { ...createDemoPackage("2026-09-12T10:00:00.000Z").orders[0], physicalStatus: "PHYSICAL_UNKNOWN" as const };
    const markup = renderToStaticMarkup(<AdminOrderDetail order={order} />).toLocaleLowerCase();

    expect(markup.match(/>generada<\/span>/g)).toHaveLength(1);
    expect(markup).toContain("estado físico");
    expect(markup).toContain("físico incierto");
  });
});

describe("admin missing-data presentation", () => {
  it("formats complete cadastral coordinates with stable precision", () => {
    expect(formatAdminCoordinates(-17.7833214, -63.1821098)).toBe("-17.783321, -63.182110");
  });

  it("does not invent coordinates when one value is missing", () => {
    expect(formatAdminCoordinates(-17.7833214)).toBeUndefined();
    expect(formatAdminCoordinates(undefined, -63.1821098)).toBeUndefined();
  });
});

describe("admin supply pagination", () => {
  it("shows seven supplies per page and keeps global position", () => {
    const supplies = Array.from({ length: 15 }, (_, index) => `supply-${index + 1}`);

    expect(getAdminOrderPage(supplies, 1, ADMIN_SUPPLIES_PAGE_SIZE)).toEqual({ items: supplies.slice(0, 7), page: 1, totalPages: 3 });
    expect(getAdminOrderPage(supplies, 2, ADMIN_SUPPLIES_PAGE_SIZE)).toEqual({ items: supplies.slice(7, 14), page: 2, totalPages: 3 });
  });
});

describe("admin bulk selection summary", () => {
  it("shows the total selection and the count on the current page", () => {
    const markup = renderToStaticMarkup(<AdminSelectionSummary selectedCount={9} visibleSelectedCount={2} />);

    expect(markup).toContain("9 suministros seleccionados");
    expect(markup).toContain("2 en esta página");
    expect(markup).toContain("La selección se conserva al cambiar de página.");
  });

  it("stays out of the way when no supplies are selected", () => {
    expect(renderToStaticMarkup(<AdminSelectionSummary selectedCount={0} visibleSelectedCount={0} />)).toBe("");
  });
});

describe("admin order creation confirmation", () => {
  it("keeps every selected supply, technician choice, and both confirmation actions in the dialog", () => {
    const debtors: DebtorRecord[] = [
      { debtorId: "supply-1", accountId: "account-1", supplyId: "meter-1", customerName: "Client One", address: "Address One", references: "", meterId: "meter-1", area: "A", locality: "Town", route: "1", debtCents: 100, monthsPending: 2, updatedAt: "2026-09-01", source: "SIMULATED", kardex: [] },
      { debtorId: "supply-2", accountId: "account-2", supplyId: "meter-2", customerName: "Client Two", address: "Address Two", references: "", meterId: "meter-2", area: "A", locality: "Town", route: "1", debtCents: 200, monthsPending: 3, updatedAt: "2026-09-01", source: "SIMULATED", kardex: [] },
    ];
    const markup = renderToStaticMarkup(<OrderCreationModal dialog={{ mode: "batch", debtorIds: ["supply-1", "supply-2"] }} debtors={debtors} technicians={[{ userId: "tech-1", username: "tech.one", displayName: "Técnico Uno", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" }]} selectedTechnician="tech-1" busy={false} onTechnicianChange={() => undefined} onCancel={() => undefined} onConfirm={() => undefined} />);

    expect(markup).toContain("Client One");
    expect(markup).toContain("Client Two");
    expect(markup).toContain("Asignar a técnico");
    expect(markup).toContain("Cancelar");
    expect(markup).toContain("Aceptar y crear órdenes");
  });

  it("blocks creation when refreshed results no longer contain every selected supply", () => {
    const dialog = { mode: "batch" as const, debtorIds: ["supply-1", "supply-2"] };
    const refreshedDebtors: DebtorRecord[] = [
      { debtorId: "supply-1", accountId: "account-1", supplyId: "meter-1", customerName: "Client One", address: "Address One", references: "", meterId: "meter-1", area: "A", locality: "Town", route: "1", debtCents: 100, monthsPending: 2, updatedAt: "2026-09-01", source: "SIMULATED", kardex: [] },
    ];
    const markup = renderToStaticMarkup(<OrderCreationModal dialog={dialog} debtors={refreshedDebtors} technicians={[{ userId: "tech-1", username: "tech.one", displayName: "Técnico Uno", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" }]} selectedTechnician="tech-1" busy={false} onTechnicianChange={() => undefined} onCancel={() => undefined} onConfirm={() => undefined} />);

    expect(getMissingOrderCreationDebtorIds(dialog.debtorIds, refreshedDebtors)).toEqual(["supply-2"]);
    expect(markup).toContain("ID supply-2");
    expect(markup).toContain("No se puede confirmar");
    expect(markup).toMatch(/<button[^>]*disabled="">Aceptar y crear órdenes/);
  });
});

describe("admin filter options", () => {
  const records = [
    { area: "B", areaName: "BETANZOS", locality: "078 - COA COA", route: "078", routeName: "COA COA", supplyStatus: "A" },
    { area: "B", locality: "079 - MAYU TAMBO", route: "079", supplyStatus: "A" },
    { area: " A ", locality: "001 - VILLA ESPERANZA", route: "001", supplyStatus: "I" },
    { area: "", locality: "", route: "", supplyStatus: undefined },
  ] as DebtorRecord[];

  it("builds options from all records, normalizes duplicates, and exposes missing data", () => {
    expect(getAdminFilterOptions(records, "")).toEqual({
      areas: [{ value: "A", label: "A" }, { value: "B", label: "BETANZOS" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
      localities: [{ value: "001 - VILLA ESPERANZA", label: "001 - VILLA ESPERANZA" }, { value: "078 - COA COA", label: "078 - COA COA" }, { value: "079 - MAYU TAMBO", label: "079 - MAYU TAMBO" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
      routes: [{ value: "001", label: "001" }, { value: "079", label: "079" }, { value: "078", label: "COA COA" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
      statuses: [{ value: "A", label: "A" }, { value: "I", label: "I" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
    });
  });

  it("limits localities by selected area while keeping routes global", () => {
    const options = getAdminFilterOptions(records, "B");

    expect(options.localities).toEqual([{ value: "078 - COA COA", label: "078 - COA COA" }, { value: "079 - MAYU TAMBO", label: "079 - MAYU TAMBO" }]);
    expect(options.routes).toEqual([{ value: "001", label: "001" }, { value: "079", label: "079" }, { value: "078", label: "COA COA" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }]);
  });

  it("groups case and whitespace variants without changing first display value", () => {
    expect(filterOptions(["Betanzos", " BETANZOS ", "Betanzos"], "")).toEqual(["Betanzos"]);
  });
});
