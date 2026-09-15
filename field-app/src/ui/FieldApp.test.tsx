import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndexedDbLocalRepository, deleteFieldDatabase } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockEnablementAdapter, MockSyncTransport } from "../adapters/mock";
import { createAppStore, createDemoPackage, DEMO_DEVICE_ID, DEMO_TECHNICIAN_ID, type AppStore } from "../app/index";
import type { WorkOrder, WorkPackage } from "../domain";
import { FieldApp, sortOrdersForNext } from "./FieldApp";

const repositories: IndexedDbLocalRepository[] = [];
const databaseNames: string[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const databaseName of databaseNames.splice(0)) await deleteFieldDatabase(databaseName);
});

async function readyStore(name: string, seedPackage: WorkPackage = createDemoPackage("2026-09-12T10:00:00.000Z")): Promise<AppStore> {
  databaseNames.push(name);
  const repository = new IndexedDbLocalRepository({ dbName: name, technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
  repositories.push(repository);
  const store = createAppStore({
    repository,
    authorization: new MockAuthorizationAdapter({ mode: "online" }),
    enablement: new MockEnablementAdapter({ mode: "online" }),
    connectivity: new MockConnectivity("online"),
    transport: new MockSyncTransport({ mode: "online" }),
    seedPackage,
  });
  await store.init();
  return store;
}

function html(store: AppStore): string {
  return renderToStaticMarkup(<FieldApp store={store} />).toLocaleLowerCase();
}

describe("FieldApp SSR shell", () => {
  it("prioritizes pending, review, completed, and cancelled orders", () => {
    const base = createDemoPackage("2026-09-12T10:00:00.000Z").orders[0];
    const orders: WorkOrder[] = [
      { ...base, orderId: "cancelled", status: "ANULADO" },
      { ...base, orderId: "completed", status: "EJECUTADO", physicalStatus: "CONFIRMED" },
      { ...base, orderId: "review", status: "GENERADO", physicalStatus: "PHYSICAL_UNKNOWN" },
      { ...base, orderId: "pending", status: "GENERADO", physicalStatus: "NONE" },
    ];

    expect(sortOrdersForNext(orders).map((order) => order.orderId)).toEqual(["pending", "review", "completed", "cancelled"]);
  });

  it("renders ready shell, assigned list, detail, and action eligibility", async () => {
    const store = await readyStore("ui-ready");
    expect(html(store)).toContain("jornada de campo");
    expect(html(store)).toContain("ord-24017");
    expect(html(store)).toContain("actualizar bandeja");
    expect(html(store)).toContain("por ejecutar");
    expect(html(store)).toContain("desktop-sync-activity-panel");
    expect(html(store)).toContain("no hay operaciones pendientes.");
    expect(html(store)).toContain("ver todas");
    expect(html(store)).not.toContain("trabajo de hoy");
    expect(html(store)).not.toContain("tu jornada");
    expect(html(store)).not.toContain("primero resuelve la orden actual");
    expect(html(store)).toContain("ver detalle");
    expect(html(store)).toContain("marcar incidencia");

    store.selectOrder("ORD-24017");
    const generated = html(store);
    expect(generated).toContain("detalle de ord-24017");
    expect(generated).toContain("preparar corte");
    expect(generated).not.toContain("preparar reconexión");

    store.selectOrder("ORD-24019");
    const executed = html(store);
    expect(executed).toContain("preparar reconexión");
    expect(executed).not.toContain("preparar corte");
  });

  it("renders durable queue state after local visit", async () => {
    const store = await readyStore("ui-queue");
    store.setMode("offline");
    await store.registerVisit("ORD-24017", { reason: "Visita local de verificación." });
    store.setTab("queue");
    const markup = html(store);
    expect(markup).toContain("cola de sincronización");
    expect(markup).toContain("pendiente");
    expect(markup).toContain("1 intento(s)");
  });

  it("shows PHYSICAL_UNKNOWN review and never renders repeat action", async () => {
    const seedPackage = createDemoPackage("2026-09-12T10:00:00.000Z");
    const unknownPackage: WorkPackage = {
      ...seedPackage,
      orders: seedPackage.orders.map((order) => order.orderId === "ORD-24017" ? { ...order, physicalStatus: "PHYSICAL_UNKNOWN" } : order),
    };
    const store = await readyStore("ui-unknown", unknownPackage);
    store.selectOrder("ORD-24017");
    const markup = html(store);
    expect(markup).toContain("resultado incierto");
    expect(markup).toContain("no repetir acción");
    expect(markup).not.toContain("preparar corte");
    expect(markup).not.toContain("preparar reconexión");
  });

  it("keeps payment scope out while exposing the desktop map", async () => {
    const store = await readyStore("ui-scope");
    const markup = html(store);
    expect(markup).not.toMatch(/pago/);
    expect(markup).toContain("mapa de órdenes");
    expect(markup).toContain("expandir mapa a pantalla completa");
    expect(markup).not.toContain("datos de demostración");
    expect(markup).not.toContain("operaciones sincronizadas");
  });

  it("filters orders by customer name or meter with unified smart search", async () => {
    const store = await readyStore("ui-search");
    store.setQuery("Quispe");
    const markup = html(store);
    expect(markup).toContain("josé quispe");
    expect(markup).not.toContain("maría flores");

    store.setQuery("MED-1001");
    const meterMarkup = html(store);
    expect(meterMarkup).toContain("maría flores");
    expect(meterMarkup).not.toContain("josé quispe");
  });

  it("paginates filtered field orders and keeps only the open action", async () => {
    const seedPackage = createDemoPackage("2026-09-12T10:00:00.000Z");
    const baseOrder = seedPackage.orders[0];
    if (!baseOrder.context) throw new Error("Demo order needs operational context");
    const pagedPackage: WorkPackage = {
      ...seedPackage,
      orders: Array.from({ length: 7 }, (_, index) => ({
        ...baseOrder,
        orderId: `ORD-PAGE-${index + 1}`,
        context: { ...baseOrder.context, customerName: `Cliente página ${index + 1}` } as NonNullable<WorkOrder["context"]>,
      })),
    };
    const store = await readyStore("ui-pagination", pagedPackage);

    const firstPage = html(store);
    expect(firstPage).toContain("mostrando 1-5 de 7 órdenes");
    expect(firstPage).toContain("cliente página 1");
    expect(firstPage).toContain("cliente página 5");
    expect(firstPage).not.toContain("cliente página 6");
    expect(firstPage).not.toContain("order-card__map-btn");

    store.setQuery("Cliente página 6");
    const filtered = html(store);
    expect(filtered).toContain("mostrando 1-1 de 1 órdenes");
    expect(filtered).toContain("cliente página 6");
    expect(filtered).not.toContain("cliente página 1");
  });

  it("renders back button to tray in fullscreen order detail", async () => {
    const store = await readyStore("ui-fullscreen");
    store.selectOrder("ORD-24017");
    const detailMarkup = html(store);
    expect(detailMarkup).toContain("volver a la bandeja");
    expect(detailMarkup).toContain("detalle de ord-24017");

    store.selectOrder(null);
    const trayMarkup = html(store);
    expect(store.getSnapshot().selectedOrderId).toBeNull();
    expect(trayMarkup).toContain("mis órdenes");
    expect(trayMarkup).not.toContain("detalle de ord-24017");
  });

  it("shows explicit missing-location state without fallback coordinates", async () => {
    const seedPackage = createDemoPackage("2026-09-12T10:00:00.000Z");
    const packageWithoutCoordinates: WorkPackage = {
      ...seedPackage,
      orders: seedPackage.orders.map((order) => order.context ? {
        ...order,
        context: {
          ...order.context,
          cadastralLatitude: undefined,
          cadastralLongitude: undefined,
        },
      } : order),
    };
    const store = await readyStore("ui-no-coordinates", packageWithoutCoordinates);
    const markup = html(store);
    expect(markup).toContain("ubicaciones no disponibles");
    expect(markup).not.toContain("-19.589366");
  });
});
