import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { executeCut } from "./process";
import { LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON, SyncEngine } from "./sync";
import { IndexedDbLocalRepository, deleteFieldDatabase } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockSyncTransport } from "../adapters/mock";
import { ResponseLostError } from "../ports/authorization";
import type { OperationRecord, WorkOrder, WorkPackage } from "../domain";

const databases: string[] = [];
const repositories: IndexedDbLocalRepository[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const name of databases.splice(0)) await deleteFieldDatabase(name);
});

const cutOrder: WorkOrder = { orderId: "order-sync", assignedTechnicianId: "tech-1", status: "GENERADO", physicalStatus: "NONE", version: 1 };

async function setup(name: string) {
  databases.push(name);
  const repository = new IndexedDbLocalRepository({ dbName: name, technicianId: "tech-1", deviceId: "device-1" });
  repositories.push(repository);
  const workPackage: WorkPackage = { packageId: `package-${name}`, technicianId: "tech-1", deviceId: "device-1", version: 1, downloadedAt: "2026-09-12T09:00:00.000Z", orders: [cutOrder] };
  await repository.savePackage(workPackage);
  return repository;
}

function authGrant(operationId: string) {
  return { authorizationId: `auth-${operationId}`, token: "opaque", orderId: "order-sync", technicianId: "tech-1", deviceId: "device-1", operationId, version: 1, issuedAt: "2026-09-12T09:00:00.000Z", expiresAt: "2026-09-12T09:05:00.000Z" };
}

async function persistUncertain(repository: IndexedDbLocalRepository, operationId: string) {
  const authorization = new MockAuthorizationAdapter();
  authorization.requestResponse = { status: "authorized", grant: authGrant(operationId) };
  authorization.consumeError = new ResponseLostError();
  authorization.lookupResponse = { status: "unknown", operationId };
   const result = await executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: `evidence-${operationId}`, orderId: "order-sync", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture(operationId) });
  expect(result.outcome).toBe("physical_unknown");
  await expect(repository.getEvidence(`evidence-${operationId}`)).resolves.toMatchObject({ operationId, orderId: "order-sync" });
}

