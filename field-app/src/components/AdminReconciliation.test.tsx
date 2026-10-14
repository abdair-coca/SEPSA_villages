import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReconciliationItem } from "../domain/types";
import { AdminReconciliation, reconciliationCaseLabel } from "./AdminReconciliation";

const consumed: ReconciliationItem = { kind: "CONSUMED_NOT_SYNCED", operationId: "cut-00000000-0000-4000-8000-000000000001", orderId: "order-1", action: "CUT", technicianId: "tech-1", technicianName: "Técnico Uno", accountId: "1300108", customerName: "Cliente", since: "2026-10-12T10:00:00.000Z" };
const conflict: ReconciliationItem = { kind: "SYNC_CONFLICT", operationId: "reconnection-00000000-0000-4000-8000-000000000002", orderId: "order-2", action: "RECONNECTION", technicianId: "tech-1", detail: "La versión de la orden está desactualizada.", since: "2026-10-12T11:00:00.000Z" };
const closed: ReconciliationItem = { kind: "CLOSED_NOT_CONSUMED", operationId: "cut-00000000-0000-4000-8000-000000000003", orderId: "order-3", action: "CUT", technicianId: "tech-2", technicianName: "Técnico Dos", accountId: "1300200", customerName: "Otro cliente", since: "2026-10-12T12:00:00.000Z" };
const noop = () => undefined;

/** Lista de casos de prueba: `count` operaciones de tipo consumido, para probar la paginación. */
const manyConsumed = (count: number): ReconciliationItem[] => Array.from({ length: count }, (_, index) => ({ ...consumed, operationId: `cut-${index}` }));

describe("AdminReconciliation", () => {
  it("opens as a read-only dialog with the summary cards and the case list", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[consumed, conflict]} onClose={noop} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="admin-reconciliation-title"');
    expect(html).toContain("Operaciones por conciliar");
    expect(html).toContain("Solo lectura. El técnico las verifica o las resuelve desde su dispositivo.");
    expect(html).toContain("Conflictos");
    expect(html).toContain("Pendientes de llegar");
    expect(html).toContain("Cerradas sin usar");
    expect(html).toContain("Autorización usada; la operación aún no llega del dispositivo");
    expect(html).toContain("El servidor rechazó la sincronización");
    expect(html).toContain("La versión de la orden está desactualizada.");
    expect(html).toContain("Técnico Uno");
    expect(html).toContain("Cliente no disponible");
  });

  it("shows only the close control as a button: the dialog has no actions for the admin", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[consumed, conflict, closed]} onClose={noop} />);

    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Cerrar"');
  });

  it("presents each card with its figure and label, and a zero count for empty kinds", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[consumed]} onClose={noop} />);

    expect(html).toContain('<li class="admin-reconciliation__card admin-reconciliation__card--conflict"');
    expect(html).toContain('<strong>0</strong><span class="admin-reconciliation__card-label">Conflictos</span>');
    expect(html).toContain('<strong>1</strong><span class="admin-reconciliation__card-label">Pendientes de llegar</span>');
    expect(html).toContain('<strong>0</strong><span class="admin-reconciliation__card-label">Cerradas sin usar</span>');
  });

  it("lists each case as a card with its facts and the detail only for conflicts", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[conflict, closed]} onClose={noop} />);

    expect(html).toContain('<dt>Cuenta</dt><dd>No disponible</dd>');
    expect(html).toContain('<dt>Acción</dt><dd>Reconexión</dd>');
    expect(html).toContain('<dt>Cuenta</dt><dd>1300200</dd>');
    expect(html).toContain('<dt>Técnico</dt><dd>Técnico Dos</dd>');
    expect(html).toContain('<time dateTime="2026-10-12T12:00:00.000Z">');
    expect(html).toContain('<p class="admin-reconciliation__detail">La versión de la orden está desactualizada.</p>');
    expect(html.match(/admin-reconciliation__detail/g)).toHaveLength(1);
  });

  it("lists the cases ordered by kind: conflicts first", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[closed, consumed, conflict]} onClose={noop} />);

    const conflictAt = html.indexOf("La versión de la orden está desactualizada.");
    const pendingAt = html.indexOf("Autorización usada; la operación aún no llega del dispositivo");
    const closedAt = html.indexOf("Cerrada: la autorización no se usó y se pidió otra");
    expect(conflictAt).toBeGreaterThan(-1);
    expect(conflictAt).toBeLessThan(pendingAt);
    expect(pendingAt).toBeLessThan(closedAt);
  });

  it("pages the list eight cases at a time with a labelled pager", () => {
    const first = renderToStaticMarkup(<AdminReconciliation items={manyConsumed(9)} onClose={noop} />);
    expect(first.match(/admin-reconciliation__item /g)).toHaveLength(8);
    expect(first).toContain('aria-label="Paginación de operaciones por conciliar"');
    expect(first).toContain("Página 1 de 2");

    const single = renderToStaticMarkup(<AdminReconciliation items={manyConsumed(8)} onClose={noop} />);
    expect(single).not.toContain("Paginación de operaciones por conciliar");
  });

  it("explains the empty state and keeps the cards at zero", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[]} onClose={noop} />);

    expect(html).toContain("Sin operaciones por conciliar");
    expect(html).toContain("aparecerá aquí");
    expect(html).not.toContain("admin-reconciliation__list");
    expect(html.match(/<strong>0<\/strong>/g)).toHaveLength(3);
  });
});

describe("reconciliationCaseLabel", () => {
  it("names the count in the account menu", () => {
    expect(reconciliationCaseLabel(0)).toBe("Sin casos");
    expect(reconciliationCaseLabel(1)).toBe("1 caso");
    expect(reconciliationCaseLabel(3)).toBe("3 casos");
  });
});
