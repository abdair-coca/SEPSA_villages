import { describe, expect, it } from "vitest";
import {
  assertAssignedOrder,
  assertCan,
  assertCutEligible,
  assertHistoricalOperationImmutable,
  assertOperationId,
  assertReconnectionEligible,
  assertVisitEligible,
  DomainError,
  nextOrderState,
  validateEvidence,
  validateFieldCapture,
} from "./index";
import type { FieldCapture, OperationRecord, Session, WorkOrder } from "./index";

const generatedOrder: WorkOrder = {
  orderId: "order-1",
  assignedTechnicianId: "tech-1",
  status: "GENERADO",
  physicalStatus: "NONE",
};

describe("operation identifiers", () => {
  it("accepts only prefixed UUID identifiers", () => {
    expect(() => assertOperationId("cut-00000000-0000-4000-8000-000000000001")).not.toThrow();
    expect(() => assertOperationId("operation-1")).toThrowError(DomainError);
  });
});

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

const validFieldCapture: FieldCapture = {
  reading: {
    value: 42,
    unit: "kWh",
    meterId: "meter-1",
    recordedAt: "2026-09-11T10:00:00.000Z",
    status: "CAPTURED",
  },
  location: {
    latitude: -17.4,
    longitude: -66.1,
    accuracyMeters: 8,
    recordedAt: "2026-09-11T10:00:00.000Z",
    status: "CAPTURED",
  },
  cutType: "RED",
  nearbyMeters: false,
};

describe("field domain policies", () => {
  it("limits operations to assigned orders and valid physical transitions", () => {
    expect(() => assertAssignedOrder(generatedOrder, "other-tech")).toThrowError(DomainError);
    expect(() => assertCutEligible(generatedOrder, "tech-1")).not.toThrow();
    expect(() => assertVisitEligible(generatedOrder, "tech-1")).not.toThrow();
    expect(() => assertVisitEligible({ ...generatedOrder, status: "EJECUTADO", physicalStatus: "CONFIRMED" }, "tech-1")).toThrowError(DomainError);
    expect(() => assertVisitEligible({ ...generatedOrder, physicalStatus: "PHYSICAL_UNKNOWN" }, "tech-1")).toThrowError(DomainError);
    expect(() => assertReconnectionEligible({ ...generatedOrder, status: "EJECUTADO", physicalStatus: "CONFIRMED" }, "tech-1")).not.toThrow();
    expect(nextOrderState("GENERADO", "EJECUTADO")).toBe("EJECUTADO");
    expect(() => nextOrderState("RECONEXIÓN", "EJECUTADO")).toThrowError(DomainError);
  });

  it("rejects foreign orders and role elevation without changing order data", () => {
    const before = structuredClone(generatedOrder);
    const technician: Session = {
      sessionId: "session-tech",
      userId: "tech-1",
      username: "tech.simulated",
      role: "TECHNICIAN",
      permissions: ["DOWNLOAD_ASSIGNED"],
      issuedAt: "2026-09-12T09:00:00.000Z",
      authenticity: "SIMULATED",
    };

    expect(() => assertAssignedOrder(generatedOrder, "tech-2")).toThrowError(DomainError);
    expect(() => assertCan(technician, "CREATE_ORDER")).toThrowError(DomainError);
    expect(generatedOrder).toEqual(before);
  });

  it("requires valid image evidence or a non-empty exception reason", () => {
    expect(validateEvidence({ evidenceId: "image-1", orderId: "order-1", operationId: "operation-1", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 2000, height: 2000, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toEqual({
      valid: true,
      requiresOptimization: false,
    });
    expect(validateEvidence(undefined, "Camera unavailable").valid).toBe(true);
    expect(() => validateEvidence(undefined, "  ")).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "", orderId: "order-1", operationId: "operation-1", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 1, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-2", orderId: "order-1", operationId: "operation-1", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: Number.NaN, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-3", orderId: "order-1", operationId: "operation-1", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: Number.POSITIVE_INFINITY, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-4", orderId: "other-order", operationId: "operation-1", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 1, height: 1, optimized: true }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
    expect(() => validateEvidence({ evidenceId: "image-5", orderId: "order-1", operationId: "operation-1", technicianId: "tech-1", deviceId: "device-1", mimeType: "image/jpeg", width: 3000, height: 2000, optimized: false }, undefined, { orderId: "order-1", operationId: "operation-1" })).toThrowError(DomainError);
  });

  it("requires reading to match expected order meter", () => {
    expect(() => validateFieldCapture(validFieldCapture, "meter-2")).toThrowError(DomainError);
    expect(() => validateFieldCapture(validFieldCapture, "meter-1")).not.toThrow();
  });

  it("requires finite non-negative GPS accuracy", () => {
    const { accuracyMeters: _accuracyMeters, ...locationWithoutAccuracy } = validFieldCapture.location;
    expect(() => validateFieldCapture({ ...validFieldCapture, location: locationWithoutAccuracy })).toThrowError(DomainError);
    for (const accuracyMeters of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() => validateFieldCapture({ ...validFieldCapture, location: { ...validFieldCapture.location, accuracyMeters } })).toThrowError(DomainError);
    }
  });

  it("rejects invalid GPS coordinates", () => {
    expect(() => validateFieldCapture({ ...validFieldCapture, location: { ...validFieldCapture.location, latitude: 91 } })).toThrowError(DomainError);
  });

  it("rejects invalid cut types", () => {
    expect(() => validateFieldCapture({ ...validFieldCapture, cutType: "INVALID" as FieldCapture["cutType"] })).toThrowError(DomainError);
  });

  it("requires a reading", () => {
    expect(() => validateFieldCapture({ ...validFieldCapture, reading: undefined as unknown as FieldCapture["reading"] })).toThrowError(DomainError);
  });

  it("preserves historical operation identity", () => {
    expect(() => assertHistoricalOperationImmutable(operation, { ...operation, status: "PHYSICAL_UNKNOWN" })).not.toThrow();
    expect(() => assertHistoricalOperationImmutable(operation, { ...operation, orderId: "other-order" })).toThrowError(DomainError);
  });
});
