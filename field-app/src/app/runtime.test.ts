import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { assignOrder, createOrder, downloadAssigned, findDebtors, login } from "../application";
import { IndexedDbAuthorityRepository, IndexedDbLocalRepository, deleteFieldDatabase, deleteAuthorityDatabase } from "../adapters/indexeddb";
import { MockConnectivity } from "../adapters/mock";
import type { OperationRecord, WorkOrder } from "../domain";
import { SyncEngine } from "../application/sync";
import { createAuthenticatedTechnicianStore, SimulatedAuthoritySyncTransport } from "./runtime";

const authorityRepositories: IndexedDbAuthorityRepository[] = [];
const localRepositories: IndexedDbLocalRepository[] = [];
const authorityDatabases: string[] = [];
const localDatabases: string[] = [];

afterEach(async () => {
  for (const repository of authorityRepositories.splice(0)) await repository.close();
  for (const repository of localRepositories.splice(0)) await repository.close();
  for (const database of authorityDatabases.splice(0)) await deleteAuthorityDatabase(database);
  for (const database of localDatabases.splice(0)) await deleteFieldDatabase(database);
});

describe("simulated authoritative technician runtime", () => {
  it("looks up only durable authority-accepted operations", async () => {
    const setup = await createRuntime("runtime-lookup");
    const operation = operationFor(setup.order.orderId, setup.technician.userId, setup.deviceId, "runtime-accepted");
    await setup.authority.authorizeTechnicalOrder({ operationId: operation.operationId, action: "CUT", orderId: operation.orderId, technicianId: operation.technicianId, deviceId: operation.deviceId, orderVersion: setup.order.version ?? 0, session: setup.technician });
    await setup.authority.recordSyncedOperation(operation, setup.technician);
    const transport = new SimulatedAuthoritySyncTransport(setup.authority, setup.technician, setup.repository);

    await expect(transport.lookup(operation.operationId)).resolves.toEqual({ status: "confirmed", operationId: operation.operationId });
    await expect(transport.lookup("runtime-missing")).resolves.toEqual({ status: "not_found", operationId: "runtime-missing" });
  });

  it("turns acknowledged authority rejection into durable manual review", async () => {
    const setup = await createRuntime("runtime-send-rejection");
    const operationId = "runtime-rejected";
    const operation = operationFor(setup.order.orderId, setup.technician.userId, setup.deviceId, operationId);
    await setup.repository.claimCut({
      operation,
      order: { ...setup.order, status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 3 },
      syncItem: { operationId, action: "CUT", orderId: setup.order.orderId, technicianId: setup.technician.userId, deviceId: setup.deviceId, status: "pending", attempts: 0 },
    }, 2);
    await assignOrder(setup.authority, setup.admin, { operationId: "runtime-reassign", orderId: setup.order.orderId, technicianId: setup.otherTechnician.userId, expectedOrderVersion: 2 });

    const transport = new SimulatedAuthoritySyncTransport(setup.authority, setup.technician, setup.repository);
    const report = await new SyncEngine(setup.repository, new MockConnectivity("online"), transport).syncOnce();

    expect(report).toMatchObject({ processed: 1, synced: 0, failed: 1 });
    await expect(setup.repository.listSyncItems()).resolves.toMatchObject([{ operationId, status: "failed", manualReview: true, errorCode: "REMOTE_CONFLICT" }]);
    await expect(setup.repository.listConflicts()).resolves.toMatchObject([{ operationId, reason: "Operation order is not assigned to this technician." }]);
  });

  it("does not grant a stale local order after authoritative reassignment", async () => {
    const setup = await createRuntime("runtime-authorization");
    const transport = new SimulatedAuthoritySyncTransport(setup.authority, setup.technician, setup.repository);
    const store = createAuthenticatedTechnicianStore(setup.technician.userId, setup.deviceId, { repository: setup.repository, seedPackage: await setup.repository.loadAssignedPackage(), transport });
    await store.init();
    await assignOrder(setup.authority, setup.admin, { operationId: "runtime-authorization-reassign", orderId: setup.order.orderId, technicianId: setup.otherTechnician.userId, expectedOrderVersion: 2 });

    await store.executeCut(setup.order.orderId, { exceptionReason: "No se pudo capturar foto.", fieldCapture: fieldCapture() });

    expect(store.getSnapshot().activity).toMatchObject([{ record: { kind: "VISIT", attemptedAction: "CUT", execution: "NONE", syncStatus: "pending" } }]);
  });
});

async function createRuntime(name: string) {
  const authorityDbName = `${name}-authority`;
  const localDbName = `${name}-local`;
  authorityDatabases.push(authorityDbName);
  localDatabases.push(localDbName);
  const authority = new IndexedDbAuthorityRepository({ dbName: authorityDbName });
  const repository = new IndexedDbLocalRepository({ dbName: localDbName, technicianId: "tech-camila", deviceId: "device-runtime" });
  authorityRepositories.push(authority);
  localRepositories.push(repository);
  await authority.seedSimulatedData();
  const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
  const technician = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
  const otherTechnician = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
  const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
  const order = await createOrder(authority, admin, { operationId: `${name}-create`, debtorId: debtor.debtorId, purpose: "CUT" });
  await assignOrder(authority, admin, { operationId: `${name}-assign`, orderId: order.orderId, technicianId: technician.userId, expectedOrderVersion: 1 });
  const envelope = await downloadAssigned(authority, technician, "device-runtime");
  await repository.savePackage(envelope);
  return { authority, repository, admin, technician, otherTechnician, order: envelope.package.orders[0] as WorkOrder, deviceId: "device-runtime" };
}

function operationFor(orderId: string, technicianId: string, deviceId: string, operationId: string): OperationRecord {
  return {
    operationId,
    kind: "CUT",
    action: "CUT",
    orderId,
    technicianId,
    deviceId,
    status: "CONFIRMED",
    physicalStatus: "CONFIRMED",
    syncStatus: "synced",
    recordedAt: "2026-09-13T11:00:00.000Z",
    updatedAt: "2026-09-13T11:01:00.000Z",
    attempts: 0,
    evidenceRefs: [],
  };
}

function fieldCapture() {
  return {
    reading: { value: 123.45, unit: "kWh" as const, meterId: "MED-1001", recordedAt: "2026-09-13T11:00:00.000Z", status: "CAPTURED" as const },
    location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: "2026-09-13T11:00:00.000Z", status: "CAPTURED" as const },
    cutType: "RED" as const,
    nearbyMeters: false,
  };
}
