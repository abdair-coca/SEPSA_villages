import { describe, expect, it } from "vitest";
import { formatAdminCoordinates, getAdminOrderPage } from "./OperationsApp";

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

describe("admin missing-data presentation", () => {
  it("formats complete cadastral coordinates with stable precision", () => {
    expect(formatAdminCoordinates(-17.7833214, -63.1821098)).toBe("-17.783321, -63.182110");
  });

  it("does not invent coordinates when one value is missing", () => {
    expect(formatAdminCoordinates(-17.7833214)).toBeUndefined();
    expect(formatAdminCoordinates(undefined, -63.1821098)).toBeUndefined();
  });
});
