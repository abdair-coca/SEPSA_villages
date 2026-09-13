import { describe, expect, it } from "vitest";
import { executeCut } from "./process";
import { DomainError, type OperationRecord, type WorkOrder, type WorkPackage } from "../domain";
import { ResponseLostError, TimeoutError } from "../ports/authorization";
import type {
  AtomicOperationChange,
  ClaimResult,
  LocalRepository,
  StoredRecord,
} from "../ports/repository";
import { OrderVersionConflictError } from "../ports/repository";
import type {
  AuthorizationAdapter,
  AuthRequest,
  AuthorizationGrant,
  AuthResponse,
  ConsumeRequest,
  ConsumeResponse,
  RemoteResult,
} from "../ports/authorization";

type ConfiguredAuthResponse = Omit<AuthResponse, "operationId"> & { operationId?: string };
type ConfiguredConsumeResponse = Omit<ConsumeResponse, "operationId"> & { operationId?: string };

class MemoryRepository implements LocalRepository {
  readonly claims: AtomicOperationChange[] = [];
  readonly updates: AtomicOperationChange[] = [];
  private readonly records = new Map<string, StoredRecord>();
  private readonly orders = new Map<string, WorkOrder>();

  seed(record: StoredRecord, currentOrder?: WorkOrder) {
    this.records.set(record.operationId, record);
    if (currentOrder) this.orders.set(currentOrder.orderId, currentOrder);
  }

  async getOrder(orderId: string) {
    return this.orders.get(orderId);
  }

  setOrder(nextOrder: WorkOrder) {
    this.orders.set(nextOrder.orderId, nextOrder);
  }

  private assertAtomicChange(change: AtomicOperationChange) {
    const record = change.operation ?? change.visit;
    if (!record) throw new Error("Atomic change must contain a record");
    expect(change.syncItem.operationId).toBe(record.operationId);
    expect(change.syncItem.orderId).toBe(record.orderId);
    expect(change.syncItem.technicianId).toBe(record.technicianId);
    expect(change.syncItem.deviceId).toBe(record.deviceId);
    expect(change.syncItem.status).toBe(record.syncStatus);
    expect(change.syncItem.action).toBe(change.operation?.kind ?? "VISIT");
    if (change.order) {
      expect(change.order.orderId).toBe(record.orderId);
      expect(change.order.assignedTechnicianId).toBe(record.technicianId);
    }
  }

  async getRecord(operationId: string) {
    return this.records.get(operationId);
  }

