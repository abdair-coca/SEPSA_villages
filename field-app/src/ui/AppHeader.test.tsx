import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppHeader } from "./AppHeader";

describe("shared app header", () => {
  it("preserves field identity, context, connectivity actions, and both logout controls", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        variant="field"
        onLogout={() => undefined}
        context={
          <>
            <span>Técnico:</span><strong>Camila Rojas</strong>
            <span className="header-context__separator" aria-hidden="true">|</span>
            <span className="header-device">Dispositivo: device-60cf…eb79</span>
          </>
        }
        actions={<div className="header-meta"><div className="header-top-actions"><button type="button" aria-label="Reintentar envío">Reintentar envío</button><button type="button" className="logout-button">Cerrar sesión</button></div><button type="button">Enviar pendientes y actualizar</button></div>}
      />,
    );

    expect(markup).toContain('<header class="app-header">');
    expect(markup).toContain('<div class="identity-block">');
    expect(markup).toContain('<div class="field-brand"><strong>SEPSA</strong><span>CAMPO</span></div>');
    expect(markup).toContain("<h1>Jornada de campo</h1>");
    expect(markup).toContain('class="identity">Órdenes asignadas, ejecución de cortes y sincronización en terreno.</p>');
    expect(markup).toContain('<div class="header-context"><span>Técnico:</span><strong>Camila Rojas</strong>');
    expect(markup).toContain("Dispositivo: device-60cf…eb79");
    expect(markup).toContain('aria-label="Cerrar sesión"');
    expect(markup).toContain("Reintentar envío");
    expect(markup).toContain("Enviar pendientes y actualizar");
    expect(markup).toContain('class="logout-button"');
  });

  it("preserves admin identity, environment context, title, and logout action", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        variant="admin"
        session={{
          sessionId: "session-1",
          userId: "admin-1",
          username: "admin.user",
          displayName: "Ana Pérez",
          role: "ADMIN",
          permissions: [],
          issuedAt: "2026-09-27T10:00:00.000Z",
          authenticity: "SIMULATED",
        }}
        onLogout={() => undefined}
      />,
    );

    expect(markup).toContain('<div class="admin-topbar">');
    expect(markup).toContain('<div class="admin-brand-lockup">');
    expect(markup).toContain('<span class="admin-notification" aria-hidden="true"></span>');
    expect(markup).not.toContain('role="img"');
    expect(markup).not.toContain('aria-label="Notificaciones"');
    expect(markup).toContain("Sistema de Operaciones");
    expect(markup).toContain("Administración <strong>SIMULATED</strong>");
    expect(markup).toContain('<span class="admin-avatar" aria-hidden="true">AP</span>');
    expect(markup).toContain("<strong>Ana Pérez</strong><span>Admin</span>");
    expect(markup).toContain('<header class="operations-header admin-header">');
    expect(markup).toContain("<h1>Centro de control de órdenes de corte</h1>");
    expect(markup).toContain("Busca suministros con mora, genera órdenes y asigna técnicos.");
    expect(markup).toContain('class="admin-logout-link" type="button">Cerrar sesión</button>');
  });
});
