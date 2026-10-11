import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppModal } from "./Modal";

describe("shared modal markup", () => {
  it("renders a labelled, described dialog without a browser document", () => {
    const markup = renderToStaticMarkup(<AppModal titleId="title" title="Confirmar" describedBy="message" onClose={vi.fn()}><p id="message">Datos guardados.</p></AppModal>);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="title"');
    expect(markup).toContain('aria-describedby="message"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Datos guardados.");
  });

  it("disables the close control while caller blocks dismissal", () => {
    const markup = renderToStaticMarkup(<AppModal titleId="title" title="Guardando" closeDisabled onClose={vi.fn()}>Captura</AppModal>);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Cerrar"/);
  });

  it("allows caller-owned completion content and a single Listo action", () => {
    const markup = renderToStaticMarkup(<AppModal titleId="done" title="Resultado incierto" variant="completion" hideCloseButton icon={<svg />} className="cut-completion--review" onClose={vi.fn()}><p>Revisión humana requerida.</p><button type="button">Listo</button></AppModal>);
    expect(markup).toContain('data-ui-theme="field"');
    expect(markup).toContain("Resultado incierto");
    expect(markup).toContain("Revisión humana requerida.");
    expect(markup).toContain('aria-hidden="true"><svg');
    expect(markup).not.toContain('aria-label="Cerrar"');
    expect(markup.match(/<button/g)).toHaveLength(1);
  });
});
