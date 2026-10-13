import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueuePanel } from "./SyncQueue";
import type { AppState, AppStore } from "../state/store";
import type { OperationRecord } from "../domain/types";

function state(record: OperationRecord): AppState {
  return {
    status: "ready", mode: "online", orders: [], activity: [{ record, evidence: [] }], selectedOrderId: null, query: "", filter: "ALL", tab: "queue",
    syncItems: [{ operationId: record.operationId, status: "pending", attempts: 0, action: record.action, orderId: record.orderId, technicianId: record.technicianId, deviceId: record.deviceId }],
  } as AppState;
}

const intent: OperationRecord = { operationId: "reconnection-00000000-0000-4000-8000-000000000001", kind: "RECONNECTION", action: "RECONNECTION", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", status: "INTENT_PERSISTED", physicalStatus: "CLAIMED", syncStatus: "pending", recordedAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z", attempts: 0, evidenceRefs: [], authorizationConsumption: "immediate" };

describe("QueuePanel", () => {
  it.each(["RECONNECTION", "CUT"] as const)("offers verification, not retry, for a %s saved before its authorization was confirmed", (action) => {
    const html = renderToStaticMarkup(<QueuePanel state={state({ ...intent, kind: action, action })} store={{} as AppStore} />);
    expect(html).toContain("Verificar con servidor");
    expect(html).not.toContain("Reintentar");
  });

  it("keeps retry for a confirmed operation that is only pending sync", () => {
    const html = renderToStaticMarkup(<QueuePanel state={state({ ...intent, status: "CONFIRMED", physicalStatus: "CONFIRMED" })} store={{} as AppStore} />);
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("Verificar con servidor");
  });
});