  async claimCut(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult> {
    this.assertAtomicChange(change);
    const record = change.operation;
    const order = change.order;
    if (!record || !order) throw new Error("Cut claim requires operation and order");
    const existing = this.records.get(record.operationId);
    if (existing) return { status: "existing", record: existing, order: order ? this.orders.get(order.orderId) : undefined };
    const current = this.orders.get(order.orderId);
    if (current && current.version !== expectedOrderVersion) {
      return { status: "order_conflict", currentOrder: current };
    }
    this.claims.push(change);
    this.records.set(record.operationId, record);
    this.orders.set(order.orderId, order);
    return { status: "claimed", record, order };
  }

  async claimVisit(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<ClaimResult> {
    this.assertAtomicChange(change);
    const record = change.visit;
    const order = change.order;
    if (!record) throw new Error("Visit claim requires visit");
    const existing = this.records.get(record.operationId);
    if (existing) return { status: "existing", record: existing, order: order ? this.orders.get(order.orderId) : undefined };
    if (order && expectedOrderVersion !== undefined) {
      const current = this.orders.get(order.orderId);
      if (current && current.version !== expectedOrderVersion) {
        return { status: "order_conflict", currentOrder: current };
      }
    }
    this.claims.push(change);
    this.records.set(record.operationId, record);
    if (order) this.orders.set(order.orderId, order);
    return { status: "claimed", record, order };
  }

  async updateOperationAndOrder(change: AtomicOperationChange, expectedOrderVersion?: number) {
    this.assertAtomicChange(change);
    const record = change.operation ?? change.visit;
    if (!record) throw new Error("Update requires record");
    const current = this.orders.get(record.orderId);
    if (expectedOrderVersion !== undefined && current?.version !== expectedOrderVersion) {
      throw new OrderVersionConflictError();
    }
    if (change.order) {
      if (expectedOrderVersion !== undefined && change.order.version === expectedOrderVersion) {
        throw new Error("Order update must advance version");
      }
      this.orders.set(change.order.orderId, change.order);
    }
    this.updates.push(change);
    this.records.set(record.operationId, record);
  }

  async loadAssignedPackage(): Promise<WorkPackage> {
    throw new Error("Not needed in process tests");
  }

  async listSyncItems() {
    return [];
  }

  async claimSync(): Promise<never> {
    throw new Error("Not needed in process tests");
  }

  async recoverPhysicalUnknown(): Promise<never> {
    throw new Error("Not needed in process tests");
  }

  async updateSyncState(): Promise<never> {
    throw new Error("Not needed in process tests");
  }

  async recordConflictAndFail(): Promise<never> {
    throw new Error("Not needed in process tests");
  }
}

class StubAuthorization implements AuthorizationAdapter {
  lookupCalls: string[] = [];
  requestCalls: AuthRequest[] = [];
  consumeCalls: ConsumeRequest[] = [];
  requestResponse: ConfiguredAuthResponse = { status: "unknown" };
  consumeResponse: ConfiguredConsumeResponse = { status: "consumed" };
  requestResponses = new Map<string, ConfiguredAuthResponse>();
  lookupResponse: RemoteResult = { status: "confirmed" };
  requestError: Error | undefined;
  consumeError: Error | undefined;
  onRequest: ((input: AuthRequest) => void) | undefined;
  onConsume: ((input: ConsumeRequest) => void) | undefined;

  async requestCut(input: AuthRequest): Promise<AuthResponse> {
    this.requestCalls.push(input);
    this.onRequest?.(input);
    if (this.requestError) throw this.requestError;
    return { ...(this.requestResponses.get(input.operationId) ?? this.requestResponse), operationId: input.operationId };
  }

  async consumeCut(input: ConsumeRequest): Promise<ConsumeResponse> {
    this.consumeCalls.push(input);
    this.onConsume?.(input);
    if (this.consumeError) throw this.consumeError;
    return { ...this.consumeResponse, operationId: input.operationId };
  }

  async lookup(operationId: string): Promise<RemoteResult> {
    this.lookupCalls.push(operationId);
    return this.lookupResponse;
  }
}

function grant(operationId = "operation-00000000-0000-4000-8000-000000000001", version = 1): AuthorizationGrant {
  return {
    authorizationId: `auth-${operationId}`,
    token: "opaque-token",
    orderId: "order-1",
    technicianId: "tech-1",
    deviceId: "device-1",
    operationId,
    version,
    issuedAt: "2026-09-11T10:00:00.000Z",
    expiresAt: "2026-09-11T10:05:00.000Z",
  };
}

const order: WorkOrder = {
  orderId: "order-1",
  assignedTechnicianId: "tech-1",
  status: "GENERADO",
  physicalStatus: "NONE",
  version: 1,
};

function input(repository: MemoryRepository, authorization: StubAuthorization, operationId: string) {
  return {
    repository,
    authorization,
    order,
    operationId,
    technicianId: "tech-1",
    deviceId: "device-1",
    now: "2026-09-11T10:01:00.000Z",
    evidence: {
      evidenceId: "evidence-1",
      orderId: "order-1",
      operationId,
      technicianId: "tech-1",
      deviceId: "device-1",
      mimeType: "image/jpeg" as const,
      width: 1000,
      height: 1000,
      optimized: true,
    },
    fieldCapture: validFieldCapture(operationId),
  };
}

function validFieldCapture(operationId: string) {
  return {
    reading: { value: 123.45, unit: "kWh" as const, meterId: "MED-1", recordedAt: "2026-09-11T10:01:00.000Z", status: "CAPTURED" as const },
    location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: "2026-09-11T10:01:00.000Z", status: "CAPTURED" as const },
    cutType: "RED" as const,
    nearbyMeters: false,
    operationId,
  };
}

function existingOperation(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    operationId: "operation-00000000-0000-4000-8000-000000000001",
    kind: "CUT",
    action: "CUT",
    orderId: "order-1",
    technicianId: "tech-1",
    deviceId: "device-1",
    status: "CONFIRMED",
    physicalStatus: "CONFIRMED",
    syncStatus: "synced",
    recordedAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    attempts: 1,
    evidenceRefs: ["evidence-1"],
    ...overrides,
  };
}

