import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { executeCut } from "./process";
import { executeOfflineVisit } from "./visit";
import { LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON, SyncEngine, toPayload } from "./sync";
import { IndexedDbLocalRepository, deleteFieldDatabase } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockSyncTransport } from "../adapters/mock";
import { ResponseLostError } from "../ports/authorization";
import type { EvidenceReference, OperationRecord, WorkOrder, WorkPackage } from "../domain";

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
  it("keeps not-found operation uncertain and never forwards it again", async () => {
    const repository = await setup("sync-lookup");
    await persistUncertain(repository, "operation-lookup-00000000-0000-4000-8000-000000000017");
    const transport = new MockSyncTransport();
    transport.lookupResponse = { status: "not_found", operationId: "operation-lookup-00000000-0000-4000-8000-000000000017" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    const report = await engine.syncOnce();
    expect(report.failed).toBe(1);
    expect(transport.lookups).toEqual(["operation-lookup-00000000-0000-4000-8000-000000000017"]);
    expect(transport.sent).toHaveLength(0);
    expect(await repository.listSyncItems()).toMatchObject([{ status: "failed", uncertain: true, attempts: 1 }]);
    const history = await repository.listPhysicalTransitions("operation-lookup-00000000-0000-4000-8000-000000000017");
    expect(history).toMatchObject([
      { actorId: "tech-1", actorRole: "TECHNICIAN", deviceId: "device-1", reason: "PHYSICAL_ACTION_CLAIMED", before: { physicalStatus: "NONE", orderVersion: 1 }, after: { physicalStatus: "CLAIMED", orderVersion: 2 } },
      { actorId: "tech-1", actorRole: "TECHNICIAN", deviceId: "device-1", reason: "RESPONSE_LOST", before: { physicalStatus: "CLAIMED", orderVersion: 2 }, after: { physicalStatus: "PHYSICAL_UNKNOWN", orderVersion: 3 } },
    ]);
    await engine.syncOnce();
    expect(transport.sent).toHaveLength(0);
    expect(await repository.getRecord("operation-lookup-00000000-0000-4000-8000-000000000017")).toMatchObject({ status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN" });
  });

  it("does not forward when lookup confirms remote processing", async () => {
    const repository = await setup("sync-confirmed");
    await persistUncertain(repository, "operation-confirmed-00000000-0000-4000-8000-000000000018");
    const transport = new MockSyncTransport();
    const record = await repository.getRecord("operation-confirmed-00000000-0000-4000-8000-000000000018");
    if (!record || record.kind === "VISIT") throw new Error("Expected physical operation.");
    transport.lookupResponse = { status: "confirmed", ...toPayload(record) };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    await engine.syncOnce();
    expect(transport.lookups).toEqual(["operation-confirmed-00000000-0000-4000-8000-000000000018"]);
    expect(transport.sent).toHaveLength(0);
    expect(await repository.listSyncItems()).toMatchObject([{ status: "synced", uncertain: false, attempts: 1 }]);
  });

  it("reconciles a lost response through one exact lookup without a second send", async () => {
    const repository = await setup("sync-lost-response");
    const operationId = "operation-lost-response-00000000-0000-4000-8000-000000000029";
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: { ...authGrant(operationId), consumption: "deferred" } };
    await executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", exceptionReason: "saltar_control_fotos: prueba sintética", fieldCapture: validFieldCapture(operationId) });
    const transport = new MockSyncTransport();
    transport.response = { status: "unknown", operationId, errorCode: "RESPONSE_LOST" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    await expect(engine.syncOnce()).resolves.toMatchObject({ failed: 1 });
    const unknown = await repository.getRecord(operationId);
    if (!unknown || unknown.kind === "VISIT") throw new Error("Expected physical operation.");
    expect(unknown).toMatchObject({ physicalStatus: "PHYSICAL_UNKNOWN", status: "PHYSICAL_UNKNOWN" });
    transport.lookupResponse = { status: "confirmed", ...toPayload(unknown) };
    await expect(engine.syncOnce()).resolves.toMatchObject({ synced: 1 });
    expect(transport.sent).toHaveLength(1);
    expect(transport.lookups).toEqual([operationId]);
    await expect(repository.getRecord(operationId)).resolves.toMatchObject({ physicalStatus: "CONFIRMED", syncStatus: "synced" });
  });

  it("rejects lookup receipts with mismatched actor, device, order, version, or capture", async () => {
    const overrides = [
      { technicianId: "other-tech" },
      { deviceId: "other-device" },
      { orderId: "other-order" },
      { orderVersion: 2 },
      { fieldCapture: { ...validFieldCapture("x"), reading: { ...validFieldCapture("x").reading, value: 456 } } },
    ];
    for (const [index, override] of overrides.entries()) {
      const repository = await setup(`sync-proof-mismatch-${index}`);
      const operationId = `operation-proof-mismatch-${index}-00000000-0000-4000-8000-00000000002a`;
      await persistUncertain(repository, operationId);
      const record = await repository.getRecord(operationId);
      if (!record || record.kind === "VISIT") throw new Error("Expected physical operation.");
      const transport = new MockSyncTransport();
      transport.lookupResponse = { status: "confirmed", ...toPayload(record), ...override };
      await expect(new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce()).resolves.toMatchObject({ failed: 1 });
      expect(transport.sent).toHaveLength(0);
      await expect(repository.getRecord(operationId)).resolves.toMatchObject({ physicalStatus: "PHYSICAL_UNKNOWN" });
    }
  });

  it("preserves local and remote versions as conflict", async () => {
    const repository = await setup("sync-conflict");
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: authGrant("operation-conflict-00000000-0000-4000-8000-000000000019") };
    const result = await executeCut({ repository, authorization, order: cutOrder, operationId: "operation-conflict-00000000-0000-4000-8000-000000000019", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", exceptionReason: "saltar_control_fotos: prueba sintética", fieldCapture: validFieldCapture("operation-conflict-00000000-0000-4000-8000-000000000019") });
    expect(result.outcome).toBe("executed");
    const transport = new MockSyncTransport();
    transport.response = { status: "conflict", operationId: "operation-conflict-00000000-0000-4000-8000-000000000019", remote: { status: "already_processed" }, reason: "REMOTE_ORDER_CHANGED" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport);
    await engine.syncOnce();
    expect(await repository.listConflicts()).toMatchObject([{ operationId: "operation-conflict-00000000-0000-4000-8000-000000000019", remote: { status: "already_processed" } }]);
    expect(await repository.listSyncItems()).toMatchObject([{ status: "failed", errorCode: "REMOTE_CONFLICT" }]);
  });

  it("keeps a legacy local-photo conflict in review without retrying its cut", async () => {
    const repository = await setup("sync-local-photo-retry");
    const operationId = "operation-local-photo-retry-00000000-0000-4000-8000-00000000001f";
    const evidenceId = "evidence-local-photo-retry";
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: authGrant(operationId) };
    const bytes = new Blob(["synthetic legacy image"], { type: "image/jpeg" });
    const result = await executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId, orderId: "order-sync", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true, content: bytes, contentHash: "a".repeat(64) }, fieldCapture: validFieldCapture(operationId) });
    expect(result.outcome).toBe("executed");

    const transport = new MockSyncTransport();
    transport.response = { status: "conflict", operationId, remote: { code: "CONFLICT", message: LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON }, reason: "CONFLICT" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport, {}, { uploadEvidence: async () => "verified" });
    await expect(engine.syncOnce()).resolves.toMatchObject({ failed: 1 });
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "failed", manualReview: true }]);
    await expect(repository.getEvidence(evidenceId)).resolves.toMatchObject({ evidenceId, operationId });

    await expect(engine.syncOnce()).resolves.toMatchObject({ synced: 0, skipped: 1 });
    expect(transport.sent).toHaveLength(1);
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "failed", manualReview: true }]);
    await expect(repository.getEvidence(evidenceId)).resolves.toMatchObject({ evidenceId, operationId });
  });

  it("uploads durable bytes before CUT and retries interrupted upload idempotently", async () => {
    const repository = await setup("evidence-upload-ordering");
    const operationId = "operation-evidence-upload-00000000-0000-4000-8000-000000000022";
    const bytes = new Blob(["synthetic photo bytes"], { type: "image/jpeg" });
    const contentHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await bytes.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const evidence: EvidenceReference = { evidenceId: "evidence-upload", orderId: "order-sync", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 10, height: 10, optimized: true, content: bytes, contentHash };
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: authGrant(operationId) };
    await executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence, fieldCapture: validFieldCapture(operationId) });
    const events: string[] = [];
    const transport = new MockSyncTransport();
    const send = transport.send.bind(transport);
    transport.send = async (payload) => { events.push("cut"); return send(payload); };
    let interrupted = true;
    const uploader = { uploadEvidence: async () => { events.push("upload"); if (interrupted) { interrupted = false; throw Object.assign(new Error("network interrupted"), { code: "NETWORK_INTERRUPTED" }); } return "verified" as const; } };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), transport, {}, uploader);
    await expect(engine.syncOnce()).resolves.toMatchObject({ failed: 1, synced: 0 });
    expect(events).toEqual(["upload"]);
    await expect(repository.getEvidence("evidence-upload")).resolves.toMatchObject({ uploadStatus: "failed", uploadErrorCode: "NETWORK_INTERRUPTED" });
    await expect(repository.getEvidence("evidence-upload")).resolves.toMatchObject({ contentHash });
    await expect(engine.syncOnce()).resolves.toMatchObject({ synced: 1 });
    expect(events).toEqual(["upload", "upload", "cut"]);
    await expect(repository.getEvidence("evidence-upload")).resolves.toMatchObject({ uploadStatus: "verified" });
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

  it("allows cut authorization with authoritative version after a synced visit", async () => {
    const repository = await setup("sync-visit-then-cut");
    const visitId = "operation-visit-before-cut-00000000-0000-4000-8000-00000000002b";
    await executeOfflineVisit({ repository, order: cutOrder, operationId: visitId, technicianId: "tech-1", deviceId: "device-1", reason: "Visita de verificación", now: "2026-09-12T09:00:00.000Z" });
    const transport = new MockSyncTransport();
    await expect(new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce()).resolves.toMatchObject({ synced: 1 });
    await expect(repository.getOrder("order-sync")).resolves.toMatchObject({ version: 1, physicalStatus: "NONE" });

    const operationId = "operation-cut-after-visit-00000000-0000-4000-8000-00000000002c";
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: { ...authGrant(operationId), consumption: "deferred" } };
    const order = await repository.getOrder("order-sync");
    if (!order) throw new Error("Expected assigned order.");
    const result = await executeCut({ repository, authorization, order, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", evidence: { evidenceId: "evidence-after-visit", orderId: "order-sync", operationId, technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 100, height: 100, optimized: true }, fieldCapture: validFieldCapture(operationId) });
    expect(result.outcome).toBe("pending_sync");
    expect(authorization.requestCalls).toMatchObject([{ orderVersion: 1, operationId }]);
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
    const result = await executeCut({ repository, authorization, order: cutOrder, operationId, technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", exceptionReason: "saltar_control_fotos: prueba sintética", fieldCapture: validFieldCapture(operationId) });
    expect(result.outcome).toBe("pending_sync");

    const transport = new MockSyncTransport();
    transport.response = { status: "acknowledged", operationId };
    const report = await new SyncEngine(repository, new MockConnectivity("online"), transport).syncOnce();

    expect(report.synced).toBe(1);
    expect(transport.sent[0]).toMatchObject({ orderVersion: 1, authorizationId: "auth-deferred-cut", authorizationToken: "opaque-deferred-token" });
    await expect(repository.getRecord(operationId)).resolves.toMatchObject({ status: "CONFIRMED", physicalStatus: "CONFIRMED", syncStatus: "synced" });
    await expect(repository.getOrder("order-sync")).resolves.toMatchObject({ status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 3 });
    await expect(repository.listPhysicalTransitions(operationId)).resolves.toMatchObject([
      { before: { physicalStatus: "NONE", orderVersion: 1 }, after: { physicalStatus: "CLAIMED", orderVersion: 2 } },
      { before: { physicalStatus: "CLAIMED", orderVersion: 2 }, after: { physicalStatus: "CONFIRMED", orderVersion: 3 }, reason: "REMOTE_RECEIPT_VALIDATED" },
    ]);
  });

  it("keeps ack id mismatch uncertain and never retries manual-review conflict", async () => {
    const repository = await setup("sync-id-mismatch");
    const authorization = new MockAuthorizationAdapter();
    authorization.requestResponse = { status: "authorized", grant: authGrant("operation-id-mismatch-00000000-0000-4000-8000-00000000001c") };
     await executeCut({ repository, authorization, order: cutOrder, operationId: "operation-id-mismatch-00000000-0000-4000-8000-00000000001c", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", exceptionReason: "saltar_control_fotos: prueba sintética", fieldCapture: validFieldCapture("operation-id-mismatch-00000000-0000-4000-8000-00000000001c") });
    const mismatchTransport = new MockSyncTransport();
    mismatchTransport.response = { status: "acknowledged", operationId: "wrong-operation" };
    const engine = new SyncEngine(repository, new MockConnectivity("online"), mismatchTransport, { owner: "mismatch-owner" });
    await engine.syncOnce();
    expect(await repository.listSyncItems()).toMatchObject([{ status: "failed", uncertain: true, errorCode: "RESPONSE_OPERATION_ID_MISMATCH" }]);

    const conflictRepository = await setup("sync-manual-review");
    const conflictAuthorization = new MockAuthorizationAdapter();
    conflictAuthorization.requestResponse = { status: "authorized", grant: authGrant("operation-manual-00000000-0000-4000-8000-00000000001d") };
      await executeCut({ repository: conflictRepository, authorization: conflictAuthorization, order: cutOrder, operationId: "operation-manual-00000000-0000-4000-8000-00000000001d", technicianId: "tech-1", deviceId: "device-1", now: "2026-09-12T09:01:00.000Z", exceptionReason: "saltar_control_fotos: prueba sintética", fieldCapture: validFieldCapture("operation-manual-00000000-0000-4000-8000-00000000001d") });
    const conflictTransport = new MockSyncTransport();
    conflictTransport.response = { status: "conflict", operationId: "operation-manual-00000000-0000-4000-8000-00000000001d", remote: { state: "different" }, reason: "STATE_CONFLICT" };
    const conflictEngine = new SyncEngine(conflictRepository, new MockConnectivity("online"), conflictTransport, { owner: "manual-owner" });
    await conflictEngine.syncOnce();
    await conflictEngine.syncOnce();
    expect(conflictTransport.sent).toHaveLength(1);
    expect(await conflictRepository.listSyncItems()).toMatchObject([{ status: "failed", manualReview: true }]);
  });

  it("keeps recovered cut intents unknown when lookup does not find a receipt", async () => {
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
    expect(report.failed).toBe(1);
    expect(transport.lookups).toEqual([operationId]);
    expect(transport.sent).toHaveLength(0);
    await expect(repository.listSyncItems()).resolves.toMatchObject([{ status: "failed", uncertain: true }]);
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
