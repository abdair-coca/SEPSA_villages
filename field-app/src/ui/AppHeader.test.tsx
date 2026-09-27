import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppHeader } from "./AppHeader";

describe("shared app header", () => {
  it("renders the shared field top bar, status, account menu, context, and actions", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        role="field"
        title="Jornada de campo"
        description="Órdenes asignadas, ejecución de cortes y sincronización en terreno."
        user={{ displayName: "Camila Rojas", roleLabel: "Técnico" }}
        onLogout={() => undefined}
        context={
          <>
            <span>Técnico:</span><strong>Camila Rojas</strong>
            <span className="header-context__separator" aria-hidden="true">|</span>
            <span className="header-device">Dispositivo: device-60cf…eb79</span>
          </>
        }
        status={{ tone: "positive", label: "Red disponible" }}
        actions={<div className="header-action-row"><button type="button" aria-label="Reintentar envío">Reintentar envío</button><button type="button">Enviar pendientes y actualizar</button></div>}
      />,
    );

    expect(markup).toContain('<header class="app-header app-shell app-header--field" data-shell="shared">');
    expect(markup).toContain('<div class="app-header__topbar">');
    expect(markup).toContain('<div class="app-brand"><strong>SEPSA</strong><span>CAMPO</span></div>');
    expect(markup).toContain('class="app-status-badge app-status-badge--positive"');
    expect(markup).toContain("Red disponible");
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Abrir menú de Camila Rojas"');
    expect(markup).toContain('role="menu"');
    expect(markup).toContain('role="menuitem"');
    expect(markup).toContain("Camila Rojas");
    expect(markup).toContain("Técnico");
    expect(markup).toContain("Cerrar sesión");
    expect(markup).toContain('<div class="app-header__body">');
    expect(markup).toContain("<h1>Jornada de campo</h1>");
    expect(markup).toContain('class="app-header__description">Órdenes asignadas, ejecución de cortes y sincronización en terreno.</p>');
    expect(markup).toContain('<div class="header-context"><span>Técnico:</span><strong>Camila Rojas</strong>');
    expect(markup).toContain("Dispositivo: device-60cf…eb79");
    expect(markup).toContain("Reintentar envío");
    expect(markup).toContain("Enviar pendientes y actualizar");
    expect(markup).not.toContain('aria-label="Cerrar sesión"');
  });

  it("renders the Admin environment and account details in the same shell", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        role="admin"
        title="Centro de control de órdenes de corte"
        description="Busca suministros con mora, genera órdenes y asigna técnicos."
        user={{ displayName: "Ana Pérez", roleLabel: "Admin", authenticity: "SIMULATED" }}
        status={{ tone: "environment", label: "Entorno · SIMULATED" }}
        onLogout={() => undefined}
      />,
    );

    expect(markup).toContain('<header class="app-header app-shell app-header--admin" data-shell="shared">');
    expect(markup).toContain('<div class="app-brand"><strong>SEPSA</strong><span>OPERACIONES</span></div>');
    expect(markup).toContain('class="app-status-badge app-status-badge--environment"');
    expect(markup).toContain("Entorno · SIMULATED");
    expect(markup).toContain('<span>Entorno · SIMULATED</span>');
    expect(markup).toContain("Ana Pérez");
    expect(markup).toContain("Admin");
    expect(markup).toContain("<h1>Centro de control de órdenes de corte</h1>");
    expect(markup).toContain("Busca suministros con mora, genera órdenes y asigna técnicos.");
  });

  it("uses the same top bar and heading structure for both roles", () => {
    const renderHeader = (role: "admin" | "field") => renderToStaticMarkup(
      <AppHeader
        role={role}
        title="Título"
        description="Descripción"
        user={{ displayName: "Ana Pérez", roleLabel: role === "admin" ? "Admin" : "Técnico" }}
        status={{ tone: role === "admin" ? "environment" : "positive", label: "Estado" }}
        onLogout={() => undefined}
      />,
    );

    for (const role of ["admin", "field"] as const) {
      const markup = renderHeader(role);
      expect(markup).toContain(`class="app-header app-shell app-header--${role}" data-shell="shared"`);
      expect(markup).toContain('<div class="app-header__topbar">');
      expect(markup).toContain('<div class="app-header__body">');
      expect(markup).toContain('<div class="app-header__status">');
      expect(markup).toContain('<div class="app-header__account">');
      expect(markup).toContain('class="app-header__account-menu" role="menu"');
      expect(markup).toContain("<h1>Título</h1>");
    }
  });
});
