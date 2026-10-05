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
  return { enablementId: `enablement-${operationId}`, token: "opaque", orderId: "order-reconnect", technicianId: "tech-1", technicianNameSnapshot: "Técnico Uno", deviceId: "device-1", operationId, version: 4, issuedAt: "2026-09-12T09:00:00.000Z", expiresAt: "2026-09-12T09:05:00.000Z" };
}

function input(repository: IndexedDbLocalRepository, enablement: MockEnablementAdapter, operationId: string) {
  return { repository, enablement, order: order(), operationId, technicianId: "tech-1", technicianNameSnapshot: "Técnico Uno", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", demora: "Sin demora", evidence: { evidenceId: `evidence-${operationId}`, orderId: "order-reconnect", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg" as const, width: 100, height: 100, optimized: true } };
}

describe("reconnection process", () => {
  it("requires EJECUTADO and external enabled state, then persists once", async () => {
    const repository = await createRepository("reconnect-executed");
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant("reconnect-00000000-0000-4000-8000-000000000021") };
    const result = await executeReconnection(input(repository, enablement, "reconnect-00000000-0000-4000-8000-000000000021"));
    expect(result.outcome).toBe("executed");
    expect(result).toMatchObject({ operation: { operationId: "reconnect-00000000-0000-4000-8000-000000000021", effectiveAt: "2026-09-12T09:01:00.000Z", technicianNameSnapshot: "Técnico Uno", demora: "Sin demora", authorizationToken: undefined } });
    expect(await repository.getOrder("order-reconnect")).toMatchObject({ status: "RECONEXIÓN", physicalStatus: "CONFIRMED" });
    expect(enablement.consumeCalls).toHaveLength(1);

    const duplicate = await executeReconnection(input(repository, enablement, "reconnect-00000000-0000-4000-8000-000000000021"));
    expect(duplicate.outcome).toBe("duplicate");
    expect(enablement.consumeCalls).toHaveLength(1);
  });

  it("syncs the same operation id without mutating reconnection facts or incrementing the order version again", async () => {
    const repository = await createRepository("reconnect-sync-idempotent");
    const operationId = "reconnect-sync-00000000-0000-4000-8000-000000000028";
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant(operationId) };
    const result = await executeReconnection({
      ...input(repository, enablement, operationId),
      evidence: undefined,
      exceptionReason: "saltar_control_fotos: prueba sin foto",
      demora: "Visita retrasada por acceso al domicilio",
    });
    expect(result.outcome).toBe("executed");
    const beforeSync = await repository.getRecord(operationId) as OperationRecord;
    expect(beforeSync).toMatchObject({ effectiveAt: "2026-09-12T09:01:00.000Z", technicianNameSnapshot: "Técnico Uno", demora: "Visita retrasada por acceso al domicilio", authorizationVersion: 4 });
    const localOrder = await repository.getOrder("order-reconnect");
    await repository.close();
    const reopened = new IndexedDbLocalRepository({ dbName: "reconnect-sync-idempotent", technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(reopened);
    const transport = new MockSyncTransport();

    await expect(new SyncEngine(reopened, new MockConnectivity("offline"), transport).syncOnce()).resolves.toMatchObject({ processed: 0, synced: 0 });
    await expect(reopened.listSyncItems()).resolves.toMatchObject([{ status: "pending", attempts: 0 }]);
    expect(transport.sent).toHaveLength(0);
    await expect(new SyncEngine(reopened, new MockConnectivity("online"), transport).syncOnce()).resolves.toMatchObject({ synced: 1 });

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ operationId, action: "RECONNECTION", orderId: "order-reconnect", orderVersion: 4, effectiveAt: beforeSync.effectiveAt, technicianNameSnapshot: "Técnico Uno", demora: "Visita retrasada por acceso al domicilio", authorizationId: beforeSync.authorizationId });
    expect(transport.sent[0]?.authorizationToken).toBeUndefined();
    await expect(reopened.getOrder("order-reconnect")).resolves.toMatchObject({ status: "RECONEXIÓN", physicalStatus: "CONFIRMED", version: localOrder?.version, authoritativeVersion: 5 });
    await expect(reopened.getRecord(operationId)).resolves.toMatchObject({ status: "CONFIRMED", physicalStatus: "CONFIRMED", syncStatus: "synced", effectiveAt: beforeSync.effectiveAt, technicianNameSnapshot: "Técnico Uno", demora: "Visita retrasada por acceso al domicilio" });
    await expect(reopened.updateOperationAndOrder({ operation: { ...beforeSync, demora: "editado" }, syncItem: { operationId, action: "RECONNECTION", orderId: "order-reconnect", technicianId: "tech-1", deviceId: "device-1", status: "synced", attempts: 0 } })).rejects.toMatchObject({ code: "OPERATION_IMMUTABLE" });
  });

  it("records pending visit for unknown enablement and never consumes", async () => {
    const repository = await createRepository("reconnect-unknown");
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "unknown", errorCode: "NETWORK_UNKNOWN" };
    const result = await executeReconnection(input(repository, enablement, "reconnect-unknown-00000000-0000-4000-8000-000000000022"));
    expect(result).toMatchObject({ outcome: "visit_recorded", visit: { action: "VISIT", attemptedAction: "RECONNECTION", execution: "NONE", syncStatus: "pending" } });
    expect(enablement.consumeCalls).toHaveLength(0);
  });

  it("does not authorize or execute a reconnection while offline", async () => {
    const repository = await createRepository("reconnect-offline-blocked");
    const enablement = new MockEnablementAdapter({ mode: "offline" });

    const result = await executeReconnection(input(repository, enablement, "reconnect-offline-00000000-0000-4000-8000-000000000030"));

    expect(result).toMatchObject({ outcome: "visit_recorded", visit: { attemptedAction: "RECONNECTION", execution: "NONE" } });
    expect(enablement.requestAttempts).toBeGreaterThan(0);
    expect(enablement.consumeCalls).toHaveLength(0);
    await expect(repository.getOrder("order-reconnect")).resolves.toMatchObject({ status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 4 });
  });

  it("uses the authoritative server version for habilitation while keeping the local CAS revision", async () => {
    const localOrder = order({ version: 8, authoritativeVersion: 4 });
    const repository = await createRepository("reconnect-authority-version", localOrder);
    const operationId = "reconnect-authority-version-00000000-0000-4000-8000-000000000031";
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant(operationId) };

    const result = await executeReconnection({ ...input(repository, enablement, operationId), order: localOrder, evidence: undefined, exceptionReason: "saltar_control_fotos: prueba", demora: "Sin demora" });

    expect(result.outcome).toBe("executed");
    expect(enablement.requestCalls[0]).toMatchObject({ orderVersion: 4, operationId });
    expect(enablement.consumeCalls[0]).toMatchObject({ version: 4, operationId });
    await expect(repository.getOrder("order-reconnect")).resolves.toMatchObject({ version: 10, authoritativeVersion: 4, status: "RECONEXIÓN" });
  });

  it("keeps the confirmed CUT state when a reserved reconnection habilitation is rejected", async () => {
    const repository = await createRepository("reconnect-consume-denied");
    const operationId = "reconnect-consume-denied-00000000-0000-4000-8000-000000000029";
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant(operationId) };
    enablement.consumeResponse = { status: "not_enabled", errorCode: "ORDER_STATE_CONFLICT" };

    const result = await executeReconnection(input(repository, enablement, operationId));

    expect(result.outcome).toBe("blocked");
    await expect(repository.getOrder("order-reconnect")).resolves.toMatchObject({ status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 6 });
    await expect(repository.getRecord(operationId)).resolves.toMatchObject({ status: "BLOCKED", physicalStatus: "NONE", syncStatus: "failed", errorCode: "RECONNECTION_NOT_COMPLETED" });
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "failed", manualReview: true, uncertain: false }]);
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

  it("recovers an uncertain consume with the same id only after lookup confirms the grant is still reserved", async () => {
    const repository = await createRepository("reconnect-lost");
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant("reconnect-lost-00000000-0000-4000-8000-000000000025") };
    enablement.consumeError = new Error("response lost");
    (enablement.consumeError as Error & { code?: string }).code = "RESPONSE_LOST";
    const result = await executeReconnection(input(repository, enablement, "reconnect-lost-00000000-0000-4000-8000-000000000025"));
    expect(result.outcome).toBe("physical_unknown");
    enablement.consumeError = undefined;
    const replay = await executeReconnection(input(repository, enablement, "reconnect-lost-00000000-0000-4000-8000-000000000025"));
    expect(replay.outcome).toBe("executed");
    expect(enablement.consumeCalls).toHaveLength(2);
    expect(enablement.lookupReconnectionCalls).toEqual(["reconnect-lost-00000000-0000-4000-8000-000000000025"]);
    expect((await repository.getRecord("reconnect-lost-00000000-0000-4000-8000-000000000025"))?.kind).toBe("RECONNECTION");
  });

  it("keeps an uncertain reconnection in review when lookup cannot prove the grant was consumed", async () => {
    const repository = await createRepository("reconnect-lost-unknown");
    const operationId = "reconnect-lost-unknown-00000000-0000-4000-8000-000000000027";
    const enablement = new MockEnablementAdapter();
    enablement.requestResponse = { status: "enabled", grant: grant(operationId) };
    enablement.consumeError = Object.assign(new Error("response lost"), { code: "RESPONSE_LOST" });
    expect((await executeReconnection(input(repository, enablement, operationId))).outcome).toBe("physical_unknown");
    enablement.lookupReconnectionResponse = { status: "unknown", operationId };

    const replay = await executeReconnection(input(repository, enablement, operationId));

    expect(replay.outcome).toBe("physical_unknown");
    expect(enablement.consumeCalls).toHaveLength(1);
    expect(enablement.lookupReconnectionCalls).toEqual([operationId]);
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
      effectiveAt: "2026-09-12T09:01:00.000Z",
      technicianNameSnapshot: "Técnico Uno",
      demora: "Sin demora",
      updatedAt: "2026-09-12T09:01:00.000Z",
      attempts: 0,
      authorizationId: `enablement-${operationId}`,
      authorizationToken: "opaque-recovery-token",
      authorizationVersion: 4,
      evidenceRefs: [`evidence-${operationId}`],
    };
    await repository.claimReconnection({
      operation,
      order: { ...order(), physicalStatus: "CLAIMED", version: 5 },
      syncItem: { operationId, action: "RECONNECTION", orderId: "order-reconnect", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 0, uncertain: false },
    }, 4);
    const enablement = new MockEnablementAdapter();
    enablement.lookupResponse = { status: "unknown", operationId };
    await repository.close();
    const reopened = new IndexedDbLocalRepository({ dbName: "reconnect-recovery", technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(reopened);
    const result = await executeReconnection(input(reopened, enablement, operationId));
    expect(result.outcome).toBe("physical_unknown");
    expect(enablement.consumeCalls).toHaveLength(0);
    expect(enablement.lookupCalls).toEqual([operationId]);
    await expect(reopened.getRecord(operationId)).resolves.toMatchObject({ status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN", syncStatus: "failed" });
    await expect(reopened.getOrder("order-reconnect")).resolves.toMatchObject({ physicalStatus: "PHYSICAL_UNKNOWN", version: 6 });
    await expect(reopened.listSyncItems()).resolves.toMatchObject([{ status: "failed", uncertain: true }]);

    const transport = new MockSyncTransport();
    transport.lookupResponse = { status: "not_found", operationId };
    const report = await new SyncEngine(reopened, new MockConnectivity("online"), transport).syncOnce();
    expect(report.failed).toBe(1);
    expect(transport.lookups).toEqual([operationId]);
    expect(transport.sent).toHaveLength(0);
    await expect(reopened.listSyncItems()).resolves.toMatchObject([{ status: "failed", uncertain: true }]);
  });
});
