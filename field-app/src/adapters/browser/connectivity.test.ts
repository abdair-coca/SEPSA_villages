import { describe, expect, it, vi } from "vitest";
import { BrowserConnectivity } from "./connectivity";

describe("BrowserConnectivity", () => {
  it("detects online mode on fast response", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(null, { status: 200 });
    });

    const connectivity = new BrowserConnectivity({
      fetchFn: mockFetch as unknown as typeof fetch,
      weakThresholdMs: 500,
      timeoutMs: 1000,
    });
    connectivity.stop();

    const mode = await connectivity.probe();
    expect(mode).toBe("online");
    expect(connectivity.mode()).toBe("online");
  });

  it("detects weak mode on slow response exceeding weak threshold", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return new Response(null, { status: 200 });
    });

    const connectivity = new BrowserConnectivity({
      fetchFn: mockFetch as unknown as typeof fetch,
      weakThresholdMs: 30,
      timeoutMs: 200,
    });
    connectivity.stop();

    const mode = await connectivity.probe();
    expect(mode).toBe("weak");
    expect(connectivity.mode()).toBe("weak");
  });

  it("detects offline mode on network error or rejection", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const connectivity = new BrowserConnectivity({
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 100,
    });
    connectivity.stop();

    const mode = await connectivity.probe();
    expect(mode).toBe("offline");
    expect(connectivity.mode()).toBe("offline");
  });

  it("notifies subscribers when mode changes", async () => {
    let shouldFail = false;
    const mockFetch = vi.fn().mockImplementation(async () => {
      if (shouldFail) throw new Error("Offline");
      return new Response(null, { status: 200 });
    });

    const connectivity = new BrowserConnectivity({
      fetchFn: mockFetch as unknown as typeof fetch,
      weakThresholdMs: 100,
      timeoutMs: 150,
    });
    connectivity.stop();

    const modesReceived: string[] = [];
    connectivity.subscribe((mode) => modesReceived.push(mode));

    await connectivity.probe(); // online
    shouldFail = true;
    await connectivity.probe(); // offline

    expect(modesReceived).toContain("offline");
  });
});
