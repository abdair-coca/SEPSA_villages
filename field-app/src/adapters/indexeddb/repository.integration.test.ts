import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createVisit } from "../../domain";
import type { EvidenceReference, OperationRecord, WorkOrder, WorkPackage } from "../../domain";
import { IndexedDbLocalRepository, createSimulatedPackageEnvelope, deleteFieldDatabase } from ".";
import type { AtomicOperationChange } from "../../ports";

const dbNames: string[] = [];
const repositories: IndexedDbLocalRepository[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const name of dbNames.splice(0)) await deleteFieldDatabase(name);
});

function packageFor(dbName: string, order: WorkOrder = orderFor()): { dbName: string; workPackage: WorkPackage } {
  dbNames.push(dbName);
  return {
    dbName,
    workPackage: {
      packageId: `package-${dbName}`,
      technicianId: "tech-1",
      deviceId: "device-1",
      version: 1,
      downloadedAt: "2026-09-12T09:00:00.000Z",
      orders: [order],
    },
  };
}

function orderFor(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return { orderId: "order-1", assignedTechnicianId: "tech-1", status: "GENERADO", physicalStatus: "NONE", version: 1, ...overrides };
}

function operation(operationId: string): OperationRecord {
  return {
    operationId,
    kind: "CUT",
    action: "CUT",
    orderId: "order-1",
    technicianId: "tech-1",
    deviceId: "device-1",
    status: "INTENT_PERSISTED",
    physicalStatus: "CLAIMED",
    syncStatus: "pending",
    recordedAt: "2026-09-12T09:01:00.000Z",
    updatedAt: "2026-09-12T09:01:00.000Z",
    attempts: 0,
    evidenceRefs: [],
  };
}

function change(operationId: string, nextOrder: WorkOrder = orderFor({ physicalStatus: "CLAIMED", version: 2 })): AtomicOperationChange {
  const record = operation(operationId);
  return {
    operation: record,
    order: nextOrder,
    syncItem: { operationId, action: "CUT", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 0 },
  };
}

