import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndexedDbLocalRepository, deleteFieldDatabase } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockEnablementAdapter, MockSyncTransport } from "../adapters/mock";
import { createAppStore, createDemoPackage, DEMO_DEVICE_ID, DEMO_TECHNICIAN_ID, type AppStore } from "../app/index";
import type { WorkOrder, WorkPackage } from "../domain";
import { adjacentJourneyOrder, FieldApp, fieldOrderStatusLabel, orderActivityReviewPages, OrderReviewMap, orderJourneyOrders, paginateReviewFields, sortOrdersForNext, syncThenRefreshAssigned } from "./FieldApp";

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
  it("syncs every pending queue action before refreshing assigned orders", async () => {
    const events: string[] = [];
    let syncItems = [
      { operationId: "pending-cut", status: "failed" as const, attempts: 1, action: "CUT" as const },
      { operationId: "pending-visit", status: "pending" as const, attempts: 0, action: "VISIT" as const },
      { operationId: "pending-reconnection", status: "failed" as const, attempts: 2, action: "RECONNECTION" as const },
    ];
    const store = {
      getSnapshot: () => ({ syncItems }),
      sync: async () => { events.push("sync"); syncItems = []; },
    } as unknown as AppStore;

    await syncThenRefreshAssigned(store, async () => { events.push("refresh"); });

    expect(events).toEqual(["sync", "refresh"]);
  });

  it("keeps failed pending work and reports missing server acknowledgment", async () => {
    const queued = { operationId: "pending-unsent", status: "pending" as const, attempts: 0, action: "VISIT" as const, errorCode: "NETWORK_UNAVAILABLE" };
    const syncItems = [queued];
    let refreshed = false;
    const store = {
      getSnapshot: () => ({ syncItems }),
      sync: async () => undefined,
    } as unknown as AppStore;

    await expect(syncThenRefreshAssigned(store, async () => { refreshed = true; })).rejects.toThrow(
      "El servidor no confirmó 1 operación(es) pendiente(s) (NETWORK_UNAVAILABLE). Los registros y evidencias siguen guardados en este dispositivo.",
    );

    expect(refreshed).toBe(false);
    expect(store.getSnapshot().syncItems).toEqual([queued]);
  });

  it("prioritizes pending, review, completed, and cancelled orders", () => {
    const base = createDemoPackage("2026-09-12T10:00:00.000Z").orders[0];
    const orders: WorkOrder[] = [
      { ...base, orderId: "cancelled", status: "ANULADO" },
      { ...base, orderId: "completed", status: "EJECUTADO", physicalStatus: "CONFIRMED" },
      { ...base, orderId: "review", status: "GENERADO", physicalStatus: "PHYSICAL_UNKNOWN" },
      { ...base, orderId: "pending", status: "GENERADO", physicalStatus: "NONE" },
    ];

    expect(sortOrdersForNext(orders).map((order) => order.orderId)).toEqual(["pending", "review", "completed", "cancelled"]);
    expect(orderJourneyOrders(orders).map((order) => order.orderId)).toEqual(["pending", "review", "completed", "cancelled"]);
    const journey = orderJourneyOrders(orders);
    expect(journey.at(0)?.orderId).toBe("pending");
    expect(journey.at(-1)?.orderId).toBe("cancelled");
    expect(adjacentJourneyOrder(journey, 0, 1)?.orderId).toBe("review");
    expect(adjacentJourneyOrder(journey, journey.length - 1, -1)?.orderId).toBe("completed");
    expect(adjacentJourneyOrder(journey, 0, -1)).toBeUndefined();
    expect(adjacentJourneyOrder(journey, journey.length - 1, 1)).toBeUndefined();
  });

  it("renders ready shell, assigned list, detail, and action eligibility", async () => {
    const store = await readyStore("ui-ready");
    const home = html(store);
    expect(home).toContain("jornada de campo");
    expect(home).toContain("enviar pendientes y actualizar");
    expect(home).toContain("por ejecutar");
    expect(home).toContain("desktop-sync-activity-panel");
    expect(home).toContain("no hay operaciones pendientes.");
    expect(home).toContain("actividad reciente");
    expect(home).not.toContain("trabajo de hoy");
    expect(home).not.toContain("tu jornada");
    expect(home).not.toContain("primero resuelve la orden actual");
    expect(home).toContain("abrir orden");
    expect(home).toContain("mapa");
    expect(home).toContain("marcar incidencia");

    store.setTab("orders");
    expect(html(store)).toContain("ord-24017");
    store.selectOrder("ORD-24017");
    const generated = html(store);
    expect(generated).toContain("detalle de ord-24017");
    expect(generated).toContain("preparar corte");
    expect(generated).not.toContain("preparar reconexión");

    store.selectOrder("ORD-24019");
    const executed = html(store);
    expect(executed).toContain("preparar reconexión");
    expect(executed).not.toContain("preparar corte");
    expect(executed).not.toContain("registrar visita");
  });

  it("renders home first with dedicated mobile navigation and compact secondary cards", async () => {
    const store = await readyStore("ui-home-navigation");
    const markup = html(store);

    expect(store.getSnapshot().tab).toBe("home");
    expect(markup).toContain("current-order-card");
    expect(markup).toContain("operational-summary");
    expect(markup).toContain("current-order-card__map");
    expect(markup).toContain("current-order-card__map-action");
    expect(markup).toContain("desktop-navigation");
    expect(markup).toContain("navegación principal de escritorio");
    expect(markup).toContain("bottom-navigation");
    expect(markup).toContain("inicio");
    expect(markup).toContain("mis órdenes");
    expect(markup).toContain("mapa");
    expect(markup).toContain("pendientes");
    expect(markup).toContain("no hay operaciones pendientes.");
    expect(markup).toContain("abrir orden");
    expect(markup).not.toContain("registrar corte</button>");
    expect((markup.match(/class="primary-action/g) ?? []).length).toBe(1);
    expect(markup).not.toContain("pendiente registrar corte");
    expect(markup).not.toContain("home-intro");
    expect(markup).not.toContain("next-order-card");
    expect(markup).not.toContain("sticky-actions");

    store.setTab("map");
    expect(html(store)).toContain("ruta de campo");
    expect(html(store)).toContain("descargar zona offline");
    store.setTab("orders");
    expect(html(store)).toContain("bandeja asignada");
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

  it("uses reusable notification with a quiet link to pending operations", async () => {
    const store = await readyStore("ui-notification");
    store.setMode("offline");
    await store.registerVisit("ORD-24017", { reason: "Visita local de verificación." });
    const markup = html(store);
    expect(markup).toContain("notification");
    expect(markup).toContain("ver operaciones pendientes");
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
    expect(markup.match(/por ejecutar/g)).toHaveLength(1);
    expect(markup).toContain("estado físico");
    expect(markup).not.toContain("preparar corte");
    expect(markup).not.toContain("preparar reconexión");
  });

  it("keeps payment scope out while exposing the desktop map", async () => {
    const store = await readyStore("ui-scope");
    const markup = html(store);
    expect(markup).not.toMatch(/pago/);
    expect(markup).toContain("current-order-card__map");
    expect(markup).toContain("field-map-container");
    expect(markup).not.toContain("datos de demostración");
    expect(markup).not.toContain("operaciones sincronizadas");
  });

  it("filters orders by customer name or meter with unified smart search", async () => {
    const store = await readyStore("ui-search");
    store.setTab("orders");
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
    store.setTab("orders");

    const firstPage = html(store);
    expect(firstPage).toContain("mostrando 1-5 de 7 órdenes");
    expect(firstPage).toContain('aria-label="filtrar órdenes"');
    expect(firstPage).toContain('aria-controls="order-filter-options"');
    expect(firstPage).toContain('aria-expanded="true"');
    expect(firstPage).toContain('id="order-filter-options"');
    expect(firstPage).toContain('role="group" aria-label="filtrar órdenes"');
    expect(firstPage).toContain('aria-pressed="true"');
    expect(firstPage).toContain("todas");
    expect(firstPage).toContain("por ejecutar");
    expect(firstPage).toContain("ejecutadas");
    expect(firstPage).toContain("anuladas");
    expect(firstPage).toContain("revisión");
    expect(firstPage).toContain("buscar por cuenta, medidor o cliente");
    expect(firstPage).toContain("cliente página 1");
    expect(firstPage).toContain("cliente página 5");
    expect(firstPage).not.toContain("cliente página 6");
    expect(firstPage).not.toContain("order-card__map-btn");

    store.setQuery("Cliente página 6");
    const filtered = html(store);
    expect(filtered).toContain("mostrando 1-1 de 1 órdenes");
    expect(filtered).toContain("cliente página 6");
    expect(filtered).not.toContain("cliente página 1");

    store.setQuery("");
    const reset = html(store);
    expect(reset).toContain("cliente página 1");
    expect(reset).toContain("cliente página 5");
    expect(reset).not.toContain("cliente página 6");
  });

  it("keeps offline and pending sync state visible in the journey without disabling order access", async () => {
    const store = await readyStore("ui-offline-journey");
    store.setMode("offline");
    await store.registerVisit("ORD-24017", { reason: "Visita local de verificación." });
    store.setTab("home");
    const markup = html(store);
    expect(markup).toContain("sin conexión");
    expect(markup).toContain("operaciones pendientes");
    expect(markup).toContain("abrir orden");
    expect(markup).not.toContain("disabled=\"\">abrir orden");
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

  it("shows five real review facts together with eligible field actions", async () => {
    const store = await readyStore("ui-order-review-facts");
    store.selectOrder("ORD-24017");
    const markup = html(store);

    expect(markup).toContain("revisión de orden");
    expect(markup).toContain("maría flores");
    expect(markup).toContain("cuenta cta-1001 · medidor med-1001");
    expect(markup).toContain("villa esperanza, dirección simulada");
    expect(markup).toContain("bs 240.50");
    expect(markup).toContain("por ejecutar");
    expect(markup).toContain("registrar corte");
    expect(markup).toContain("registrar visita");
    const reviewView = markup.slice(markup.indexOf('aria-label="revisión de orden"'), markup.indexOf('class="order-detail-legacy"'));
    expect(reviewView.match(/por ejecutar/g)).toHaveLength(1);
  });

  it("labels reconnection as reconnection in field order status", async () => {
    const store = await readyStore("ui-order-review-reconnection-label");
    const reconnection = store.getSnapshot().orders.find((order) => order.status === "RECONEXIÓN");

    expect(reconnection).toBeDefined();
    expect(fieldOrderStatusLabel(reconnection!)).toBe("Reconectada");
  });

  it("paginates all eight secondary data fields four at a time, including long values", () => {
    const longValue = "Referencia de campo extensa ".repeat(12).trim();
    const fields = Array.from({ length: 8 }, (_, index) => ({ label: `Campo ${index + 1}`, value: index === 0 ? longValue : `Valor ${index + 1}` }));
    const pages = paginateReviewFields(fields);
    const longValueParts = pages.flat().filter((field) => field.label.startsWith("Campo 1 · parte"));

    expect(pages.map((page) => page.length)).toEqual([1, 1, 1, 4, 3]);
    expect(longValueParts.map((field) => field.value).join("")).toBe(longValue);
    expect(pages.flat().filter((field) => !field.label.startsWith("Campo 1 · parte"))).toEqual(fields.slice(1));
  });

  it("splits long activity exceptions into readable pages without losing wording", async () => {
    const reason = "No fue posible confirmar la referencia en campo. ".repeat(9).trim();
    const store = await readyStore("ui-order-review-long-activity");
    await store.registerVisit("ORD-24017", { reason });
    const entries = store.getSnapshot().activity.filter((entry) => entry.record.orderId === "ORD-24017");
    const entry = entries[0];
    expect(entry).toBeDefined();
    const pages = orderActivityReviewPages([{ ...entry!, record: { ...entry!.record, exceptionReason: reason } }]);
    const renderedText = pages.map((page) => page.text).join("");

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.text.length <= 120)).toBe(true);
    expect(pages.some((page) => page.title.startsWith("Excepción · parte"))).toBe(true);
    expect(renderedText).toContain(reason);
  });

  it("marks missing review facts unavailable and never substitutes zero debt", async () => {
    const seedPackage = createDemoPackage("2026-09-12T10:00:00.000Z");
    const missingDataPackage: WorkPackage = {
      ...seedPackage,
      orders: seedPackage.orders.map((order) => order.orderId === "ORD-24017" ? {
        ...order,
        accountId: "",
        context: order.context ? ({
          ...order.context,
          customerName: "",
          accountId: "",
          meterId: "",
          address: "",
          debtCents: undefined,
          monthsPending: undefined,
        } as unknown as NonNullable<WorkOrder["context"]>) : undefined,
      } : order),
    };
    const store = await readyStore("ui-order-review-missing", missingDataPackage);
    store.selectOrder("ORD-24017");
    const markup = html(store);

    expect(markup).toContain("dato no disponible");
    expect(markup).not.toContain("bs 0.00");
  });

  it("keeps review state prominent and only exposes eligible primary actions", async () => {
    const store = await readyStore("ui-order-review-eligibility");
    store.selectOrder("ORD-24017");
    expect(html(store)).toContain("registrar corte");

    store.selectOrder("ORD-24019");
    const completed = html(store);
    expect(completed).toContain("preparar reconexión");
    expect(completed).not.toContain("registrar corte");

    const seedPackage = createDemoPackage("2026-09-12T10:00:00.000Z");
    const reviewPackage: WorkPackage = {
      ...seedPackage,
      orders: seedPackage.orders.map((order) => order.orderId === "ORD-24017" ? { ...order, physicalStatus: "PHYSICAL_UNKNOWN" } : order),
    };
    const reviewStore = await readyStore("ui-order-review-unknown", reviewPackage);
    reviewStore.selectOrder("ORD-24017");
    const review = html(reviewStore);
    expect(review).toContain("no repetir acción");
    expect(review).toContain("revisión humana requerida");
    expect(review).not.toContain("registrar corte");
    expect(review).not.toContain("registrar visita");

    const cancelledPackage: WorkPackage = {
      ...seedPackage,
      orders: seedPackage.orders.map((order) => order.orderId === "ORD-24017" ? { ...order, status: "ANULADO" } : order),
    };
    const cancelledStore = await readyStore("ui-order-review-cancelled", cancelledPackage);
    cancelledStore.selectOrder("ORD-24017");
    const cancelled = html(cancelledStore);
    expect(cancelled).toContain("corte bloqueado");
    expect(cancelled).toContain("no registrar corte ni visita");
    expect(cancelled).not.toContain('class="primary-action"');
  });

  it("keeps offline state and separate detail, map, and activity views reachable", async () => {
    const store = await readyStore("ui-order-review-secondary-views");
    store.setMode("offline");
    store.selectOrder("ORD-24017");
    const markup = html(store);

    expect(markup).toContain("sin conexión");
    expect(markup).toContain('aria-label="vistas de la orden"');
    expect(markup).toContain('aria-pressed="true">resumen</button>');
    expect(markup).toContain('aria-pressed="false">datos</button>');
    expect(markup).toContain('aria-pressed="false">mapa</button>');
    expect(markup).not.toContain('aria-pressed="false">actividad');
  });

  it("keeps order activity reachable when records exist", async () => {
    const store = await readyStore("ui-order-review-activity");
    await store.registerVisit("ORD-24017", { reason: "Visita local de verificación." });
    store.selectOrder("ORD-24017");

    expect(html(store)).toContain('aria-pressed="false">actividad 1</button>');
  });

  it("shows explicit missing-location state and never substitutes another order", () => {
    const seedPackage = createDemoPackage("2026-09-12T10:00:00.000Z");
    const selectedOrder = seedPackage.orders.find((order) => order.orderId === "ORD-24017")!;
    const selectedWithoutCoordinates = {
      ...selectedOrder,
      context: { ...selectedOrder.context!, cadastralLatitude: undefined, cadastralLongitude: undefined },
    };
    const markup = renderToStaticMarkup(
      <OrderReviewMap order={selectedWithoutCoordinates} mode="offline" onViewChange={() => undefined} />,
    ).toLocaleLowerCase();

    expect(markup).toContain("ubicación de esta orden no disponible");
    expect(markup).not.toContain("field-map-canvas");
    expect(markup).not.toContain("suministros con ubicación");
    expect(markup).not.toContain("-19.589366");
  });

  it("maps only selected order when its cadastral coordinates exist", () => {
    const seedPackage = createDemoPackage("2026-09-12T10:00:00.000Z");
    const selectedOrder = seedPackage.orders.find((order) => order.orderId === "ORD-24017")!;
    const markup = renderToStaticMarkup(
      <OrderReviewMap order={selectedOrder} mode="offline" onViewChange={() => undefined} />,
    ).toLocaleLowerCase();

    expect(markup).toContain("field-map-canvas");
    expect(markup).toContain("<strong>1</strong> suministros con ubicación");
    expect(markup).toContain("mapa interactivo de la ruta");
  });
});
