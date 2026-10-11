import { describe, expect, expectTypeOf, it } from "vitest";
import { formatAdminCoordinates, orderPopupHtml } from "./format";

describe("admin missing-data presentation", () => {
  it("formats complete cadastral coordinates with stable precision", () => {
    expect(formatAdminCoordinates(-17.7833214, -63.1821098)).toBe("-17.783321, -63.182110");
  });

  it("does not invent coordinates when one value is missing", () => {
    expect(formatAdminCoordinates(-17.7833214)).toBeUndefined();
    expect(formatAdminCoordinates(undefined, -63.1821098)).toBeUndefined();
  });
});

describe("order popup content", () => {
  it("keeps existing visible text and element structure", () => {
    expect(orderPopupHtml("A-1", "Ana Pérez", "M-2", "Bs 12.50", "GENERADO")).toBe(`
          <strong>Cuenta A-1</strong>
          <span>Ana Pérez</span>
          <span>Medidor M-2</span>
          <span>Deuda: Bs 12.50 · <strong>GENERADO</strong></span>
        `);
  });

  it("encodes every dynamic field as text", () => {
    const hostile = `<img src=x onerror="run()">&'`;
    const encoded = "&lt;img src=x onerror=&quot;run()&quot;&gt;&amp;&#039;";
    const html = orderPopupHtml(hostile, hostile, hostile, hostile, hostile);

    expect(html).toBe(`
          <strong>Cuenta ${encoded}</strong>
          <span>${encoded}</span>
          <span>Medidor ${encoded}</span>
          <span>Deuda: ${encoded} · <strong>${encoded}</strong></span>
        `);
    expect(html).not.toContain("<img");
  });

  it("exposes a string-only popup input contract", () => {
    expectTypeOf(orderPopupHtml).parameters.toEqualTypeOf<[string, string, string, string, string]>();
    expectTypeOf(orderPopupHtml).returns.toEqualTypeOf<string>();
  });
});
