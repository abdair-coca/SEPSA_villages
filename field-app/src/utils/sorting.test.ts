import { describe, expect, it } from "vitest";
import { createDemoPackage } from "../bootstrap/simulated-runtime";
import type { WorkOrder } from "../domain/types";
import type { SyncItem } from "../ports/sync";
import { DEMO_DEVICE_ID, DEMO_TECHNICIAN_ID, type ActivityEntry } from "../state/store";
import { adjacentJourneyOrder, orderJourneyOrders, sortActivityEntries, sortOrdersForNext, sortSyncItemsForDisplay } from "./sorting";

function visitActivity(operationId: string, recordedAt: string): ActivityEntry {
  return {
    record: {
      operationId,
      kind: "VISIT",
      orderId: "ORD-24017",
      technicianId: DEMO_TECHNICIAN_ID,
      deviceId: DEMO_DEVICE_ID,
      action: "VISIT",
      attemptedAction: "CUT",
      execution: "NONE",
      reason: operationId,
      recordedAt,
      evidenceRefs: [],
      attempts: 0,
      syncStatus: "pending",
    },
    evidence: [],
  };
}

function cutActivity(operationId: string, recordedAt: string, effectiveAt: string): ActivityEntry {
  return {
    record: {
      operationId,
      kind: "CUT",
      action: "CUT",
      orderId: "ORD-24017",
      technicianId: DEMO_TECHNICIAN_ID,
      deviceId: DEMO_DEVICE_ID,
      status: "CONFIRMED",
      physicalStatus: "CONFIRMED",
      syncStatus: "synced",
      recordedAt,
      effectiveAt,
      updatedAt: recordedAt,
      attempts: 1,
      evidenceRefs: [],
    },
    evidence: [],
  };
}

describe("chronological activity and queue ordering", () => {
  it("sorts activity by physical occurrence when present, otherwise by record time", () => {
    const activity = [
      visitActivity("visit-old", "2026-09-12T08:00:00.000Z"),
      cutActivity("cut-effective-new", "2026-09-12T07:00:00.000Z", "2026-09-12T12:00:00.000Z"),
      visitActivity("visit-tie-z", "2026-09-12T11:00:00.000Z"),
      visitActivity("visit-tie-a", "2026-09-12T11:00:00.000Z"),
      visitActivity("visit-invalid", "not-a-date"),
    ];

    expect(sortActivityEntries(activity).map((entry) => entry.record.operationId)).toEqual([
      "cut-effective-new",
      "visit-tie-a",
      "visit-tie-z",
      "visit-old",
      "visit-invalid",
    ]);
    expect(sortActivityEntries(activity).slice(0, 3).map((entry) => entry.record.operationId)).toEqual([
      "cut-effective-new",
      "visit-tie-a",
      "visit-tie-z",
    ]);
    expect(activity.map((entry) => entry.record.operationId)).toEqual([
      "visit-old",
      "cut-effective-new",
      "visit-tie-z",
      "visit-tie-a",
      "visit-invalid",
    ]);
  });

  it("sorts the queue by latest update within sync priority and falls back to activity time", () => {
    const activity = [visitActivity("pending-no-update", "2026-09-12T12:00:00.000Z")];
    const items: SyncItem[] = [
      { operationId: "synced-old", action: "VISIT", status: "synced", attempts: 1, updatedAt: "2026-09-12T13:00:00.000Z" },
      { operationId: "pending-old", action: "VISIT", status: "pending", attempts: 0, updatedAt: "2026-09-12T10:00:00.000Z" },
      { operationId: "pending-no-update", action: "VISIT", status: "failed", attempts: 1 },
      { operationId: "pending-new", action: "VISIT", status: "failed", attempts: 1, updatedAt: "2026-09-12T11:00:00.000Z" },
      { operationId: "synced-new", action: "VISIT", status: "synced", attempts: 1, updatedAt: "2026-09-12T14:00:00.000Z" },
      { operationId: "missing-z", action: "VISIT", status: "pending", attempts: 0 },
      { operationId: "missing-a", action: "VISIT", status: "pending", attempts: 0 },
    ];
    const original = items.map((item) => ({ ...item }));

    expect(sortSyncItemsForDisplay(items, activity).map((item) => item.operationId)).toEqual([
      "pending-no-update",
      "pending-new",
      "pending-old",
      "missing-a",
      "missing-z",
      "synced-new",
      "synced-old",
    ]);
    expect(items).toEqual(original);
  });
});

describe("field order journey", () => {
  it("prioritizes pending, review, completed, and cancelled orders", () => {
    const base = createDemoPackage("2026-09-12T10:00:00.000Z").orders[0];
    const orders: WorkOrder[] = [
      { ...base, orderId: "cancelled", status: "ANULADO" },
      { ...base, orderId: "completed", status: "EJECUTADO", physicalStatus: "CONFIRMED" },
      { ...base, orderId: "review", status: "GENERADO", physicalStatus: "PHYSICAL_UNKNOWN" },
      { ...base, orderId: "pending", status: "GENERADO", physicalStatus: "NONE" },
    ];

    expect(sortOrdersForNext(orders).map((order) => order.orderId)).toEqual(["pending", "review", "completed", "cancelled"]);
    expect(orderJourneyOrders(orders).map((order) => order.orderId)).toEqual(["pending", "review", "completed", "cancelled"]);
    const journey = orderJourneyOrders(orders);
    expect(journey.at(0)?.orderId).toBe("pending");
    expect(journey.at(-1)?.orderId).toBe("cancelled");
    expect(adjacentJourneyOrder(journey, 0, 1)?.orderId).toBe("review");
    expect(adjacentJourneyOrder(journey, journey.length - 1, -1)?.orderId).toBe("completed");
    expect(adjacentJourneyOrder(journey, 0, -1)).toBeUndefined();
    expect(adjacentJourneyOrder(journey, journey.length - 1, 1)).toBeUndefined();
  });
});
