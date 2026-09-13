import { describe, expect, it } from "vitest";
import { MockAuthorizationAdapter } from ".";
import { withRetries } from "./retry";

describe("mock connectivity retry policy", () => {
  it("uses three attempts without waiting in tests when offline", async () => {
    const adapter = new MockAuthorizationAdapter({ mode: "offline", retryPolicy: { timeoutMs: 0, sleep: async () => undefined } });
    await expect(adapter.requestCut({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "operation-1" })).rejects.toMatchObject({ code: "NETWORK_UNKNOWN" });
    expect(adapter.requestAttempts).toBe(3);
  });

  it("recovers on weak signal after an injected delay", async () => {
    const delays: number[] = [];
    const adapter = new MockAuthorizationAdapter({ mode: "weak", retryPolicy: { timeoutMs: 0, sleep: async (milliseconds) => { delays.push(milliseconds); } } });
    adapter.requestResponse = { status: "unknown" };
    await expect(adapter.requestCut({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "operation-1" })).resolves.toMatchObject({ status: "unknown" });
    expect(adapter.requestAttempts).toBe(2);
    expect(delays).toEqual([1_000]);
  });

  it("aborts timed-out attempt before starting next attempt", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = withRetries(async (_attempt, signal) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      active -= 1;
      throw new Error("cancelled");
    }, { attempts: 3, timeoutMs: 1, sleep: async () => undefined });
    await expect(result).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(maximumActive).toBe(1);
  });

  it("does not retry physical consume and rejects token reuse", async () => {
    const adapter = new MockAuthorizationAdapter({ retryPolicy: { timeoutMs: 0, sleep: async () => undefined } });
    const grant = { authorizationId: "auth-1", token: "token-1", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "operation-1", version: 1, issuedAt: "2026-09-12T09:00:00.000Z", expiresAt: "2026-09-12T09:05:00.000Z" };
    adapter.requestResponse = { status: "authorized", grant };
    await adapter.requestCut({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "operation-1" });
    const request = { authorizationId: "auth-1", token: "token-1", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "operation-1", version: 1 };
    await expect(adapter.consumeCut(request)).resolves.toMatchObject({ status: "consumed" });
    await expect(adapter.consumeCut(request)).resolves.toMatchObject({ status: "already_consumed" });
    expect(adapter.consumeAttempts).toBe(2);
    await expect(adapter.consumeCut({ ...request, token: "wrong-token" })).resolves.toMatchObject({ status: "not_authorized" });
  });
});
