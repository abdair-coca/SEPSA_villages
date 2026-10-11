import { describe, expect, it } from "vitest";
import type { AppStore } from "./store";
import { syncThenRefreshAssigned } from "./field-commands";

describe("sync before refreshing assigned orders", () => {
  it("syncs every pending queue action before refreshing assigned orders", async () => {
    const events: string[] = [];
    let syncItems = [
      { operationId: "pending-cut", status: "failed" as const, attempts: 1, action: "CUT" as const },
      { operationId: "pending-visit", status: "pending" as const, attempts: 0, action: "VISIT" as const },
      { operationId: "pending-reconnection", status: "failed" as const, attempts: 2, action: "RECONNECTION" as const },
    ];
    const store = {
      getSnapshot: () => ({ syncItems }),
      sync: async () => { events.push("sync"); syncItems = []; },
    } as unknown as AppStore;

    await syncThenRefreshAssigned(store, async () => { events.push("refresh"); });

    expect(events).toEqual(["sync", "refresh"]);
  });

  it("keeps failed pending work and reports missing server acknowledgment", async () => {
    const queued = { operationId: "pending-unsent", status: "pending" as const, attempts: 0, action: "VISIT" as const, errorCode: "NETWORK_UNAVAILABLE" };
    const syncItems = [queued];
    let refreshed = false;
    const store = {
      getSnapshot: () => ({ syncItems }),
      sync: async () => undefined,
    } as unknown as AppStore;

    await expect(syncThenRefreshAssigned(store, async () => { refreshed = true; })).rejects.toThrow(
      "El servidor no confirmó 1 operación(es) pendiente(s) (NETWORK_UNAVAILABLE). Los registros y evidencias siguen guardados en este dispositivo.",
    );

    expect(refreshed).toBe(false);
    expect(store.getSnapshot().syncItems).toEqual([queued]);
  });
});
