import { describe, expect, it } from "vitest";
import { ADMIN_SUPPLIES_PAGE_SIZE, filterOptions, findActiveOrderForSupply, formatAdminCoordinates, getAdminFilterOptions, getAdminOrderPage, NO_DATA_FILTER_VALUE } from "./OperationsApp";
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
