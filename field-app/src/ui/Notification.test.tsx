import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Notification, shouldAutoDismissNotification, type NotificationTone } from "./Notification";

const tones: { tone: NotificationTone; label: string; role: string }[] = [
  { tone: "success", label: "Éxito", role: "status" },
  { tone: "info", label: "Información", role: "status" },
  { tone: "warning", label: "Advertencia", role: "status" },
  { tone: "error", label: "Error", role: "alert" },
];

describe("Notification", () => {
  it.each(tones)("identifica el tono $tone con una etiqueta y semántica accesibles", ({ tone, label, role }) => {
    const markup = renderToStaticMarkup(<Notification tone={tone} text="Mensaje de prueba." />);

    expect(markup).toContain(`message--${tone}`);
    expect(markup).toContain(`notification__kind--${tone}`);
    expect(markup).toContain(`>${label}<`);
    expect(markup).toContain(`role="${role}"`);
    expect(markup).toContain(`aria-live="${tone === "error" ? "assertive" : "polite"}"`);
    expect(markup).toContain('aria-hidden="true"');
  });

  it("mantiene la acción y el cierre accesibles", () => {
    const markup = renderToStaticMarkup(
      <Notification
        tone="warning"
        text="Algunas operaciones requieren revisión."
        action={{ label: "Ver operaciones pendientes", onClick: () => undefined }}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Ver operaciones pendientes");
    expect(markup).toContain('aria-label="Cerrar notificación"');
  });
});

describe("shouldAutoDismissNotification", () => {
  it("autocierra éxito e información rutinarios en móvil", () => {
    expect(shouldAutoDismissNotification("success", { isMobile: true })).toBe(true);
    expect(shouldAutoDismissNotification("info", { isMobile: true })).toBe(true);
  });

  it("mantiene acciones, advertencias y errores visibles", () => {
    expect(shouldAutoDismissNotification("info", { isMobile: true, hasAction: true })).toBe(false);
    expect(shouldAutoDismissNotification("success", { isMobile: true, hasAction: true })).toBe(false);
    expect(shouldAutoDismissNotification("warning", { isMobile: true })).toBe(false);
    expect(shouldAutoDismissNotification("error", { isMobile: true })).toBe(false);
  });

  it("conserva los mensajes transient explícitos en desktop", () => {
    expect(shouldAutoDismissNotification("success", { isMobile: false, transient: true })).toBe(true);
    expect(shouldAutoDismissNotification("info", { isMobile: false, transient: true })).toBe(true);
    expect(shouldAutoDismissNotification("info", { isMobile: false })).toBe(false);
  });
});
