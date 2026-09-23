import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndexedDbLocalRepository, deleteFieldDatabase } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockEnablementAdapter, MockSyncTransport } from "../adapters/mock";
import { createAppStore, createDemoPackage, DEMO_DEVICE_ID, DEMO_TECHNICIAN_ID, type AppStore } from "../app/index";
import type { WorkOrder, WorkPackage } from "../domain";
import type { SyncItem } from "../ports";
import { adjacentJourneyOrder, captureDraftCanAdvance, captureSubmitError, captureWizardSteps, CompactNetworkStatus, EvidencePicker, FieldApp, fieldOrderStatusLabel, loadCaptureDraftSafely, orderActivityReviewPages, OrderReviewMap, orderJourneyOrders, paginateReviewFields, QueuePanel, queuePageItem, queueReviewMessage, restoreEvidenceFile, sortOrdersForNext, syncThenRefreshAssigned } from "./FieldApp";

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

describe("capture wizard QA recovery", () => {
  it("keeps advancement blocked after draft load failure until retry succeeds", async () => {
    let attempts = 0;
    const load = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("IndexedDB transaction failed");
      return { reading: { value: 42 } };
    };

    const failed = await loadCaptureDraftSafely(load);
    expect(failed.status).toBe("error");
    expect(captureDraftCanAdvance(failed.status)).toBe(false);

    const retried = await loadCaptureDraftSafely(load);
    expect(retried.status).toBe("ready");
    expect(captureDraftCanAdvance(retried.status)).toBe(true);
    if (retried.status === "ready") expect(retried.content.reading?.value).toBe(42);
  });

  it("keeps cut reading separate from reachable cut settings", () => {
    expect(captureWizardSteps("CUT", false, false)).toEqual(["reading", "cutSettings", "gps", "evidence", "review"]);
    expect(captureWizardSteps("CUT", true, true)).toEqual(["reading", "cutSettings", "gps", "gpsException", "evidence", "evidenceException", "review"]);
  });

  it("replaces technical submit errors with actionable Spanish while preserving uncertain-write warning", () => {
    const generic = captureSubmitError(new Error("QuotaExceededError: transaction aborted"));
    expect(generic.message).toBe("No pudimos guardar la operación. Revisa el estado de la orden y las operaciones pendientes antes de reintentar.");
    expect(generic.message).not.toContain("QuotaExceededError");
    expect(generic.verificationUncertain).toBe(false);

    const uncertain = captureSubmitError(new Error("No pudimos verificar el guardado local"));
    expect(uncertain.message).toContain("No pudimos confirmar si la operación quedó guardada");
    expect(uncertain.message).toContain("Revisa las operaciones pendientes");
    expect(uncertain.verificationUncertain).toBe(true);
  });

  it("renders accessible Spanish photo picker and restored evidence filename", () => {
    const file = new File(["foto"], "medidor.jpg", { type: "image/jpeg" });
    const markup = renderToStaticMarkup(<EvidencePicker file={file} onSelect={() => undefined} onInvalid={() => undefined} />).toLocaleLowerCase();
    expect(markup).toContain('aria-label="elegir foto de evidencia"');
    expect(markup).toContain(">elegir foto</button>");
    expect(markup).toContain('accept="image/jpeg,image/png,.jpg,.jpeg,.png"');
    expect(markup).toContain("medidor.jpg");
  });
});

function html(store: AppStore): string {
  return renderToStaticMarkup(<FieldApp store={store} />).toLocaleLowerCase();
}

