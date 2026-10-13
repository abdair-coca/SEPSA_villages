import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminReconciliation } from "./AdminReconciliation";

describe("AdminReconciliation", () => {
  it("lists operations to reconcile without any action for the admin", () => {
    const html = renderToStaticMarkup(<AdminReconciliation items={[
      { kind: "CONSUMED_NOT_SYNCED", operationId: "cut-00000000-0000-4000-8000-000000000001", orderId: "order-1", action: "CUT", technicianId: "tech-1", technicianName: "Técnico Uno", accountId: "1300108", customerName: "Cliente", since: "2026-10-12T10:00:00.000Z" },
      { kind: "SYNC_CONFLICT", operationId: "reconnection-00000000-0000-4000-8000-000000000002", orderId: "order-2", action: "RECONNECTION", technicianId: "tech-1", detail: "La versión de la orden está desactualizada.", since: "2026-10-12T11:00:00.000Z" },
    ]} />);
    expect(html).toContain("Operaciones por conciliar");
    expect(html).toContain("Autorización usada; la operación aún no llega del dispositivo");
    expect(html).toContain("El servidor rechazó la sincronización");
    expect(html).toContain("La versión de la orden está desactualizada.");
    expect(html).not.toContain("<button");
    expect(renderToStaticMarkup(<AdminReconciliation items={[]} />)).toContain("Sin operaciones por conciliar.");
  });
});
