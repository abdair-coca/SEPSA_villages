import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { handleFullscreenMapKeyDown, orderPopupHtml, restoreFullscreenMapFocus } from "./FieldMap";

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

describe("fullscreen map focus", () => {
  it("wraps Tab in both directions and closes on Escape", () => {
    const first = { focus: vi.fn(), getClientRects: () => [{}] } as unknown as HTMLElement;
    const last = { focus: vi.fn(), getClientRects: () => [{}] } as unknown as HTMLElement;
    const dialog = { querySelectorAll: () => [first, last], focus: vi.fn() } as unknown as HTMLElement;
    vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));

    const tabForward = {
      key: "Tab",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    vi.stubGlobal("document", { activeElement: last });
    handleFullscreenMapKeyDown(tabForward, dialog);
    expect(tabForward.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();

    const tabBackward = {
      key: "Tab",
      shiftKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    vi.stubGlobal("document", { activeElement: first });
    handleFullscreenMapKeyDown(tabBackward, dialog);
    expect(tabBackward.preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();

    const onClose = vi.fn();
    const escape = {
      key: "Escape",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    handleFullscreenMapKeyDown(escape, dialog, onClose);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(escape.stopPropagation).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it("returns focus to the opener, with a dialog fallback", () => {
    const opener = { isConnected: true, focus: vi.fn() } as unknown as HTMLElement;
    const fallback = { focus: vi.fn() } as unknown as HTMLButtonElement;
    const dialog = { querySelector: () => fallback } as unknown as HTMLElement;

    restoreFullscreenMapFocus(opener, dialog);
    expect(opener.focus).toHaveBeenCalledOnce();

    restoreFullscreenMapFocus(null, dialog);
    expect(fallback.focus).toHaveBeenCalledOnce();
  });
});
