import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppStateCard } from "./UiState";

describe("shared UI state card", () => {
  it("renders an accessible loading state with its status message", () => {
    const markup = renderToStaticMarkup(<AppStateCard tone="loading" title="Cargando" description="Consultando información." />);

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Cargando");
    expect(markup).toContain("Consultando información.");
  });

  it("renders a recoverable error action without changing the caller flow", () => {
    const markup = renderToStaticMarkup(<AppStateCard tone="error" title="No disponible" description="Intenta nuevamente." action={{ label: "Reintentar", onClick: () => undefined, variant: "secondary" }} />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Reintentar");
  });

  it("renders an inline empty state with useful description and action", () => {
    const markup = renderToStaticMarkup(<AppStateCard tone="empty" layout="inline" title="Sin órdenes" description="Actualiza tu bandeja." action={{ label: "Actualizar", onClick: () => undefined }} />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Sin órdenes");
    expect(markup).toContain("Actualiza tu bandeja.");
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Actualizar");
  });

  it("keeps inline errors announced and supports the existing main element", () => {
    const markup = renderToStaticMarkup(<AppStateCard as="main" tone="error" layout="inline" title="Sin conexión" description="Datos locales disponibles." />);
    expect(markup).toMatch(/^<main/);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Datos locales disponibles.");
  });

  it("delegates recovery action exactly once", () => {
    const onClick = vi.fn();
    const node = AppStateCard({ tone: "empty", layout: "inline", title: "Sin datos", description: "Consulta nuevamente.", action: { label: "Actualizar", onClick } });
    const children = (node.props as { children: ReactElement[] }).children;
    const button = children.find((child) => child && child.type === "button")!;
    (button.props as { onClick: () => void }).onClick();
    expect(onClick).toHaveBeenCalledExactlyOnceWith();
  });
});
