import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReconciliationItem } from "../domain/types";
import { AdminReconciliation } from "./AdminReconciliation";

const consumed: ReconciliationItem = { kind: "CONSUMED_NOT_SYNCED", operationId: "cut-00000000-0000-4000-8000-000000000001", orderId: "order-1", action: "CUT", technicianId: "tech-1", technicianName: "Técnico Uno", accountId: "1300108", customerName: "Cliente", since: "2026-10-12T10:00:00.000Z" };
const conflict: ReconciliationItem = { kind: "SYNC_CONFLICT", operationId: "reconnection-00000000-0000-4000-8000-000000000002", orderId: "order-2", action: "RECONNECTION", technicianId: "tech-1", detail: "La versión de la orden está desactualizada.", since: "2026-10-12T11:00:00.000Z" };

describe("AdminReconciliation", () => {
  it("groups operations by kind with a count per kind and no action for the admin", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[consumed, conflict]} />);

    expect(html).toContain("Operaciones por conciliar");
    expect(html).toContain("2 casos");
    expect(html).toContain("Conflictos");
    expect(html).toContain("Pendientes de llegar");
    expect(html).toContain("Cerradas sin usar");
    expect(html).toContain("Autorización usada; la operación aún no llega del dispositivo");
    expect(html).toContain("El servidor rechazó la sincronización");
    expect(html).toContain("La versión de la orden está desactualizada.");
    expect(html).not.toContain("<button");
  });

  it("renders each group as a table whose cells carry labels for the mobile card layout", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[consumed]} />);

    expect(html).toContain('<table class="admin-reconciliation__table" aria-labelledby="admin-reconciliation-CONSUMED_NOT_SYNCED">');
    expect(html).toContain('<th scope="col">Cuenta</th>');
    expect(html).toContain('<td data-label="Cliente">Cliente</td>');
    expect(html).toContain('<td data-label="Técnico">Técnico Uno</td>');
    expect(html).toContain('<time dateTime="2026-10-12T10:00:00.000Z">');
  });

  it("omits groups without operations and shows the detail only for conflicts", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[conflict]} />);

    expect(html).toContain("admin-reconciliation__group--conflict");
    expect(html).not.toContain("admin-reconciliation__group--pending");
    expect(html).toContain('<tr class="admin-reconciliation__detail">');
    expect(renderToStaticMarkup(<AdminReconciliation items={[consumed]} />)).not.toContain("admin-reconciliation__detail");
  });

  it("shows the summary counters with zero for empty kinds", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[consumed]} />);

    expect(html).toContain('<li class="admin-reconciliation__summary-item admin-reconciliation__summary-item--conflict"><span>Conflictos</span><strong>0</strong></li>');
    expect(html).toContain('<li class="admin-reconciliation__summary-item admin-reconciliation__summary-item--pending"><span>Pendientes de llegar</span><strong>1</strong></li>');
  });

  it("explains the empty state without a count", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[]} />);

    expect(html).toContain("Sin operaciones por conciliar");
    expect(html).toContain("aparecerá aquí");
    expect(html).not.toContain("admin-reconciliation__count");
    expect(html).not.toContain("admin-reconciliation__summary");
  });
});
