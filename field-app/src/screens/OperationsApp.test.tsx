import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminOrderDetail } from "../components/AdminOrderDetail";
import { AdminSelectionSummary } from "../components/DebtorSearchPanel";
import { OrderCreationModal } from "../components/AdminOrderModals";
import { createDemoPackage } from "../bootstrap/runtime";
import type { DebtorRecord } from "../domain/types";
import { getMissingOrderCreationDebtorIds } from "../utils/filters";

describe("admin order detail statuses", () => {
  it("shows order state once and preserves uncertain physical state", () => {
    const order = { ...createDemoPackage("2026-09-12T10:00:00.000Z").orders[0], physicalStatus: "PHYSICAL_UNKNOWN" as const };
    const markup = renderToStaticMarkup(<AdminOrderDetail order={order} />).toLocaleLowerCase();

    expect(markup.match(/>generada<\/span>/g)).toHaveLength(1);
    expect(markup).toContain("estado físico");
    expect(markup).toContain("físico incierto");
  });
});

describe("admin bulk selection summary", () => {
  it("shows the total selection and the count on the current page", () => {
    const markup = renderToStaticMarkup(<AdminSelectionSummary selectedCount={9} visibleSelectedCount={2} />);

    expect(markup).toContain("9 suministros seleccionados");
    expect(markup).toContain("2 en esta página");
    expect(markup).toContain("La selección se conserva al cambiar de página.");
  });

  it("stays out of the way when no supplies are selected", () => {
    expect(renderToStaticMarkup(<AdminSelectionSummary selectedCount={0} visibleSelectedCount={0} />)).toBe("");
  });
});

describe("admin order creation confirmation", () => {
  it("locks technician selection, dismissal and confirmation while creation is pending", () => {
    const markup = renderToStaticMarkup(<OrderCreationModal dialog={{ mode: "single", debtorIds: [] }} debtors={[]} technicians={[{ userId: "tech-1", username: "tech.one", displayName: "Técnico Uno", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" }]} selectedTechnician="tech-1" busy onTechnicianChange={() => undefined} onCancel={() => undefined} onConfirm={() => undefined} />);

    expect(markup).toMatch(/<select[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Cerrar"/);
    expect(markup).toMatch(/<button[^>]*disabled="">Cancelar/);
    expect(markup).toMatch(/<button[^>]*disabled="">Creando…/);
  });

  it("keeps every selected supply, technician choice, and both confirmation actions in the dialog", () => {
    const debtors: DebtorRecord[] = [
      { debtorId: "supply-1", accountId: "account-1", supplyId: "meter-1", customerName: "Client One", address: "Address One", references: "", meterId: "meter-1", area: "A", locality: "Town", route: "1", debtCents: 100, monthsPending: 2, updatedAt: "2026-09-01", source: "SIMULATED", kardex: [] },
      { debtorId: "supply-2", accountId: "account-2", supplyId: "meter-2", customerName: "Client Two", address: "Address Two", references: "", meterId: "meter-2", area: "A", locality: "Town", route: "1", debtCents: 200, monthsPending: 3, updatedAt: "2026-09-01", source: "SIMULATED", kardex: [] },
    ];
    const markup = renderToStaticMarkup(<OrderCreationModal dialog={{ mode: "batch", debtorIds: ["supply-1", "supply-2"] }} debtors={debtors} technicians={[{ userId: "tech-1", username: "tech.one", displayName: "Técnico Uno", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" }]} selectedTechnician="tech-1" busy={false} onTechnicianChange={() => undefined} onCancel={() => undefined} onConfirm={() => undefined} />);

    expect(markup).toContain("Client One");
    expect(markup).toContain("Client Two");
    expect(markup).toContain("Asignar a técnico");
    expect(markup).toContain("Cancelar");
    expect(markup).toContain("Aceptar y crear órdenes");
  });

  it("blocks creation when refreshed results no longer contain every selected supply", () => {
    const dialog = { mode: "batch" as const, debtorIds: ["supply-1", "supply-2"] };
    const refreshedDebtors: DebtorRecord[] = [
      { debtorId: "supply-1", accountId: "account-1", supplyId: "meter-1", customerName: "Client One", address: "Address One", references: "", meterId: "meter-1", area: "A", locality: "Town", route: "1", debtCents: 100, monthsPending: 2, updatedAt: "2026-09-01", source: "SIMULATED", kardex: [] },
    ];
    const markup = renderToStaticMarkup(<OrderCreationModal dialog={dialog} debtors={refreshedDebtors} technicians={[{ userId: "tech-1", username: "tech.one", displayName: "Técnico Uno", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" }]} selectedTechnician="tech-1" busy={false} onTechnicianChange={() => undefined} onCancel={() => undefined} onConfirm={() => undefined} />);

    expect(getMissingOrderCreationDebtorIds(dialog.debtorIds, refreshedDebtors)).toEqual(["supply-2"]);
    expect(markup).toContain("ID supply-2");
    expect(markup).toContain("No se puede confirmar");
    expect(markup).toMatch(/<button[^>]*disabled="">Aceptar y crear órdenes/);
  });
});
