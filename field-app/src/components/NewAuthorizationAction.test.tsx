import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NewAuthorizationAction } from "./NewAuthorizationAction";
import type { OperationRecord } from "../domain/types";

const base: OperationRecord = { operationId: "reconnection-00000000-0000-4000-8000-000000000001", kind: "RECONNECTION", action: "RECONNECTION", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", status: "PHYSICAL_UNKNOWN", physicalStatus: "PHYSICAL_UNKNOWN", syncStatus: "failed", recordedAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z", attempts: 0, evidenceRefs: [] };

describe("NewAuthorizationAction", () => {
  it("offers a new authorization only after the server proved the previous one was not used", () => {
    expect(renderToStaticMarkup(<NewAuthorizationAction record={base} busy={false} onConfirm={() => undefined} />)).toBe("");
    const proven = { ...base, lastAuthorizationLookup: { status: "expired" as const, at: "2026-10-12T10:05:00.000Z" } };
    expect(renderToStaticMarkup(<NewAuthorizationAction record={proven} busy={false} onConfirm={() => undefined} />)).toContain("Solicitar nueva habilitación");
    expect(renderToStaticMarkup(<NewAuthorizationAction record={{ ...proven, kind: "CUT", action: "CUT" }} busy={false} onConfirm={() => undefined} />)).toContain("Solicitar nueva autorización");
    expect(renderToStaticMarkup(<NewAuthorizationAction record={{ ...proven, status: "BLOCKED" }} busy={false} onConfirm={() => undefined} />)).toBe("");
  });
});
