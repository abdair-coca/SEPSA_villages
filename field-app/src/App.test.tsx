import { describe, expect, it, vi } from "vitest";
import { installMobileBackNavigationGuard } from "./App";

interface FakeHistory {
  state: unknown;
  pushCalls: Array<{ state: unknown; url: string }>;
  goCalls: number[];
}

function fakeWindow(matches: boolean): { target: Window; history: FakeHistory; dispatchPopState: () => void } {
  const listeners = new Set<EventListener>();
  const history: FakeHistory = { state: null, pushCalls: [], goCalls: [] };
  const target = {
    history: {
      get state() { return history.state; },
      pushState(state: unknown, _title: string, url?: string | URL | null) {
        history.state = state;
        history.pushCalls.push({ state, url: String(url ?? "") });
      },
      go(delta: number) { history.goCalls.push(delta); },
    },
    location: { href: "https://example.test/" },
    matchMedia: () => ({ matches }),
    addEventListener: (type: string, listener: EventListener) => { if (type === "popstate") listeners.add(listener); },
    removeEventListener: (type: string, listener: EventListener) => { if (type === "popstate") listeners.delete(listener); },
  } as unknown as Window;
  return { target, history, dispatchPopState: () => { for (const listener of listeners) listener(new Event("popstate")); } };
}

describe("mobile back navigation guard", () => {
  it("does not install on desktop", () => {
    const fake = fakeWindow(false);
    const onRequestExit = vi.fn();

    expect(installMobileBackNavigationGuard(fake.target, onRequestExit)).toBeUndefined();
    expect(fake.history.pushCalls).toHaveLength(0);
    fake.dispatchPopState();
    expect(onRequestExit).not.toHaveBeenCalled();
  });

  it("restores the mobile history entry and requests confirmation on back", () => {
    const fake = fakeWindow(true);
    const onRequestExit = vi.fn();
    const guard = installMobileBackNavigationGuard(fake.target, onRequestExit);

    expect(guard).toBeDefined();
    expect(fake.history.pushCalls).toHaveLength(1);
    fake.dispatchPopState();
    expect(onRequestExit).toHaveBeenCalledTimes(1);
    expect(fake.history.pushCalls).toHaveLength(2);

    fake.dispatchPopState();
    expect(onRequestExit).toHaveBeenCalledTimes(2);
    expect(fake.history.pushCalls).toHaveLength(3);
  });

  it("releases the guard and continues past its synthetic entry on exit", () => {
    const fake = fakeWindow(true);
    const onRequestExit = vi.fn();
    const guard = installMobileBackNavigationGuard(fake.target, onRequestExit);

    guard?.confirmExit();
    expect(fake.history.goCalls).toEqual([-2]);
    fake.dispatchPopState();
    expect(onRequestExit).not.toHaveBeenCalled();
  });
});
