import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PaginationControls } from "./PaginationControls";

describe("shared pagination controls", () => {
  it("names navigation and announces the caller's page", () => {
    const markup = renderToStaticMarkup(<PaginationControls page={2} totalPages={3} onPrevious={vi.fn()} onNext={vi.fn()} />);
    expect(markup).toContain('aria-label="Paginación"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Página 2 de 3");
    expect(markup).toContain("Anterior");
    expect(markup).toContain("Siguiente");
  });

  it.each([[1, 3, true, false], [3, 3, false, true], [1, 1, true, true], [0, 0, true, true]])("disables boundary actions at page %i of %i", (page, totalPages, previousDisabled, nextDisabled) => {
    const node = PaginationControls({ page, totalPages, onPrevious: vi.fn(), onNext: vi.fn() });
    const children = (node.props as { children: ReactElement[] }).children;
    expect((children[0].props as { disabled: boolean }).disabled).toBe(previousDisabled);
    expect((children[2].props as { disabled: boolean }).disabled).toBe(nextDisabled);
  });

  it("delegates both actions without calculating business pages", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const node = PaginationControls({ page: 2, totalPages: 5, onPrevious, onNext });
    const children = (node.props as { children: ReactElement[] }).children;
    for (const index of [0, 2]) {
      const props = children[index].props as { type: string; onClick: () => void };
      expect(props.type).toBe("button");
      props.onClick();
    }
    expect(onPrevious).toHaveBeenCalledExactlyOnceWith();
    expect(onNext).toHaveBeenCalledExactlyOnceWith();
  });

  it("supports independent names and caller-disabled actions", () => {
    const markup = renderToStaticMarkup(<PaginationControls page={2} totalPages={3} label="Paginación de cola" disabled onPrevious={vi.fn()} onNext={vi.fn()} />);
    expect(markup).toContain('aria-label="Paginación de cola"');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});
