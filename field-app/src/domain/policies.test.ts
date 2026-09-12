import { describe, expect, it } from "vitest";
import {
  assertAssignedOrder,
  assertCutEligible,
  assertHistoricalOperationImmutable,
  assertReconnectionEligible,
  DomainError,
  nextOrderState,
  validateEvidence,
} from "./index";
import type { OperationRecord, WorkOrder } from "./index";

const generatedOrder: WorkOrder = {
  orderId: "order-1",
  assignedTechnicianId: "tech-1",
  status: "GENERADO",
  physicalStatus: "NONE",
};

const operation: OperationRecord = {
  operationId: "operation-1",
  kind: "CUT",
  action: "CUT",
  orderId: "order-1",
  technicianId: "tech-1",
  deviceId: "device-1",
  status: "CONFIRMED",
  physicalStatus: "CONFIRMED",
  syncStatus: "pending",
  recordedAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
  attempts: 0,
  evidenceRefs: [],
};

describe("field domain policies", () => {
  it("limits operations to assigned orders and valid physical transitions", () => {
    expect(() => assertAssignedOrder(generatedOrder, "other-tech")).toThrowError(DomainError);
    expect(() => assertCutEligible(generatedOrder, "tech-1")).not.toThrow();
    expect(() => assertReconnectionEligible({ ...generatedOrder, status: "EJECUTADO", physicalStatus: "CONFIRMED" }, "tech-1")).not.toThrow();
    expect(nextOrderState("GENERADO", "EJECUTADO")).toBe("EJECUTADO");
    expect(() => nextOrderState("RECONEXIÓN", "EJECUTADO")).toThrowError(DomainError);
  });

  it("requires valid image evidence or a non-empty exception reason", () => {
    expect(validateEvidence({ evidenceId: "image-1", orderId: "order-1", operationId: "operation-1", mimeType: "image/jpeg", width: 2000, height: 2000, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toEqual({
      valid: true,
      requiresOptimization: false,
    });
    expect(validateEvidence(undefined, "Camera unavailable").valid).toBe(true);
    expect(() => validateEvidence(undefined, "  ")).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "", orderId: "order-1", operationId: "operation-1", mimeType: "image/jpeg", width: 1, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-2", orderId: "order-1", operationId: "operation-1", mimeType: "image/jpeg", width: Number.NaN, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-3", orderId: "order-1", operationId: "operation-1", mimeType: "image/jpeg", width: Number.POSITIVE_INFINITY, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-4", orderId: "other-order", operationId: "operation-1", mimeType: "image/jpeg", width: 1, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-5", orderId: "order-1", operationId: "operation-1", mimeType: "image/jpeg", width: 3000, height: 2000, optimized: false }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
  });

  it("preserves historical operation identity", () => {
    expect(() => assertHistoricalOperationImmutable(operation, { ...operation, status: "PHYSICAL_UNKNOWN" })).not.toThrow();
    expect(() => assertHistoricalOperationImmutable(operation, { ...operation, orderId: "other-order" })).toThrowError(DomainError);
  });
});
