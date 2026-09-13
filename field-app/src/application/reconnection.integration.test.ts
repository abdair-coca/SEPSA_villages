import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { executeReconnection } from "./reconnection";
import { SyncEngine } from "./sync";
import { IndexedDbLocalRepository, deleteFieldDatabase } from "../adapters/indexeddb";
import { MockConnectivity, MockEnablementAdapter, MockSyncTransport } from "../adapters/mock";
import type { OperationRecord, WorkOrder, WorkPackage } from "../domain";

const databases: string[] = [];
const repositories: IndexedDbLocalRepository[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const name of databases.splice(0)) await deleteFieldDatabase(name);
});

function order(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return { orderId: "order-reconnect", assignedTechnicianId: "tech-1", status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 4, ...overrides };
}

async function createRepository(name: string, source = order()): Promise<IndexedDbLocalRepository> {
  databases.push(name);
  const repo = new IndexedDbLocalRepository({ dbName: name, technicianId: "tech-1", deviceId: "device-1" });
  repositories.push(repo);
  const workPackage: WorkPackage = { packageId: `package-${name}`, technicianId: "tech-1", deviceId: "device-1", version: 1, downloadedAt: "2026-09-12T09:00:00.000Z", orders: [source] };
  await repo.savePackage(workPackage);
  return repo;
}

function grant(operationId: string) {
  return { enablementId: `enablement-${operationId}`, token: "opaque", orderId: "order-reconnect", technicianId: "tech-1", deviceId: "device-1", operationId, version: 4, issuedAt: "2026-09-12T09:00:00.000Z", expiresAt: "2026-09-12T09:05:00.000Z" };
}

function input(repository: IndexedDbLocalRepository, enablement: MockEnablementAdapter, operationId: string) {
  return { repository, enablement, order: order(), operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: `evidence-${operationId}`, orderId: "order-reconnect", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg" as const, width: 100, height: 100, optimized: true } };
}

describe("reconnection process", () => {
  it("requires EJECUTADO and external enabled state, then persists once", async () => {
    const repository = await createRepository("reconnect-executed");
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant("reconnect-00000000-0000-4000-8000-000000000021") };
    const result = await executeReconnection(input(repository, enablement, "reconnect-00000000-0000-4000-8000-000000000021"));
    expect(result.outcome).toBe("executed");
    expect(await repository.getOrder("order-reconnect")).toMatchObject({ status: "RECONEXIÓN", physicalStatus: "CONFIRMED" });
    expect(enablement.consumeCalls).toHaveLength(1);

    const duplicate = await executeReconnection(input(repository, enablement, "reconnect-00000000-0000-4000-8000-000000000021"));
    expect(duplicate.outcome).toBe("duplicate");
    expect(enablement.consumeCalls).toHaveLength(1);
  });

  it("records pending visit for unknown enablement and never consumes", async () => {
    const repository = await createRepository("reconnect-unknown");
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "unknown", errorCode: "NETWORK_UNKNOWN" };
    const result = await executeReconnection(input(repository, enablement, "reconnect-unknown-00000000-0000-4000-8000-000000000022"));
    expect(result).toMatchObject({ outcome: "visit_recorded", visit: { action: "VISIT", attemptedAction: "RECONNECTION", execution: "NONE", syncStatus: "pending" } });
    expect(enablement.consumeCalls).toHaveLength(0);
  });

  it("blocks not enabled and does not expose or process payment", async () => {
    const repository = await createRepository("reconnect-not-enabled");
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "not_enabled" };
    const result = await executeReconnection(input(repository, enablement, "reconnect-blocked-00000000-0000-4000-8000-000000000023"));
    expect(result).toMatchObject({ outcome: "visit_recorded", visit: { action: "VISIT", attemptedAction: "RECONNECTION", execution: "NONE" } });
    expect(JSON.stringify(result)).not.toMatch(/payment|cobro|pago/i);
  });

  it("rejects reconnection when cut is not executed", async () => {
    const repository = await createRepository("reconnect-ineligible", order({ status: "GENERADO", physicalStatus: "NONE" }));
    const enablement = new MockEnablementAdapter();
    await expect(executeReconnection({ ...input(repository, enablement, "reconnect-ineligible-00000000-0000-4000-8000-000000000024"), order: order({ status: "GENERADO", physicalStatus: "NONE" }) })).rejects.toMatchObject({ code: "ORDER_NOT_EXECUTED" });
    expect(enablement.requestCalls).toHaveLength(0);
  });

  it("marks lost physical result unknown and lookup gates replay", async () => {
    const repository = await createRepository("reconnect-lost");
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant("reconnect-lost-00000000-0000-4000-8000-000000000025") };
    enablement.consumeError = new Error("response lost");
    (enablement.consumeError as Error & { code?: string }).code = "RESPONSE_LOST";
    enablement.lookupResponse = { status: "unknown", operationId: "reconnect-lost-00000000-0000-4000-8000-000000000025" };
    const result = await executeReconnection(input(repository, enablement, "reconnect-lost-00000000-0000-4000-8000-000000000025"));
    expect(result.outcome).toBe("physical_unknown");
    const replay = await executeReconnection(input(repository, enablement, "reconnect-lost-00000000-0000-4000-8000-000000000025"));
    expect(replay.outcome).toBe("physical_unknown");
    expect(enablement.consumeCalls).toHaveLength(1);
    expect(enablement.lookupCalls).toEqual(["reconnect-lost-00000000-0000-4000-8000-000000000025", "reconnect-lost-00000000-0000-4000-8000-000000000025"]);
  });

  it("recovers a persisted reconnection intent before lookup and marks sync uncertain", async () => {
    const repository = await createRepository("reconnect-recovery");
    const operationId = "reconnect-recovery-00000000-0000-4000-8000-000000000026";
    const operation: OperationRecord = {
      operationId,
      kind: "RECONNECTION",
      action: "RECONNECTION",
      orderId: "order-reconnect",
      technicianId: "tech-1",
      deviceId: "device-1",
      status: "INTENT_PERSISTED",
      physicalStatus: "CLAIMED",
      syncStatus: "pending",
      recordedAt: "2026-09-12T09:01:00.000Z",
      updatedAt: "2026-09-12T09:01:00.000Z",
      attempts: 0,
      evidenceRefs: [`evidence-${operationId}`],
    };
    await repository.claimReconnection({
      operation,
      order: { ...order(), physicalStatus: "CLAIMED", version: 5 },
      syncItem: { operationId, action: "RECONNECTION", orderId: "order-reconnect", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 0, uncertain: false },
    }, 4);
    const enablement = new MockEnablementAdapter();
    enablement.lookupResponse = { status: "unknown", operationId };
    const result = await executeReconnection(input(repository, enablement, operationId));
    expect(result.outcome).toBe("physical_unknown");
    expect(enablement.consumeCalls).toHaveLength(0);
    expect(enablement.lookupCalls).toEqual([operationId]);
    await expect(repository.getRecord(operationId)).resolves.toMatchObject({ status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN", syncStatus: "failed" });
    await expect(repository.getOrder("order-reconnect")).resolves.toMatchObject({ physicalStatus: "PHYSICAL_UNKNOWN", version: 6 });
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "failed", uncertain: true }]);

    const transport = new MockSyncTransport();
    transport.lookupResponse = { status: "not_found", operationId };
    const report = await new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce();
    expect(report.synced).toBe(1);
    expect(transport.lookups).toEqual([operationId]);
    expect(transport.sent).toHaveLength(1);
  });
});
