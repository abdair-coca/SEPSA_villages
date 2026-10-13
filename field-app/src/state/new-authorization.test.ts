import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createAppStore, DEMO_DEVICE_ID, DEMO_TECHNICIAN_ID } from "./store";
import { createDemoPackage, prepareDemoExternalValidation } from "../bootstrap/runtime";
import { IndexedDbLocalRepository } from "../adapters/indexeddb/repository";
import { deleteFieldDatabase } from "../adapters/indexeddb/database";
import { MockAuthorizationAdapter, MockEnablementAdapter } from "../adapters/mock/authorization";
import { MockConnectivity } from "../adapters/mock/connectivity";
import { MockSyncTransport } from "../adapters/mock/transport";
import type { CutAuthorizationLookupResult } from "../ports/authorization";
import type { OperationRecord } from "../domain/types";

const repositories: IndexedDbLocalRepository[] = [];
const databaseNames: string[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const databaseName of databaseNames.splice(0)) await deleteFieldDatabase(databaseName);
});

function setup(name: string, cutLookup: CutAuthorizationLookupResult["status"] = "expired") {
  databaseNames.push(name);
  const repository = new IndexedDbLocalRepository({ dbName: name, technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
  repositories.push(repository);
  const authorization = Object.assign(new MockAuthorizationAdapter({ mode: "online" }), {
    lookupCutAuthorization: async (operationId: string): Promise<CutAuthorizationLookupResult> => ({ status: cutLookup, operationId }),
  });
  const enablement = new MockEnablementAdapter({ mode: "online" });
  const store = createAppStore({
    repository, authorization, enablement, connectivity: new MockConnectivity("online"), transport: new MockSyncTransport({ mode: "online" }),
    seedPackage: createDemoPackage("2026-09-12T10:00:00.000Z"), technicianName: DEMO_TECHNICIAN_ID,
    prepareExternalValidation: (action, order, operationId, now) => prepareDemoExternalValidation(action, order, operationId, now, { authorization, enablement }, DEMO_TECHNICIAN_ID, DEMO_DEVICE_ID, DEMO_TECHNICIAN_ID),
  });
  return { store, repository, authorization, enablement };
}

/** Un 401 al consumir no se reintenta: deja la operación incierta sin esperas reales. */
function sessionExpiredOnce<T extends { consumeCut?: unknown; consumeReconnection?: unknown }>(adapter: T, method: "consumeCut" | "consumeReconnection"): void {
  const original = (adapter as unknown as Record<string, (request: { operationId: string }) => Promise<unknown>>)[method].bind(adapter);
  let calls = 0;
  (adapter as unknown as Record<string, unknown>)[method] = async (request: { operationId: string }) => (calls += 1) === 1 ? { operationId: request.operationId, status: "unknown", errorCode: "UNAUTHENTICATED" } : original(request);
}

async function photo() {
  const content = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
  const digest = await crypto.subtle.digest("SHA-256", await content.arrayBuffer());
  const contentHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { mimeType: "image/jpeg" as const, width: 100, height: 100, optimized: true, content, contentHash };
}

function fieldCapture() {
  return {
    reading: { value: 123.45, unit: "kWh" as const, meterId: "MED-1001", recordedAt: "2026-09-12T10:00:00.000Z", status: "CAPTURED" as const },
    location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: "2026-09-12T10:00:00.000Z", status: "CAPTURED" as const },
    cutType: "RED" as const,
    nearbyMeters: false,
  };
}

async function onlyOperation(repository: IndexedDbLocalRepository, kind: "CUT" | "RECONNECTION", excluding?: string): Promise<OperationRecord> {
  const items = await repository.listSyncItems();
  const item = items.find((candidate) => candidate.action === kind && candidate.operationId !== excluding);
  if (!item) throw new Error(`No ${kind} operation in the queue.`);
  return await repository.getRecord(item.operationId) as OperationRecord;
}

describe("new authorization after the server proves the previous one was not used (D022)", () => {
  it("closes an uncertain reconnection and repeats it with the same photo and delay, without recapture", async () => {
    const { store, repository, enablement } = setup("new-authorization-reconnection");
    await store.init();
    sessionExpiredOnce(enablement, "consumeReconnection");
    // El servidor informa la habilitación como vencida: la verificación automática tras guardar no la completa.
    enablement.lookupReconnection = async (operationId) => ({ status: "expired", operationId });
    await store.executeReconnection("ORD-24019", { evidence: await photo(), demora: "Demora por acceso" });
    const uncertain = await onlyOperation(repository, "RECONNECTION");
    expect(uncertain).toMatchObject({ status: "PHYSICAL_UNKNOWN", errorCode: "UNAUTHENTICATED" });

    await store.verifyReconnection(uncertain.operationId);
    await expect(repository.getRecord(uncertain.operationId)).resolves.toMatchObject({ lastAuthorizationLookup: { status: "expired" } });

    await store.retryWithNewAuthorization(uncertain.operationId);

    const closed = await repository.getRecord(uncertain.operationId) as OperationRecord;
    expect(closed).toMatchObject({ status: "BLOCKED", physicalStatus: "NONE", errorCode: "AUTHORIZATION_CLOSED_NOT_CONSUMED", authorizationToken: undefined });
    const uuid = uncertain.operationId.slice(-36);
    await expect(repository.getRecord(`closure-${uuid}`)).resolves.toMatchObject({ kind: "VISIT", attemptedAction: "RECONNECTION", reason: "AUTHORIZATION_CLOSED_NOT_CONSUMED" });
    const repeated = await onlyOperation(repository, "RECONNECTION", uncertain.operationId);
    expect(repeated).toMatchObject({ status: "CONFIRMED", physicalStatus: "CONFIRMED", demora: "Demora por acceso" });
    expect(repeated.evidenceRefs[0]).not.toBe(uncertain.evidenceRefs[0]);
    const [before, after] = await Promise.all([repository.getEvidence(uncertain.evidenceRefs[0]!), repository.getEvidence(repeated.evidenceRefs[0]!)]);
    expect(after).toMatchObject({ operationId: repeated.operationId, contentHash: before?.contentHash });
    expect(store.getSnapshot().orders.find((order) => order.orderId === "ORD-24019")).toMatchObject({ status: "RECONEXIÓN", physicalStatus: "CONFIRMED" });

    await store.retryWithNewAuthorization(uncertain.operationId);
    expect((await repository.listSyncItems()).filter((item) => item.action === "RECONNECTION")).toHaveLength(2);
  });

  it("closes an uncertain cut and repeats it with the same capture", async () => {
    const { store, repository, authorization } = setup("new-authorization-cut");
    await store.init();
    sessionExpiredOnce(authorization, "consumeCut");
    await store.executeCut("ORD-24017", { evidence: await photo(), fieldCapture: fieldCapture() });
    const uncertain = await onlyOperation(repository, "CUT");
    expect(uncertain).toMatchObject({ status: "PHYSICAL_UNKNOWN", authorizationConsumption: "immediate" });

    await store.sync();
    await expect(repository.getRecord(uncertain.operationId)).resolves.toMatchObject({ lastAuthorizationLookup: { status: "expired" } });

    await store.retryWithNewAuthorization(uncertain.operationId);

    await expect(repository.getRecord(uncertain.operationId)).resolves.toMatchObject({ status: "BLOCKED", errorCode: "AUTHORIZATION_CLOSED_NOT_CONSUMED" });
    const repeated = await onlyOperation(repository, "CUT", uncertain.operationId);
    expect(repeated).toMatchObject({ status: "CONFIRMED", fieldCapture: uncertain.fieldCapture });
    expect(store.getSnapshot().orders.find((order) => order.orderId === "ORD-24017")).toMatchObject({ status: "EJECUTADO", physicalStatus: "CONFIRMED" });
  });

  it("keeps the operation untouched when the server does not prove the authorization was unused", async () => {
    const { store, repository, authorization } = setup("new-authorization-not-proven", "reserved");
    await store.init();
    sessionExpiredOnce(authorization, "consumeCut");
    authorization.consumeError = Object.assign(new Error("lost"), { code: "RESPONSE_LOST" });
    await store.executeCut("ORD-24017", { evidence: await photo(), fieldCapture: fieldCapture() });
    const uncertain = await onlyOperation(repository, "CUT");
    authorization.consumeError = undefined;

    await store.retryWithNewAuthorization(uncertain.operationId);

    expect(store.getSnapshot().message?.text).toContain("no confirma");
    expect((await repository.listSyncItems()).filter((item) => item.action === "CUT")).toHaveLength(1);
  });
});
