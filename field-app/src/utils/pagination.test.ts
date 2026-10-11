import { describe, expect, it } from "vitest";
import { ADMIN_SUPPLIES_PAGE_SIZE, getAdminOrderPage, paginateReviewFields } from "./pagination";

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

describe("admin supply pagination", () => {
  it("shows seven supplies per page and keeps global position", () => {
    const supplies = Array.from({ length: 15 }, (_, index) => `supply-${index + 1}`);

    expect(getAdminOrderPage(supplies, 1, ADMIN_SUPPLIES_PAGE_SIZE)).toEqual({ items: supplies.slice(0, 7), page: 1, totalPages: 3 });
    expect(getAdminOrderPage(supplies, 2, ADMIN_SUPPLIES_PAGE_SIZE)).toEqual({ items: supplies.slice(7, 14), page: 2, totalPages: 3 });
  });
});

describe("order review field pages", () => {
  it("paginates all eight secondary data fields four at a time, including long values", () => {
    const longValue = "Referencia de campo extensa ".repeat(12).trim();
    const fields = Array.from({ length: 8 }, (_, index) => ({ label: `Campo ${index + 1}`, value: index === 0 ? longValue : `Valor ${index + 1}` }));
    const pages = paginateReviewFields(fields);
    const longValueParts = pages.flat().filter((field) => field.label.startsWith("Campo 1 · parte"));

    expect(pages.map((page) => page.length)).toEqual([1, 1, 1, 4, 3]);
    expect(longValueParts.map((field) => field.value).join("")).toBe(longValue);
    expect(pages.flat().filter((field) => !field.label.startsWith("Campo 1 · parte"))).toEqual(fields.slice(1));
  });
});