describe("IndexedDB local repository", () => {
  it("survives close and reopen with last valid package and durable queue", async () => {
    const { dbName, workPackage } = packageFor("restart");
    const first = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(first);
    await first.savePackage(workPackage);
    await first.claimCut(change("operation-restart"), 1);
    await first.close();

    const reopened = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(reopened);
    await expect(reopened.loadAssignedPackage()).resolves.toMatchObject({ packageId: workPackage.packageId, version: 1, orders: [{ physicalStatus: "CLAIMED", version: 2 }] });
    await expect(reopened.getRecord("operation-restart")).resolves.toMatchObject({ operationId: "operation-restart" });
    await expect(reopened.listSyncItems()).resolves.toMatchObject([{ operationId: "operation-restart", status: "pending" }]);
    await reopened.close();
  });

  it("rejects altered package without replacing last valid package", async () => {
    const { dbName, workPackage } = packageFor("package-integrity");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    const altered = createSimulatedPackageEnvelope({ ...workPackage, version: 2, orders: [orderFor({ orderId: "altered" })] });
    altered.checksum = "SIMULATED-tampered";
    await expect(repository.savePackage(altered)).rejects.toThrow(/integrity/);
    await expect(repository.loadAssignedPackage()).resolves.toMatchObject({ version: 1, packageId: workPackage.packageId });
  });

  it("rolls back operation, order and queue together when one store write fails", async () => {
    const { dbName, workPackage } = packageFor("rollback");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    const invalid = { ...change("operation-rollback"), syncItem: { ...change("operation-rollback").syncItem, operationId: undefined as unknown as string } };
    await expect(repository.claimCut(invalid, 1)).rejects.toBeTruthy();
    await expect(repository.getRecord("operation-rollback")).resolves.toBeUndefined();
    await expect(repository.getOrder("order-1")).resolves.toMatchObject({ version: 1, physicalStatus: "NONE" });
    await expect(repository.listSyncItems()).resolves.toEqual([]);
  });

  it("allows only one CAS claim when two operations race", async () => {
    const { dbName, workPackage } = packageFor("cas-race");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    const results = await Promise.all([repository.claimCut(change("operation-a"), 1), repository.claimCut(change("operation-b"), 1)]);
    expect(results.filter((result) => result.status === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "order_conflict")).toHaveLength(1);
    expect((await repository.listSyncItems())).toHaveLength(1);
  });

  it("deduplicates the same operation id across repeated claims", async () => {
    const { dbName, workPackage } = packageFor("duplicate-id");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    const first = await repository.claimCut(change("operation-same"), 1);
    const duplicate = await repository.claimCut(change("operation-same"), 1);
    expect(first.status).toBe("claimed");
    expect(duplicate.status).toBe("existing");
    expect(await repository.listSyncItems()).toHaveLength(1);
  });

  it("stores evidence atomically with operation", async () => {
    const { dbName, workPackage } = packageFor("evidence");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    const evidence: EvidenceReference = { evidenceId: "evidence-1", orderId: "order-1", operationId: "operation-evidence", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true };
    await repository.claimCut({ ...change("operation-evidence"), evidence }, 1);
    await expect(repository.getEvidence("evidence-1")).resolves.toEqual(evidence);
  });

  it("preserves claimed and pending local orders when a stale package arrives", async () => {
    const { dbName, workPackage } = packageFor("package-stale");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    await repository.claimCut(change("operation-claimed"), 1);
    await repository.savePackage({ ...workPackage, version: 2, orders: [orderFor({ version: 1, physicalStatus: "NONE" })] });
    await expect(repository.loadAssignedPackage()).resolves.toMatchObject({ orders: [{ version: 2, physicalStatus: "CLAIMED" }] });

    const pendingSetup = packageFor("package-pending");
    const pendingRepository = new IndexedDbLocalRepository({ dbName: pendingSetup.dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(pendingRepository);
    await pendingRepository.savePackage(pendingSetup.workPackage);
    const pendingVisit = createVisit({ operationId: "operation-pending", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", action: "CUT", reason: "offline", recordedAt: "2026-09-12T09:01:00.000Z" });
    await pendingRepository.claimVisit({ visit: pendingVisit, syncItem: { operationId: "operation-pending", action: "VISIT", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 1 } });
    await pendingRepository.savePackage({ ...pendingSetup.workPackage, version: 2, orders: [orderFor({ version: 1, physicalStatus: "NONE" })] });
    await expect(pendingRepository.loadAssignedPackage()).resolves.toMatchObject({ orders: [{ version: 1, physicalStatus: "NONE" }] });
  });

  it("isolates records and sync queue by technician and device, including crossed operation ids", async () => {
    const dbName = "identity-scope";
    dbNames.push(dbName);
    const first = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    const second = new IndexedDbLocalRepository({ dbName, technicianId: "tech-2", deviceId: "device-2" });
    repositories.push(first, second);
    await first.savePackage({ ...packageFor("unused").workPackage, packageId: "package-tech-1", technicianId: "tech-1", deviceId: "device-1", orders: [orderFor({ orderId: "order-tech-1" })] });
    await second.savePackage({ ...packageFor("unused2").workPackage, packageId: "package-tech-2", technicianId: "tech-2", deviceId: "device-2", orders: [orderFor({ orderId: "order-tech-2", assignedTechnicianId: "tech-2" })] });
    const visitOne = createVisit({ operationId: "crossed-id", orderId: "order-tech-1", technicianId: "tech-1", deviceId: "device-1", action: "CUT", reason: "one", recordedAt: "2026-09-12T09:01:00.000Z" });
    expect((await first.claimVisit({ visit: visitOne, syncItem: { operationId: "crossed-id", action: "VISIT", orderId: "order-tech-1", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 1 } })).status).toBe("claimed");
    expect(await second.getRecord("crossed-id")).toBeUndefined();
    expect(await second.listSyncItems()).toEqual([]);
    const crossed = createVisit({ operationId: "crossed-id", orderId: "order-tech-2", technicianId: "tech-2", deviceId: "device-2", action: "CUT", reason: "two", recordedAt: "2026-09-12T09:01:00.000Z" });
    expect((await second.claimVisit({ visit: crossed, syncItem: { operationId: "crossed-id", action: "VISIT", orderId: "order-tech-2", technicianId: "tech-2", deviceId: "device-2", status: "pending", attempts: 1 } })).status).toBe("rejected");
  });

  it("claims one sync lease, keeps active lease, then recovers only after expiry", async () => {
    const { dbName, workPackage } = packageFor("sync-leases");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    await repository.claimCut(change("operation-lease"), 1);
    const now = "2026-09-12T09:01:00.000Z";
    expect((await repository.claimSync("operation-lease", "owner-a", now, 10_000)).status).toBe("claimed");
    expect((await repository.claimSync("operation-lease", "owner-b", now, 10_000)).status).toBe("busy");
    await repository.recoverInFlight("2026-09-12T09:01:05.000Z");
    expect((await repository.claimSync("operation-lease", "owner-b", "2026-09-12T09:01:05.000Z", 10_000)).status).toBe("busy");
    await repository.recoverInFlight("2026-09-12T09:01:11.000Z");
    expect((await repository.listSyncItems())[0]).toMatchObject({ status: "failed", uncertain: true });
    await expect(repository.getRecord("operation-lease")).resolves.toMatchObject({ status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN", syncStatus: "failed" });
    await expect(repository.getOrder("order-1")).resolves.toMatchObject({ physicalStatus: "PHYSICAL_UNKNOWN", version: 3 });
    expect((await repository.claimSync("operation-lease", "owner-b", "2026-09-12T09:01:11.000Z", 10_000)).status).toBe("claimed");
  });

  it("does not degrade a physically confirmed operation during expired lease recovery", async () => {
    const { dbName, workPackage } = packageFor("sync-confirmed-recovery");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    const confirmed = { ...operation("operation-confirmed-recovery"), status: "CONFIRMED" as const, physicalStatus: "CONFIRMED" as const, syncStatus: "pending" as const };
    await repository.claimCut({ operation: confirmed, order: orderFor({ status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 2 }), syncItem: { operationId: confirmed.operationId, action: "CUT", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 0 } }, 1);
    await repository.claimSync(confirmed.operationId, "owner-confirmed", "2026-09-12T09:01:00.000Z", 1);
    await repository.recoverInFlight("2026-09-12T09:01:00.001Z");
    await expect(repository.getRecord(confirmed.operationId)).resolves.toMatchObject({ status: "CONFIRMED", physicalStatus: "CONFIRMED", syncStatus: "failed" });
    await expect(repository.getOrder("order-1")).resolves.toMatchObject({ status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 2 });
  });

  it("scopes package and order keys by technician and device", async () => {
    const dbName = "scoped-orders";
    dbNames.push(dbName);
    const first = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    const second = new IndexedDbLocalRepository({ dbName, technicianId: "tech-2", deviceId: "device-2" });
    repositories.push(first, second);
    await first.savePackage({ ...packageFor("scope-first").workPackage, packageId: "same-package", orders: [orderFor({ status: "GENERADO" })] });
    await second.savePackage({ ...packageFor("scope-second").workPackage, packageId: "same-package", technicianId: "tech-2", deviceId: "device-2", orders: [orderFor({ assignedTechnicianId: "tech-2", status: "EJECUTADO", physicalStatus: "CONFIRMED" })] });
    await expect(first.getOrder("order-1")).resolves.toMatchObject({ assignedTechnicianId: "tech-1", status: "GENERADO" });
    await expect(second.getOrder("order-1")).resolves.toMatchObject({ assignedTechnicianId: "tech-2", status: "EJECUTADO" });
    expect(first.dbName).toBe(second.dbName);
    const defaultFirst = new IndexedDbLocalRepository({ technicianId: "tech-1", deviceId: "device-1" });
    const defaultSecond = new IndexedDbLocalRepository({ technicianId: "tech-2", deviceId: "device-2" });
    repositories.push(defaultFirst, defaultSecond);
    dbNames.push(defaultFirst.dbName, defaultSecond.dbName);
    expect(defaultFirst.dbName).not.toBe(defaultSecond.dbName);
  });

  it("rejects evidence collisions and stale fencing updates", async () => {
    const { dbName, workPackage } = packageFor("evidence-fencing");
    const repository = new IndexedDbLocalRepository({ dbName, technicianId: "tech-1", deviceId: "device-1" });
    repositories.push(repository);
    await repository.savePackage(workPackage);
    const evidence: EvidenceReference = { evidenceId: "evidence-collision", orderId: "order-1", operationId: "operation-evidence", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true };
    await repository.claimCut({ ...change("operation-evidence"), evidence }, 1);
    await expect(repository.updateOperationAndOrder({ operation: operation("operation-evidence-2"), syncItem: { operationId: "operation-evidence-2", action: "CUT", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 0 }, evidence: { ...evidence, operationId: "operation-evidence-2" } })).rejects.toThrow(/collision/);
    await expect(repository.getRecord("operation-evidence-2")).resolves.toBeUndefined();

    const first = await repository.claimSync("operation-evidence", "owner-a", "2026-09-12T09:01:00.000Z", 1);
    const firstToken = first.status === "claimed" ? first.item.leaseToken : undefined;
    if (!firstToken) throw new Error("Expected first fencing claim.");
    await expect(repository.updateSyncState("operation-evidence", "synced", { owner: "owner-a", leaseToken: firstToken, now: "2026-09-12T09:01:00.001Z" })).rejects.toThrow(/fencing/);
    const second = await repository.claimSync("operation-evidence", "owner-b", "2026-09-12T09:01:00.002Z", 10_000);
    const secondToken = second.status === "claimed" ? second.item.leaseToken : undefined;
    if (!secondToken) throw new Error("Expected second fencing claim.");
    await expect(repository.updateSyncState("operation-evidence", "synced", { owner: "owner-a", leaseToken: firstToken, now: "2026-09-12T09:01:00.003Z" })).rejects.toThrow(/fencing/);
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "syncing", leaseOwner: "owner-b", leaseToken: secondToken }]);
    await repository.updateSyncState("operation-evidence", "synced", { owner: "owner-b", leaseToken: secondToken, now: "2026-09-12T09:01:00.003Z" });
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "synced" }]);
  });
});