describe("durable sync engine", () => {
  it("looks up uncertain operation before forwarding it", async () => {
    const repository = await setup("sync-lookup");
    await persistUncertain(repository, "operation-lookup-00000000-0000-4000-8000-000000000017");
    const transport = new MockSyncTransport();
    transport.response = { status: "acknowledged", operationId: "operation-lookup-00000000-0000-4000-8000-000000000017" };
    transport.lookupResponse = { status: "not_found", operationId: "operation-lookup-00000000-0000-4000-8000-000000000017" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    const report = await engine.syncOnce();
    expect(report.synced).toBe(1);
    expect(transport.lookups).toEqual(["operation-lookup-00000000-0000-4000-8000-000000000017"]);
    expect(transport.sent.map((item) => item.operationId)).toEqual(["operation-lookup-00000000-0000-4000-8000-000000000017"]);
    expect(await repository.listSyncItems()).toMatchObject([{ status: "synced", uncertain: false, attempts: 1 }]);
  });

  it("does not forward when lookup confirms remote processing", async () => {
    const repository = await setup("sync-confirmed");
    await persistUncertain(repository, "operation-confirmed-00000000-0000-4000-8000-000000000018");
    const transport = new MockSyncTransport();
    transport.lookupResponse = { status: "confirmed", operationId: "operation-confirmed-00000000-0000-4000-8000-000000000018" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    await engine.syncOnce();
    expect(transport.lookups).toEqual(["operation-confirmed-00000000-0000-4000-8000-000000000018"]);
    expect(transport.sent).toHaveLength(0);
    expect(await repository.listSyncItems()).toMatchObject([{ status: "synced", uncertain: false, attempts: 1 }]);
  });

  it("preserves local and remote versions as conflict", async () => {
    const repository = await setup("sync-conflict");
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: authGrant("operation-conflict-00000000-0000-4000-8000-000000000019") };
     const result = await executeCut({ repository, authorization, order: cutOrder, operationId: "operation-conflict-00000000-0000-4000-8000-000000000019", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: "evidence-conflict", orderId: "order-sync", operationId: "operation-conflict-00000000-0000-4000-8000-000000000019", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture("operation-conflict-00000000-0000-4000-8000-000000000019") });
    expect(result.outcome).toBe("executed");
    const transport = new MockSyncTransport();
    transport.response = { status: "conflict", operationId: "operation-conflict-00000000-0000-4000-8000-000000000019", remote: { status: "already_processed" }, reason: "REMOTE_ORDER_CHANGED" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    await engine.syncOnce();
    expect(await repository.listConflicts()).toMatchObject([{ operationId: "operation-conflict-00000000-0000-4000-8000-000000000019", remote: { status: "already_processed" } }]);
    expect(await repository.listSyncItems()).toMatchObject([{ status: "failed", errorCode: "REMOTE_CONFLICT" }]);
  });

  it("retries the legacy local-photo conflict without deleting the local evidence", async () => {
    const repository = await setup("sync-local-photo-retry");
    const operationId = "operation-local-photo-retry-00000000-0000-4000-8000-00000000001f";
    const evidenceId = "evidence-local-photo-retry";
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: authGrant(operationId) };
    const result = await executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId, orderId: "order-sync", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture(operationId) });
    expect(result.outcome).toBe("executed");

    const transport = new MockSyncTransport();
    transport.response = { status: "conflict", operationId, remote: { code: "CONFLICT", message: LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON }, reason: "CONFLICT" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    await expect(engine.syncOnce()).resolves.toMatchObject({ failed: 1 });
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "failed", manualReview: true }]);
    await expect(repository.getEvidence(evidenceId)).resolves.toMatchObject({ evidenceId, operationId });

    transport.response = { status: "acknowledged", operationId };
    await expect(engine.syncOnce()).resolves.toMatchObject({ synced: 1 });
    expect(transport.sent).toHaveLength(2);
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "synced", manualReview: false }]);
    await expect(repository.getEvidence(evidenceId)).resolves.toMatchObject({ evidenceId, operationId });
  });

  it("does not work while offline and keeps pending queue", async () => {
    const repository = await setup("sync-offline");
    const authorization = new MockAuthorizationAdapter({ mode: "offline" });
     const result = await executeCut({ repository, authorization, order: cutOrder, operationId: "operation-offline-00000000-0000-4000-8000-00000000001a", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: "evidence-offline", orderId: "order-sync", operationId: "operation-offline-00000000-0000-4000-8000-00000000001a", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture("operation-offline-00000000-0000-4000-8000-00000000001a") });
    expect(result.outcome).toBe("visit_recorded");
    expect((await repository.listSyncItems())[0].status).toBe("pending");
    const transport = new MockSyncTransport({ mode: "offline" });
    const report = await new SyncEngine(repository, new MockConnectivity("offline"), transport).syncOnce();
    expect(report.processed).toBe(0);
    expect(transport.sent).toHaveLength(0);
  });

  it("serializes blocked visits as VISIT with attempted action separated", async () => {
    const repository = await setup("sync-visit-payload");
    const authorization = new MockAuthorizationAdapter({ mode: "offline" });
     const result = await executeCut({ repository, authorization, order: cutOrder, operationId: "operation-visit-payload-00000000-0000-4000-8000-00000000001b", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: "evidence-visit", orderId: "order-sync", operationId: "operation-visit-payload-00000000-0000-4000-8000-00000000001b", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture("operation-visit-payload-00000000-0000-4000-8000-00000000001b") });
    expect(result.outcome).toBe("visit_recorded");
    const transport = new MockSyncTransport();
    transport.response = { status: "acknowledged", operationId: "operation-visit-payload-00000000-0000-4000-8000-00000000001b" };
    await new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce();
    expect(transport.sent[0]).toMatchObject({ action: "VISIT", attemptedAction: "CUT", operationId: "operation-visit-payload-00000000-0000-4000-8000-00000000001b" });
  });

  it("sends deferred authorization data and confirms local state after server acknowledgement", async () => {
    const repository = await setup("sync-deferred-cut");
    const operationId = "operation-deferred-cut-00000000-0000-4000-8000-00000000001e";
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = {
      status: "authorized",
      grant: {
        authorizationId: "auth-deferred-cut",
        token: "opaque-deferred-token",
        orderId: "order-sync",
        technicianId: "tech-1",
        deviceId: "device-1",
        operationId,
        version: 1,
        issuedAt: "2026-09-12T09:00:00.000Z",
        expiresAt: "2026-09-12T09:05:00.000Z",
        consumption: "deferred",
      },
    };
    const result = await executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: "evidence-deferred-cut", orderId: "order-sync", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture(operationId) });
    expect(result.outcome).toBe("pending_sync");

    const transport = new MockSyncTransport();
    transport.response = { status: "acknowledged", operationId };
    const report = await new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce();

    expect(report.synced).toBe(1);
    expect(transport.sent[0]).toMatchObject({ orderVersion: 1, authorizationId: "auth-deferred-cut", authorizationToken: "opaque-deferred-token" });
    await expect(repository.getRecord(operationId)).resolves.toMatchObject({ status: "CONFIRMED", physicalStatus: "CONFIRMED", syncStatus: "synced" });
    await expect(repository.getOrder("order-sync")).resolves.toMatchObject({ status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 2 });
  });

  it("keeps ack id mismatch uncertain and never retries manual-review conflict", async () => {
    const repository = await setup("sync-id-mismatch");
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: authGrant("operation-id-mismatch-00000000-0000-4000-8000-00000000001c") };
     await executeCut({ repository, authorization, order: cutOrder, operationId: "operation-id-mismatch-00000000-0000-4000-8000-00000000001c", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: "evidence-mismatch", orderId: "order-sync", operationId: "operation-id-mismatch-00000000-0000-4000-8000-00000000001c", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture("operation-id-mismatch-00000000-0000-4000-8000-00000000001c") });
    const mismatchTransport = new MockSyncTransport();
    mismatchTransport.response = { status: "acknowledged", operationId: "wrong-operation" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), mismatchTransport, { owner: "mismatch-owner" });
    await engine.syncOnce();
    expect(await repository.listSyncItems()).toMatchObject([{ status: "failed", uncertain: true, errorCode: "RESPONSE_OPERATION_ID_MISMATCH" }]);

    const conflictRepository = await setup("sync-manual-review");
    const conflictAuthorization = new MockAuthorizationAdapter();
    conflictAuthorization.requestResponse = { status: "authorized", grant: authGrant("operation-manual-00000000-0000-4000-8000-00000000001d") };
     await executeCut({ repository: conflictRepository, authorization: conflictAuthorization, order: cutOrder, operationId: "operation-manual-00000000-0000-4000-8000-00000000001d", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: "evidence-manual", orderId: "order-sync", operationId: "operation-manual-00000000-0000-4000-8000-00000000001d", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture("operation-manual-00000000-0000-4000-8000-00000000001d") });
    const conflictTransport = new MockSyncTransport();
    conflictTransport.response = { status: "conflict", operationId: "operation-manual-00000000-0000-4000-8000-00000000001d", remote: { state: "different" }, reason: "STATE_CONFLICT" };
    const conflictEngine = new SyncEngine(conflictRepository, new MockConnectivity("online"), conflictTransport, { owner: "manual-owner" });
    await conflictEngine.syncOnce();
    await conflictEngine.syncOnce();
    expect(conflictTransport.sent).toHaveLength(1);
    expect(await conflictRepository.listSyncItems()).toMatchObject([{ status: "failed", manualReview: true }]);
  });

  it("looks up recovered cut intents before send", async () => {
    const repository = await setup("sync-recovered-intent");
    const operationId = "operation-recovered-00000000-0000-4000-8000-000000000027";
    const operation: OperationRecord = {
      operationId,
      kind: "CUT",
      action: "CUT",
      orderId: "order-sync",
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
     await repository.claimCut({ operation, order: { ...cutOrder, physicalStatus: "CLAIMED", version: 2 }, syncItem: { operationId, action: "CUT", orderId: "order-sync", technicianId: "tech-1", deviceId: "device-1", status: "pending", attempts: 0 } }, 1);
    const authorization = new MockAuthorizationAdapter();
    authorization.lookupResponse = { status: "unknown", operationId };
    await expect(executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:02:00.000Z" })).resolves.toMatchObject({ outcome: "physical_unknown" });
    await expect(repository.getRecord(operationId)).resolves.toMatchObject({ status: "PHYSICAL_UNKNOWN", syncStatus: "failed" });
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "failed", uncertain: true }]);

    const transport = new MockSyncTransport();
    transport.lookupResponse = { status: "not_found", operationId };
    const report = await new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce();
    expect(report.synced).toBe(1);
    expect(transport.lookups).toEqual([operationId]);
    expect(transport.sent).toHaveLength(1);
  });

  it("recovers pending claimed intents before lookup and never sends them", async () => {
    const repository = await setup("sync-pending-intent");
    const operationId = "operation-pending-00000000-0000-4000-8000-000000000028";
    const operation: OperationRecord = {
      operationId,
      kind: "CUT",
      action: "CUT",
      orderId: "order-sync",
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
    await repository.claimCut({ operation, order: { ...cutOrder, physicalStatus: "CLAIMED", version: 2 }, syncItem: { operationId, action: "CUT", orderId: "order-sync", technicianId: "tech-1", deviceId: "device-1", status: "pending", uncertain: false, attempts: 0 } }, 1);
    const transport = new MockSyncTransport();
    transport.lookupResponse = { status: "not_found", operationId };
    const report = await new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce();
    expect(report.failed).toBe(1);
    expect(transport.lookups).toEqual([operationId]);
    expect(transport.sent).toHaveLength(0);
    await expect(repository.getRecord(operationId)).resolves.toMatchObject({ status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN", syncStatus: "failed" });
    await expect(repository.getOrder("order-sync")).resolves.toMatchObject({ physicalStatus: "PHYSICAL_UNKNOWN", version: 3 });
  });
});

function validFieldCapture(operationId: string) {
  return {
    reading: { value: 123.45, unit: "kWh" as const, meterId: "MED-1", recordedAt: "2026-09-12T09:01:00.000Z", status: "CAPTURED" as const },
    location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: "2026-09-12T09:01:00.000Z", status: "CAPTURED" as const },
    cutType: "RED" as const,
    nearbyMeters: false,
    operationId,
  };
}
