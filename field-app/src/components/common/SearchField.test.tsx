import { renderToStaticMarkup } from "react-dom/server";
import type { ChangeEvent, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

function elements(node: ReactElement): ReactElement[] {
  const props = node.props as { children?: ReactElement | ReactElement[] };
  const children = [props.children].flat().filter((child): child is ReactElement => !!child && typeof child === "object" && "props" in child);
  return [node, ...children.flatMap(elements)];
}

describe("shared search field", () => {
  it("keeps its label stable when value and placeholder change", () => {
    for (const value of ["", "123"]) {
      const markup = renderToStaticMarkup(<SearchField id="orders" label="Buscar órdenes" value={value} onChange={vi.fn()} placeholder={value || "Cuenta"} />);
      expect(markup).toContain('id="orders"');
      expect(markup).toContain('aria-label="Buscar órdenes"');
      expect(markup).toContain('type="search"');
    }
  });

  it("passes entered text unchanged to caller", () => {
    const onChange = vi.fn();
    const input = elements(SearchField({ id: "q", label: "Buscar", value: "", onChange })).find((node) => node.type === "input")!;
    (input.props as { onChange: (event: ChangeEvent<HTMLInputElement>) => void }).onChange({ currentTarget: { value: "  M-12 " } } as ChangeEvent<HTMLInputElement>);
    expect(onChange).toHaveBeenCalledWith("  M-12 ");
  });

  it("clears through caller override or controlled value callback", () => {
    for (const override of [false, true]) {
      const onChange = vi.fn();
      const onClear = vi.fn();
      const button = elements(SearchField({ id: "q", label: "Buscar", value: "abc", onChange, onClear: override ? onClear : undefined })).find((node) => node.type === "button")!;
      const props = button.props as { type: string; onClick: () => void };
      expect(props.type).toBe("button");
      props.onClick();
      expect(override ? onClear : onChange).toHaveBeenCalledOnce();
      if (!override) expect(onChange).toHaveBeenCalledWith("");
      if (override) expect(onChange).not.toHaveBeenCalled();
    }
  });

  it("exposes busy state without preventing continued search", () => {
    const markup = renderToStaticMarkup(<SearchField id="q" label="Buscar" value="abc" onChange={vi.fn()} busy />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('disabled=""');
  });

  it("disables input and clear together, omits clear for empty text", () => {
    const markup = renderToStaticMarkup(<SearchField id="q" label="Buscar" value="abc" onChange={vi.fn()} disabled />);
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<SearchField id="q" label="Buscar" value="" onChange={vi.fn()} />)).not.toContain("<button");
  });

  it("does not clear through its handler while disabled", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const button = elements(SearchField({ id: "q", label: "Buscar", value: "abc", onChange, onClear, disabled: true })).find((node) => node.type === "button")!;
    (button.props as { onClick: () => void }).onClick();
    expect(onClear).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