describe("FieldApp SSR shell", () => {
  it("labels online device connectivity as available network", async () => {
    const store = await readyStore("ui-online-connectivity-label");
    const markup = html(store);
    expect(markup).toContain("red disponible");
    expect(markup).not.toContain("conectada");
  });

  it("restores a real File evidence draft after repository reopen", async () => {
    const name = "ui-file-draft-reopen";
    databaseNames.push(name);
    const first = new IndexedDbLocalRepository({ dbName: name, technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
    repositories.push(first);
    const packageData = createDemoPackage("2026-09-12T10:00:00.000Z");
    await first.savePackage(packageData);
    const selected = new File(["field camera bytes"], "medidor.jpg", { type: "image/jpeg" });
    await first.saveCaptureDraft({ technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID, orderId: "ORD-24017", action: "CUT", updatedAt: "2026-09-12T10:01:00.000Z", content: { reading: { value: 41 }, evidence: [selected] } });
    await first.close();
    repositories.splice(repositories.indexOf(first), 1);
    const reopened = new IndexedDbLocalRepository({ dbName: name, technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
    repositories.push(reopened);
    const restored = await reopened.getCaptureDraft({ technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID, orderId: "ORD-24017", action: "CUT" });
    expect(restored?.content.reading?.value).toBe(41);
    const savedEvidence = restored?.content.evidence?.[0];
    expect(savedEvidence).toBeInstanceOf(Blob);
    const file = restoreEvidenceFile(savedEvidence!);
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/jpeg");
    expect(await file.text()).toBe("field camera bytes");
    expect(file.name).toMatch(/medidor\.jpg|evidencia-recuperada\.jpg/);
  });
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
    const map = html(store);
    expect(map).toContain("ruta de campo");
    expect(map).toContain("descargar zona offline");
    expect(map).toContain("mi ubicación");
    expect(map).toContain("zona de órdenes");
    expect(map).toContain("expandir mapa a pantalla completa");
    expect(map).toContain("red disponible");
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

  it("pages through every queue state one operation at a time without mutating queue", async () => {
    const store = await readyStore("ui-queue-pages");
    const items: SyncItem[] = [
      { operationId: "pending-operation-full-identifier-001", orderId: "ORD-24017", action: "VISIT", status: "pending", attempts: 0, updatedAt: "2026-09-12T10:00:00.000Z" },
      { operationId: "syncing-002", orderId: "ORD-24017", action: "VISIT", status: "syncing", attempts: 1, updatedAt: "2026-09-12T10:01:00.000Z" },
      { operationId: "failed-003", orderId: "ORD-24017", action: "VISIT", status: "failed", attempts: 2, errorCode: "NETWORK_UNAVAILABLE", updatedAt: "2026-09-12T10:02:00.000Z" },
      { operationId: "synced-004", orderId: "ORD-24017", action: "VISIT", status: "synced", attempts: 1, updatedAt: "2026-09-12T10:03:00.000Z" },
    ];
    const original = items.map((item) => ({ ...item }));
    const visited = Array.from({ length: items.length }, (_, index) => queuePageItem(items, index + 1).item?.operationId);

    expect(visited).toEqual(items.map((item) => item.operationId));
    expect(queuePageItem(items, 0).page).toBe(1);
    expect(queuePageItem(items, 99).page).toBe(4);
    expect(queuePageItem([], 1)).toMatchObject({ page: 1, pageCount: 1, item: undefined });
    expect(items).toEqual(original);

    const markup = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), syncItems: items }} store={store} />).toLocaleLowerCase();
    const mobile = markup.split('class="queue-list queue-list--mobile"')[1]?.split('class="queue-pagination"')[0] ?? "";
    expect(mobile.match(/class="queue-item"/g)).toHaveLength(1);
    expect(mobile).toContain('title="pending-operation-full-identifier-001"');
    expect(mobile).toContain("operación pending-o…-001");
    expect(mobile).toContain('title="maría flores · ord-24017"');
    expect(mobile).not.toContain("syncing-002");
    expect(markup).toContain('aria-label="paginación de cola"');
    expect(markup).toContain("operación 1 de 4");
    expect(markup).toContain("0 intento(s)");
    expect(mobile).toMatch(/12\/9\/\d{2,4}/);
    expect(markup).toContain("pendiente");
    expect(markup).toContain("sincronizando");
    expect(markup).toContain("falló");
    expect(markup).toContain("sincronizado");
    const syncingCard = markup.split('<article class="queue-item">').find((part) => part.includes("syncing-002")) ?? "";
    expect(syncingCard).not.toContain(">reintentar</button>");
    expect(items).toEqual(original);
  });

  it("shows review and errors, and withholds retry for uncertain or reviewed operations", async () => {
    const store = await readyStore("ui-queue-review-guards");
    const items: SyncItem[] = [
      { operationId: "safe-001", orderId: "ORD-24017", action: "VISIT", status: "failed", attempts: 2, errorCode: "NETWORK_UNAVAILABLE" },
      { operationId: "review-002", orderId: "ORD-24017", action: "CUT", status: "failed", attempts: 1, manualReview: true, errorCode: "REMOTE_CONFLICT" },
      { operationId: "uncertain-003", orderId: "ORD-24017", action: "CUT", status: "failed", attempts: 1, uncertain: true },
      { operationId: "done-004", orderId: "ORD-24017", action: "VISIT", status: "synced", attempts: 1 },
    ];
    const markup = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), syncItems: items }} store={store} />).toLocaleLowerCase();
    const cards = markup.split('<article class="queue-item">').slice(1).map((part) => part.split("</article>")[0]);
    const cardsFor = (id: string) => cards.filter((card) => card.includes(id));

    expect(cardsFor("safe-001")).toHaveLength(2);
    expect(cardsFor("safe-001").every((card) => card.includes(">reintentar</button>"))).toBe(true);
    for (const id of ["review-002", "uncertain-003", "done-004"]) {
      expect(cardsFor(id)).toHaveLength(1);
      expect(cardsFor(id)[0]).not.toContain(">reintentar</button>");
    }
    expect(cardsFor("review-002")[0]).toContain("revisión humana · no reenviar");
    expect(cardsFor("review-002")[0]).toContain("remote_conflict");
    expect(cardsFor("review-002")[0]).not.toContain(">ver error y contexto</button>");
    expect(cardsFor("review-002")[0]).toContain(">ver detalle</button>");
    const reviewOnlyMarkup = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), syncItems: [items[1]] }} store={store} />).toLocaleLowerCase();
    const reviewMobile = reviewOnlyMarkup.split('class="queue-list queue-list--mobile"')[1]?.split('class="queue-pagination"')[0] ?? "";
    expect(reviewMobile).toContain("revisión humana · no reenviar");
    expect(reviewMobile).toContain("error: remote_conflict");
    expect(reviewMobile).not.toContain(">reintentar</button>");
    expect(reviewMobile).toContain(">ver error y contexto</button>");
    expect(reviewMobile).toContain(">ver detalle</button>");
    expect(cardsFor("uncertain-003")[0]).toContain("resultado incierto");
    expect(markup).toContain("enviar operaciones pendientes");

    const offline = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), mode: "offline", syncItems: items }} store={store} />).toLocaleLowerCase();
    expect(offline).toContain("sin conexión");
    expect(offline).not.toContain("conectada");
    expect(offline).toContain('class="queue-item__retry" disabled=""');
  });

  it("offers state verification for uncertain-only failure, but withholds sync actions for manual review", async () => {
    const store = await readyStore("ui-queue-only-review");
    const uncertain: SyncItem = { operationId: "uncertain-full-id-100", orderId: "ORD-24017", action: "CUT", status: "failed", attempts: 3, uncertain: true, errorCode: "REMOTE_RESULT_UNKNOWN_LONG_DETAIL" };
    const reviewed: SyncItem = { operationId: "review-full-id-200", orderId: "ORD-24017", action: "VISIT", status: "failed", attempts: 2, manualReview: true, errorCode: "CONFLICT_REQUIRES_OPERATOR_REVIEW" };
    const uncertainMarkup = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), syncItems: [uncertain] }} store={store} />).toLocaleLowerCase();
    const uncertainMobile = uncertainMarkup.split('class="queue-list queue-list--mobile"')[1]?.split('class="queue-pagination"')[0] ?? "";

    expect(uncertainMarkup).not.toContain("enviar operaciones pendientes");
    expect(uncertainMobile).toContain('title="uncertain-full-id-100"');
    expect(uncertainMobile).toContain(">verificar estado</button>");
    expect(uncertainMobile).not.toContain(">reintentar</button>");
    expect(uncertainMobile).toContain("resultado incierto");
    expect(uncertainMobile).toContain("podría continuar sincronización según el motor");
    expect(uncertainMobile).toContain(">ver error y contexto</button>");
    expect(uncertainMarkup).toContain("remote_result_unknown_long_detail");
    expect(uncertain.operationId).toBe("uncertain-full-id-100");

    const reviewedMarkup = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), syncItems: [reviewed] }} store={store} />).toLocaleLowerCase();
    const reviewedDesktop = reviewedMarkup.split('class="queue-list queue-list--desktop"')[1]?.split('class="queue-list queue-list--mobile"')[0] ?? "";
    const reviewedMobile = reviewedMarkup.split('class="queue-list queue-list--mobile"')[1]?.split('class="queue-pagination"')[0] ?? "";
    expect(reviewedMarkup).not.toContain("enviar operaciones pendientes");
    expect(reviewedDesktop).not.toContain(">ver error y contexto</button>");
    expect(reviewedDesktop).toContain("conflict_requires_operator_review");
    expect(reviewedDesktop).toContain("revisión humana · no reenviar");
    expect(reviewedDesktop).toContain(">ver detalle</button>");
    expect(reviewedMobile).not.toContain(">verificar estado</button>");
    expect(reviewedMobile).not.toContain(">reintentar</button>");
    expect(reviewedMobile).toContain(">ver error y contexto</button>");
    expect(reviewedMobile).toContain("revisión humana · no reenviar");
    expect(reviewedMarkup).toContain("conflict_requires_operator_review");

    const unavailable = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), mode: "offline", syncItems: [uncertain] }} store={store} />).toLocaleLowerCase();
    expect(unavailable).toContain('class="queue-item__verify" disabled=""');
    const busy = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), busyAction: "SYNC", syncItems: [uncertain] }} store={store} />).toLocaleLowerCase();
    expect(busy).toContain('class="queue-item__verify" disabled=""');
  });

  it("lets manual review override uncertainty messaging and verification", async () => {
    const store = await readyStore("ui-queue-uncertain-manual-review");
    const item: SyncItem = { operationId: "uncertain-reviewed-001", orderId: "ORD-24017", action: "CUT", status: "failed", attempts: 2, uncertain: true, manualReview: true };
    const markup = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), syncItems: [item] }} store={store} />).toLocaleLowerCase();
    const mobile = markup.split('class="queue-list queue-list--mobile"')[1]?.split('class="queue-pagination"')[0] ?? "";

    expect(queueReviewMessage(item)).toBe("Revisión humana · no reenviar");
    expect(markup.match(/revisión humana · no reenviar/g)).toHaveLength(2);
    expect(markup).not.toContain("verificar estado podría continuar");
    expect(mobile).not.toContain(">verificar estado</button>");
    expect(mobile).not.toContain(">reintentar</button>");
    expect(mobile).toContain(">ver error y contexto</button>");
    expect(mobile).toContain(">ver detalle</button>");
  });

  it("labels online, weak, and offline connectivity separately", () => {
    const status = (mode: "online" | "weak" | "offline") => renderToStaticMarkup(<CompactNetworkStatus mode={mode} />).toLocaleLowerCase();
    expect(status("online")).toContain('compact-network-status--online');
    expect(status("online")).toContain("red disponible");
    expect(status("weak")).toContain('compact-network-status--weak');
    expect(status("weak")).toContain('network-dot network-dot--weak');
    expect(status("weak")).toContain("señal débil");
    expect(status("offline")).toContain('compact-network-status--offline');
    expect(status("offline")).toContain("sin conexión");
  });

  it("keeps global send for safe retryable operations", async () => {
    const store = await readyStore("ui-queue-safe-send");
    const items: SyncItem[] = [
      { operationId: "safe-retry-001", orderId: "ORD-24017", action: "VISIT", status: "failed", attempts: 1, errorCode: "NETWORK_UNAVAILABLE" },
      { operationId: "uncertain-002", orderId: "ORD-24017", action: "CUT", status: "failed", attempts: 1, uncertain: true },
    ];
    const markup = renderToStaticMarkup(<QueuePanel state={{ ...store.getSnapshot(), syncItems: items }} store={store} />).toLocaleLowerCase();
    expect(markup).toContain(">enviar operaciones pendientes</button>");
    expect(markup).toContain(">reintentar</button>");
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
