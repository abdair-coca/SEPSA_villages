import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createAppStore, createDemoPackage, createUnavailableAppStore, selectVisibleOrders, DEMO_DEVICE_ID, DEMO_TECHNICIAN_ID, prepareDemoExternalValidation } from "./index";
import { IndexedDbLocalRepository, deleteFieldDatabase } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockEnablementAdapter, MockSyncTransport } from "../adapters/mock";
import type { AppStore } from "./index";
import { FieldApp } from "../ui";

const repositories: IndexedDbLocalRepository[] = [];
const databaseNames: string[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const databaseName of databaseNames.splice(0)) await deleteFieldDatabase(databaseName);
});

function setup(name: string, configureDemoGrants = false): { store: AppStore; repository: IndexedDbLocalRepository; connectivity: MockConnectivity; transport: MockSyncTransport } {
  databaseNames.push(name);
  const repository = new IndexedDbLocalRepository({ dbName: name, technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
  repositories.push(repository);
  const connectivity = new MockConnectivity("online");
  const authorization = new MockAuthorizationAdapter({ mode: "online" });
  const enablement = new MockEnablementAdapter({ mode: "online" });
  const transport = new MockSyncTransport({ mode: "online" });
  const prepareExternalValidation = configureDemoGrants
    ? (action: "CUT" | "RECONNECTION", order: Parameters<typeof prepareDemoExternalValidation>[1], operationId: string, now: string) => prepareDemoExternalValidation(action, order, operationId, now, { authorization, enablement })
    : undefined;
  const store = createAppStore({ repository, authorization, enablement, connectivity, transport, seedPackage: createDemoPackage("2026-09-12T10:00:00.000Z"), prepareExternalValidation });
  return { store, repository, connectivity, transport };
}

describe("field app store", () => {
  it("initializes from IndexedDB and derives visible orders from persisted package", async () => {
    const { store } = setup("store-init");
    await store.init();
    expect(store.getSnapshot()).toMatchObject({ status: "ready", package: { version: 1 } });
    expect(store.getSnapshot().orders.map((order) => order.orderId)).toContain("ORD-24017");
    store.setQuery("24019");
    expect(selectVisibleOrders(store.getSnapshot()).map((order) => order.orderId)).toEqual(["ORD-24019"]);
  });

  it("records offline visit atomically and preserves it after a new store initializes", async () => {
    const first = setup("store-restart");
    await first.store.init();
    first.store.setMode("offline");
    await first.store.registerVisit("ORD-24017", { exceptionReason: "No fue posible adjuntar evidencia en campo." });
    expect(first.store.getSnapshot().syncItems).toMatchObject([{ action: "VISIT", status: "pending", attempts: 1 }]);
    await first.repository.close();
    repositories.splice(repositories.indexOf(first.repository), 1);
    const reopened = new IndexedDbLocalRepository({ dbName: "store-restart", technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
    repositories.push(reopened);
    const connectivity = new MockConnectivity("offline");
    const store = createAppStore({ repository: reopened, authorization: new MockAuthorizationAdapter({ mode: "offline" }), enablement: new MockEnablementAdapter({ mode: "offline" }), connectivity, transport: new MockSyncTransport({ mode: "offline" }) });
    await store.init();
    expect(store.getSnapshot()).toMatchObject({ status: "ready", syncItems: [{ action: "VISIT", status: "pending" }] });
  });

  it("auto-syncs pending work once when connectivity recovers from offline", async () => {
    const { store } = setup("store-auto-sync");
    await store.init();
    store.setMode("offline");
    await store.registerVisit("ORD-24017", { reason: "Visita sin validación externa." });
    store.setMode("online");
    await vi.waitFor(() => expect(store.getSnapshot().syncItems[0]).toMatchObject({ action: "VISIT", status: "synced" }));
    expect(store.getSnapshot().syncItems).toHaveLength(1);
  });

  it("shares one in-flight auto/manual sync and preserves queue on sync failure", async () => {
    const { store, transport } = setup("store-auto-sync-lock");
    await store.init();
    store.setMode("offline");
    await store.registerVisit("ORD-24017", { reason: "Visita pendiente de red." });
    let sends = 0;
    const send = transport.send.bind(transport);
    transport.send = async (payload) => {
      sends += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return send(payload);
    };
    store.setMode("online");
    await Promise.all([store.sync(), store.sync()]);
    expect(sends).toBe(1);
    expect(store.getSnapshot().syncItems[0]).toMatchObject({ status: "synced" });

    store.setMode("offline");
    await store.registerVisit("ORD-24017", { reason: "Otra visita pendiente." });
    transport.send = async () => { throw new Error("Servicio temporalmente no disponible."); };
    store.setMode("online");
    await vi.waitFor(() => expect(store.getSnapshot().syncItems.some((item) => item.status === "failed")).toBe(true));
    expect(store.getSnapshot().message?.text).toMatch(/ninguna fue eliminada|cola sigue guardada/i);
  });

  it("confirms visit without evidence or exception and keeps it pending", async () => {
    const { store } = setup("store-visit-without-evidence");
    await store.init();
    await store.registerVisit("ORD-24017");
    expect(store.getSnapshot().activity).toMatchObject([{ record: { kind: "VISIT", execution: "NONE", syncStatus: "pending" }, evidence: [] }]);
  });

  it("rejects blank visit reason at the use-case boundary and persists trimmed reason", async () => {
    const { store, repository } = setup("store-visit-reason");
    await store.init();
    await expect(store.registerVisit("ORD-24017", { reason: "   " })).rejects.toMatchObject({ code: "VISIT_REASON_REQUIRED" });
    await store.registerVisit("ORD-24017", { reason: "  Visita sin ejecución confirmada  " });
    const item = store.getSnapshot().syncItems[0];
    const record = await repository.getRecord(item.operationId);
    expect(record && "reason" in record ? record.reason : undefined).toBe("Visita sin ejecución confirmada");
  });

  it("blocks cut while offline and records visit instead of physical execution", async () => {
    const { store } = setup("store-offline-cut");
    await store.init();
    store.setMode("offline");
    await store.executeCut("ORD-24017", { exceptionReason: "Señal insuficiente para validación externa." });
    expect(store.getSnapshot().orders.find((order) => order.orderId === "ORD-24017")).toMatchObject({ status: "GENERADO", physicalStatus: "NONE" });
    expect(store.getSnapshot().syncItems).toMatchObject([{ action: "VISIT", status: "pending" }]);
    expect(store.getSnapshot().message?.text).toMatch(/bloqueado por validación externa/i);
  });

  it("configures five-minute demo grant before an online cut use case", async () => {
    const { store } = setup("store-online-cut", true);
    await store.init();
    await store.executeCut("ORD-24017", { exceptionReason: "Referencia de demostración." });
    expect(store.getSnapshot().orders.find((order) => order.orderId === "ORD-24017")).toMatchObject({ status: "EJECUTADO", physicalStatus: "CONFIRMED" });
  });

  it("persists binary evidence and hash across close and reopen, while activity exposes metadata only", async () => {
    const first = setup("store-evidence-restart", true);
    await first.store.init();
    const content = new Blob(["durable evidence"], { type: "image/jpeg" });
    const digest = await crypto.subtle.digest("SHA-256", await content.arrayBuffer());
    const contentHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await first.store.executeCut("ORD-24017", { evidence: { evidenceId: "evidence-store-restart", mimeType: "image/jpeg", width: 100, height: 100, optimized: true, content, contentHash } });
    const item = first.store.getSnapshot().syncItems.find((candidate) => candidate.action === "CUT");
    if (!item) throw new Error("Expected persisted cut queue item.");
    const record = await first.repository.getRecord(item.operationId);
    if (!record) throw new Error("Expected persisted cut record.");
    const evidenceId = record.evidenceRefs[0];
    const beforeClose = await first.repository.getEvidence(evidenceId);
    expect(beforeClose?.content).toBeInstanceOf(Blob);
    expect(beforeClose?.contentHash).toBe(contentHash);
    expect(first.store.getSnapshot().activity.find((entry) => entry.record.operationId === item.operationId)?.evidence[0]).toMatchObject({ contentHash });
    expect(first.store.getSnapshot().activity.find((entry) => entry.record.operationId === item.operationId)?.evidence[0].content).toBeUndefined();
    await first.repository.close();
    repositories.splice(repositories.indexOf(first.repository), 1);
    const reopened = new IndexedDbLocalRepository({ dbName: "store-evidence-restart", technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
    repositories.push(reopened);
    const afterClose = await reopened.getEvidence(evidenceId);
    expect(afterClose?.content).toBeInstanceOf(Blob);
    expect(await afterClose?.content?.text()).toBe("durable evidence");
    expect(afterClose?.contentHash).toBe(contentHash);
  });

  it("accepts a File, hashes its original Blob, and persists it", async () => {
    const { store, repository } = setup("store-file-evidence", true);
    await store.init();
    vi.stubGlobal("createImageBitmap", async () => ({ width: 100, height: 100, close: () => undefined }));
    try {
      await store.executeCut("ORD-24017", { file: new File(["file evidence"], "field.jpg", { type: "image/jpeg" }) });
    } finally {
      vi.unstubAllGlobals();
    }
    const item = store.getSnapshot().syncItems.find((candidate) => candidate.action === "CUT");
    if (!item) throw new Error("Expected file-backed cut queue item.");
    const record = await repository.getRecord(item.operationId);
    if (!record) throw new Error("Expected file-backed cut record.");
    const evidence = await repository.getEvidence(record.evidenceRefs[0]);
    expect(evidence?.content).toBeInstanceOf(Blob);
    expect(await evidence?.content?.text()).toBe("file evidence");
    expect(evidence?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("allows reconnection only for EJECUTADO and exposes queue state after sync", async () => {
    const { store } = setup("store-reconnection");
    await store.init();
    await expect(store.executeReconnection("ORD-24017", { exceptionReason: "Requiere revisión de orden." })).rejects.toThrow();
    expect(store.getSnapshot().syncItems).toEqual([]);
    store.setMode("offline");
    await store.registerVisit("ORD-24019", { exceptionReason: "Visita registrada antes de reconexión." });
    store.setMode("online");
    await store.sync();
    expect(store.getSnapshot().syncItems).toMatchObject([{ status: "synced", action: "VISIT" }]);
  });

  it("renders mobile shell without out-of-scope payment, meter, or location terms", () => {
    const markup = renderToStaticMarkup(<FieldApp store={createUnavailableAppStore()} />).toLocaleLowerCase();
    expect(markup).not.toMatch(/pago|lectura|gps/);
    expect(markup).toContain("simulación, sin conexión a sepsa");
    expect(markup).toContain("indexeddb no está disponible");
  });
});