describe("cut process integration boundaries", () => {
  it("blocks timeout and unknown authorization while recording a pending visit", async () => {
    const timeoutRepository = new MemoryRepository();
    const timeoutAuthorization = new StubAuthorization();
    timeoutAuthorization.requestError = new TimeoutError();

    const timeoutResult = await executeCut(
      input(timeoutRepository, timeoutAuthorization, "operation-timeout-00000000-0000-4000-8000-000000000010"),
    );

    const unknownRepository = new MemoryRepository();
    const unknownAuthorization = new StubAuthorization();
    unknownAuthorization.requestResponse = { status: "unknown" };

    const unknownResult = await executeCut(
      input(unknownRepository, unknownAuthorization, "operation-unknown-00000000-0000-4000-8000-000000000011"),
    );

    expect(timeoutResult.outcome).toBe("visit_recorded");
    expect(unknownResult.outcome).toBe("visit_recorded");
    if (timeoutResult.outcome !== "visit_recorded" || unknownResult.outcome !== "visit_recorded") {
      throw new Error("Expected visits for uncertain authorization responses");
    }
    expect(timeoutResult.visit.syncStatus).toBe("pending");
    expect(timeoutResult.visit.execution).toBe("NONE");
    expect(timeoutResult.visit.attempts).toBe(1);
    expect(timeoutResult.visit.errorCode).toBe("TIMEOUT");
    expect(unknownResult.visit.syncStatus).toBe("pending");
    expect(timeoutAuthorization.consumeCalls).toHaveLength(0);
    expect(unknownAuthorization.consumeCalls).toHaveLength(0);
    expect(timeoutRepository.claims[0].order).toBeUndefined();
    expect(timeoutRepository.claims[0].syncItem).toMatchObject({
      operationId: "operation-timeout-00000000-0000-4000-8000-000000000010",
      orderId: "order-1",
      technicianId: "tech-1",
      deviceId: "device-1",
      status: "pending",
      attempts: 1,
    });
  });

  it("does not consume a second stale operation or overwrite current order state", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };

    const first = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    authorization.requestResponse = {
      status: "authorized",
      grant: grant("operation-00000000-0000-4000-8000-000000000002"),
    };
    authorization.consumeResponse = { status: "already_consumed" };
    const second = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000002"));

    expect(first.outcome).toBe("executed");
    expect(second.outcome).toBe("visit_recorded");
    if (first.outcome !== "executed" || second.outcome !== "visit_recorded") {
      throw new Error("Expected first execution and stale second attempt to be recorded");
    }
    expect(first.operation.physicalStatus).toBe("CONFIRMED");
    expect(second.visit.reason).toBe("ORDER_CLAIM_CONFLICT");
    expect(authorization.consumeCalls.map((call) => call.operationId)).toEqual(["operation-00000000-0000-4000-8000-000000000001"]);
    expect(repository.updates).toHaveLength(1);
    expect(repository.updates[0].order?.version).toBe(3);
    expect(authorization.requestCalls[0]).toMatchObject({
      orderId: "order-1",
      technicianId: "tech-1",
      deviceId: "device-1",
      operationId: "operation-00000000-0000-4000-8000-000000000001",
      orderVersion: 1,
    });
  });

  it("persists deferred authorization without consuming before synchronization", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    const operationId = "operation-deferred-00000000-0000-4000-8000-000000000099";
    authorization.requestResponse = { status: "authorized", grant: { ...grant(operationId), consumption: "deferred" } };

    const result = await executeCut(input(repository, authorization, operationId));

    expect(result.outcome).toBe("pending_sync");
    expect(authorization.consumeCalls).toHaveLength(0);
    expect(result).toMatchObject({ operation: { status: "INTENT_PERSISTED", physicalStatus: "CLAIMED", authorizationToken: "opaque-token", authorizationVersion: 1 } });
  });

  it("treats an already-consumed authorization as physical uncertainty", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };
    authorization.consumeResponse = { status: "already_consumed" };

    const result = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(result.outcome).toBe("physical_unknown");
    expect(authorization.lookupCalls).toEqual(["operation-00000000-0000-4000-8000-000000000001"]);
    expect(repository.updates[0].order?.physicalStatus).toBe("PHYSICAL_UNKNOWN");
    expect(repository.updates[0].syncItem.status).toBe("failed");
    expect(await repository.getOrder("order-1")).toMatchObject({
      status: "GENERADO",
      physicalStatus: "PHYSICAL_UNKNOWN",
      version: 3,
    });
  });

  it("marks a lost response PHYSICAL_UNKNOWN and requires lookup by operation id", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };
    authorization.consumeError = new ResponseLostError();

    const result = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(result.outcome).toBe("physical_unknown");
    if (result.outcome !== "physical_unknown") {
      throw new Error("Expected physical uncertainty");
    }
    expect(result.operation.physicalStatus).toBe("PHYSICAL_UNKNOWN");
    expect(authorization.lookupCalls).toEqual(["operation-00000000-0000-4000-8000-000000000001"]);
    expect(authorization.consumeCalls.map((call) => call.operationId)).toEqual(["operation-00000000-0000-4000-8000-000000000001"]);
    expect(repository.updates[0].order?.physicalStatus).toBe("PHYSICAL_UNKNOWN");
    expect(repository.updates[0].syncItem).toMatchObject({
      operationId: "operation-00000000-0000-4000-8000-000000000001",
      orderId: "order-1",
      technicianId: "tech-1",
      deviceId: "device-1",
      status: "failed",
    });
    expect(repository.claims[0].operation?.evidenceRefs).toEqual(["evidence-1"]);
  });

  it("replays PHYSICAL_UNKNOWN only through lookup and never consumes again", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };
    authorization.consumeError = new ResponseLostError();

    await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));
    const replay = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(replay.outcome).toBe("physical_unknown");
    expect(authorization.lookupCalls).toEqual(["operation-00000000-0000-4000-8000-000000000001", "operation-00000000-0000-4000-8000-000000000001"]);
    expect(authorization.consumeCalls).toHaveLength(1);
    expect(await repository.getOrder("order-1")).toMatchObject({
      physicalStatus: "PHYSICAL_UNKNOWN",
      version: 3,
    });
  });

  it("does not create a duplicate for an already recorded operation id", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };

    await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));
    const duplicate = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(duplicate.outcome).toBe("duplicate");
    expect(authorization.consumeCalls.map((call) => call.operationId)).toEqual(["operation-00000000-0000-4000-8000-000000000001"]);
    expect(authorization.consumeCalls[0]).toMatchObject({
      authorizationId: "auth-operation-00000000-0000-4000-8000-000000000001",
      token: "opaque-token",
      orderId: "order-1",
      technicianId: "tech-1",
      deviceId: "device-1",
      operationId: "operation-00000000-0000-4000-8000-000000000001",
      version: 1,
    });
    expect(repository.claims).toHaveLength(1);
  });

  it("deduplicates blocked visits by operation id before requesting authorization again", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "unknown" };

    const first = await executeCut(input(repository, authorization, "operation-visit-00000000-0000-4000-8000-000000000012"));
    const replay = await executeCut(input(repository, authorization, "operation-visit-00000000-0000-4000-8000-000000000012"));

    expect(first.outcome).toBe("visit_recorded");
    expect(replay.outcome).toBe("visit_recorded");
    expect(authorization.requestCalls).toHaveLength(1);
    expect(repository.claims).toHaveLength(1);
  });

  it("requires evidence or an explicit exception before creating an intent", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();

    await expect(executeCut({
      ...input(repository, authorization, "operation-no-evidence-00000000-0000-4000-8000-000000000013"),
      evidence: undefined,
    })).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });

    expect(authorization.requestCalls).toHaveLength(0);
    expect(repository.claims).toHaveLength(0);
  });

  it("rejects a grant whose version differs from the order version", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant("operation-00000000-0000-4000-8000-000000000001", 2) };

    const result = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(result.outcome).toBe("visit_recorded");
    if (result.outcome !== "visit_recorded") throw new Error("Expected blocked visit");
    expect(result.visit.reason).toBe("AUTHORIZATION_EXPIRED");
    expect(authorization.consumeCalls).toHaveLength(0);
  });

  it("accepts a justified evidence exception and persists its explanation", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = {
      status: "authorized",
      grant: grant("operation-exception-00000000-0000-4000-8000-000000000014"),
    };

    const result = await executeCut({
      ...input(repository, authorization, "operation-exception-00000000-0000-4000-8000-000000000014"),
      evidence: undefined,
      exceptionReason: "Camera unavailable",
    });

    expect(result.outcome).toBe("executed");
    expect(repository.claims[0].operation).toMatchObject({
      evidenceRefs: [],
      exceptionReason: "Camera unavailable",
    });
  });

  it("checks replay binding before eligibility and rejects every mismatched identity", async () => {
    const mismatches: Array<{ operation: OperationRecord; input: ReturnType<typeof input> }> = [
      { operation: existingOperation({ orderId: "other-order" }), input: input(new MemoryRepository(), new StubAuthorization(), "operation-00000000-0000-4000-8000-000000000001") },
      { operation: existingOperation(), input: { ...input(new MemoryRepository(), new StubAuthorization(), "operation-00000000-0000-4000-8000-000000000001"), technicianId: "other-tech" } },
      { operation: existingOperation(), input: { ...input(new MemoryRepository(), new StubAuthorization(), "operation-00000000-0000-4000-8000-000000000001"), deviceId: "other-device" } },
      { operation: existingOperation({ kind: "RECONNECTION", action: "RECONNECTION" }), input: input(new MemoryRepository(), new StubAuthorization(), "operation-00000000-0000-4000-8000-000000000001") },
    ];

    for (const mismatch of mismatches) {
      const repository = mismatch.input.repository;
      repository.seed(mismatch.operation);
      await expect(executeCut(mismatch.input)).rejects.toMatchObject({
        code: "OPERATION_BINDING_MISMATCH",
      });
    }
  });

  it("recovers a persisted claimed intent before lookup without leaving it reenqueuable", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    repository.seed(existingOperation({
      status: "INTENT_PERSISTED",
      physicalStatus: "CLAIMED",
      syncStatus: "pending",
    }), { ...order, physicalStatus: "CLAIMED", version: 2 });

    const result = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(result.outcome).toBe("physical_unknown");
    expect(authorization.lookupCalls).toEqual(["operation-00000000-0000-4000-8000-000000000001"]);
    expect(authorization.consumeCalls).toHaveLength(0);
    expect(repository.claims).toHaveLength(0);
    expect(repository.updates[0].operation).toMatchObject({ status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN", syncStatus: "failed" });
    expect(repository.updates[0].order).toMatchObject({ physicalStatus: "PHYSICAL_UNKNOWN", version: 3 });
    expect(repository.updates[0].syncItem).toMatchObject({ status: "failed", uncertain: true });
  });

  it("persists request-side payment detection as an annulled order", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = {
      status: "payment_detected",
      payment: { reason: "Payment settled remotely", detectedAt: "2026-09-11T10:02:00.000Z" },
    };

    const result = await executeCut(input(repository, authorization, "operation-payment-request-00000000-0000-4000-8000-000000000015"));

    expect(result.outcome).toBe("visit_recorded");
    expect(repository.claims[0].order).toMatchObject({
      status: "ANULADO",
      physicalStatus: "NONE",
      cancellation: {
        reason: "Payment settled remotely",
        detectedAt: "2026-09-11T10:02:00.000Z",
      },
    });
    expect(repository.claims[0].syncItem).toMatchObject({
      action: "VISIT",
      status: "pending",
      attempts: 1,
      errorCode: "Payment settled remotely",
    });
  });

  it("keeps payment visit when order changes during authorization", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = {
      status: "payment_detected",
      payment: { reason: "Payment settled remotely", detectedAt: "2026-09-11T10:02:00.000Z" },
    };
    authorization.onRequest = () => {
      repository.setOrder({ ...order, version: 2 });
    };

    const result = await executeCut(input(repository, authorization, "operation-payment-race-00000000-0000-4000-8000-000000000016"));

    expect(result.outcome).toBe("visit_recorded");
    if (result.outcome !== "visit_recorded") throw new Error("Expected payment visit");
    expect(result.visit.errorCode).toBe("ORDER_VERSION_CONFLICT");
    expect(repository.claims[0].order).toBeUndefined();
    expect(await repository.getOrder("order-1")).toMatchObject({
      status: "GENERADO",
      physicalStatus: "NONE",
      version: 2,
    });
  });

  it("persists consume-side payment detection as an annulled order", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };
    authorization.consumeResponse = {
      status: "payment_detected",
      payment: { reason: "Payment arrived during claim", detectedAt: "2026-09-11T10:03:00.000Z" },
    };

    const result = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(result.outcome).toBe("blocked");
    expect(repository.updates[0].order).toMatchObject({
      status: "ANULADO",
      physicalStatus: "NONE",
      cancellation: {
        reason: "Payment arrived during claim",
        detectedAt: "2026-09-11T10:03:00.000Z",
      },
    });
    expect(repository.updates[0].operation?.cancellation).toEqual({
      reason: "Payment arrived during claim",
      detectedAt: "2026-09-11T10:03:00.000Z",
    });
  });

  it("releases not-authorized claim with CAS", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };
    authorization.consumeResponse = { status: "not_authorized", errorCode: "AUTHORIZATION_REVOKED" };

    const result = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(result.outcome).toBe("blocked");
    expect(repository.updates[0].order).toMatchObject({
      status: "GENERADO",
      physicalStatus: "NONE",
      version: 3,
    });
    expect(await repository.getOrder("order-1")).toMatchObject({
      status: "GENERADO",
      physicalStatus: "NONE",
      version: 3,
    });
  });

  it("preserves current order when not-authorized release CAS fails", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponse = { status: "authorized", grant: grant() };
    authorization.consumeResponse = { status: "not_authorized" };
    authorization.onConsume = () => {
      repository.setOrder({
        ...order,
        status: "EJECUTADO",
        physicalStatus: "CONFIRMED",
        version: 9,
      });
    };

    const result = await executeCut(input(repository, authorization, "operation-00000000-0000-4000-8000-000000000001"));

    expect(result.outcome).toBe("recovery_required");
    expect(repository.updates).toHaveLength(0);
    expect(await repository.getOrder("order-1")).toMatchObject({
      status: "EJECUTADO",
      physicalStatus: "CONFIRMED",
      version: 9,
    });
  });

  it("claims one order through CAS when two operations race", async () => {
    const repository = new MemoryRepository();
    const authorization = new StubAuthorization();
    authorization.requestResponses.set("operation-a-00000000-0000-4000-8000-00000000000a", { status: "authorized", grant: grant("operation-a-00000000-0000-4000-8000-00000000000a") });
    authorization.requestResponses.set("operation-b-00000000-0000-4000-8000-00000000000b", { status: "authorized", grant: grant("operation-b-00000000-0000-4000-8000-00000000000b") });

    const [first, second] = await Promise.all([
      executeCut(input(repository, authorization, "operation-a-00000000-0000-4000-8000-00000000000a")),
      executeCut(input(repository, authorization, "operation-b-00000000-0000-4000-8000-00000000000b")),
    ]);

    expect([first.outcome, second.outcome].sort()).toEqual(["executed", "visit_recorded"]);
    expect(authorization.consumeCalls).toHaveLength(1);
    expect(repository.claims.filter((change) => change.operation?.kind === "CUT")).toHaveLength(1);
    expect(await repository.getOrder("order-1")).toMatchObject({
      status: "EJECUTADO",
      physicalStatus: "CONFIRMED",
      version: 3,
    });
  });
});
