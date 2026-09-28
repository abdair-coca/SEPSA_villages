import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppStateCard } from "./UiState";

describe("shared UI state card", () => {
  it("renders an accessible loading state with its status message", () => {
    const markup = renderToStaticMarkup(<AppStateCard tone="loading" title="Cargando" description="Consultando información." />);

    expect(markup).toContain('class="ui-state-card ui-state-card--loading"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Cargando");
    expect(markup).toContain("Consultando información.");
  });

  it("renders a recoverable error action without changing the caller flow", () => {
    const markup = renderToStaticMarkup(<AppStateCard tone="error" title="No disponible" description="Intenta nuevamente." action={{ label: "Reintentar", onClick: () => undefined, variant: "secondary" }} />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('class="secondary-action"');
    expect(markup).toContain("Reintentar");
  });
});
