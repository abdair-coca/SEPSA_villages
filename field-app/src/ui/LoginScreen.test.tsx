import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { LoginScreen } from "./LoginScreen";
import type { Session } from "../domain";
import type { IdentityPort } from "../ports";
import { REMEMBERED_USERNAME_STORAGE_KEY } from "../application/session-persistence";

// Exercise component callbacks without a DOM dependency. A render explicitly flushes state;
// submitting twice before that render reproduces the event race a disabled button cannot stop.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === "function" ? value(hooks.slots[index]) : value; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    return hooks.slots[index] ??= { current: initial };
  },
}));

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children)];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const session: Session = { sessionId: "login-session", userId: "admin", username: "admin", role: "ADMIN", permissions: [], authenticity: "SIMULATED", issuedAt: "2026-09-29", expiresAt: "2026-10-06" };

function setup(authenticate: IdentityPort["authenticate"]) {
  const onAuthenticated = vi.fn();
  const render = () => {
    hooks.cursor = 0;
    return elements(LoginScreen({ authority: { authenticate, authorize: vi.fn() }, onAuthenticated }));
  };
  const field = (type?: string) => render().find((node) => node.type === "input" && node.props.type === type)!;
  (field().props.onChange as Function)({ target: { value: " admin " } });
  (field("password").props.onChange as Function)({ target: { value: "private-password" } });
  const submit = () => (render().find((node) => node.type === "form")!.props.onSubmit as Function)({ preventDefault() {} }) as Promise<void>;
  return { render, submit, onAuthenticated };
}

afterEach(() => { hooks.slots = []; vi.unstubAllGlobals(); });

describe("login attempts", () => {
  it("rejects a duplicate submit before React renders busy state", async () => {
    const pending = deferred<Session>();
    const authenticate = vi.fn(() => pending.promise);
    const { render, onAuthenticated } = setup(authenticate);
    const submit = render().find((node) => node.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>;
    const first = submit({ preventDefault() {} });
    const duplicate = submit({ preventDefault() {} });
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(render().find((node) => node.type === "button")!.props.disabled).toBe(true);
    pending.resolve(session);
    await Promise.all([first, duplicate]);
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });

  it("clears a previous failure when retry starts, permits retry after rejection", async () => {
    const retry = deferred<Session>();
    const authenticate = vi.fn().mockRejectedValueOnce(new Error("Credenciales inválidas")).mockReturnValueOnce(retry.promise);
    const { render, submit } = setup(authenticate);
    await submit();
    expect(render().some((node) => node.props.role === "alert")).toBe(true);
    const attempt = submit();
    expect(render().some((node) => node.props.role === "alert")).toBe(false);
    expect(authenticate).toHaveBeenCalledTimes(2);
    retry.reject(new Error("Sin conexión"));
    await attempt;
    expect(render().find((node) => node.props.role === "alert")!.props.children).toBe("Sin conexión");
    expect(render().find((node) => node.type === "button")!.props.disabled).toBe(false);
  });

  it.each([true, false])("remembers username only when preference is %s; never stores password", async (remember) => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const { render, submit } = setup(vi.fn().mockResolvedValue(session));
    (render().find((node) => node.props.type === "checkbox")!.props.onChange as Function)({ target: { checked: remember } });
    await submit();
    if (remember) expect(storage.setItem).toHaveBeenCalledWith(REMEMBERED_USERNAME_STORAGE_KEY, "admin");
    else expect(storage.removeItem).toHaveBeenCalledWith(REMEMBERED_USERNAME_STORAGE_KEY);
    expect(JSON.stringify(storage.setItem.mock.calls)).not.toContain("private-password");
  });
});
