import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExitConfirmationModal } from "./ExitConfirmationModal";

describe("exit confirmation modal", () => {
  it("renders accessible dialog, saved-data message, and both actions", () => {
    const markup = renderToStaticMarkup(<ExitConfirmationModal onStay={() => undefined} onExit={() => undefined} />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="exit-modal-title"');
    expect(markup).toContain("¿Quieres salir de la aplicación?");
    expect(markup).toContain("Los datos guardados localmente no se perderán.");
    expect(markup).toContain("Seguir aquí");
    expect(markup).toContain("Salir");
  });
});
