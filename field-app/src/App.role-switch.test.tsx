import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { Session } from "./domain";
import type { AppHeaderRoleSwitch } from "./ui/AppHeader";

// Exercise actual App callbacks with the same effect scheduler used by request tests.
const runtime = vi.hoisted(() => ({ slots: new Map<string, unknown[]>(), scope: "root", cursor: 0, effects: [] as (() => void)[], client: {} as Record<string, ReturnType<typeof vi.fn>>, session: undefined as Session | undefined }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const slots = runtime.slots.get(runtime.scope)!;
    const index = runtime.cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef(initial: unknown) { const slots = runtime.slots.get(runtime.scope)!; return slots[runtime.cursor++] ??= { current: initial }; },
  useEffect(effect: () => void | (() => void), dependencies?: unknown[]) {
    const slots = runtime.slots.get(runtime.scope)!;
    const index = runtime.cursor++;
    const old = slots[index] as { dependencies?: unknown[]; cleanup?: () => void } | undefined;
    if (!old || !dependencies || dependencies.some((value, i) => !Object.is(value, old.dependencies?.[i]))) {
      runtime.effects.push(() => { old?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() }; });
    }
  },
}));
vi.mock("./adapters/http", () => ({ HttpPilotClient: class { constructor() { return runtime.client; } } }));
vi.mock("./application/session-persistence", () => ({ readStoredSession: () => runtime.session, persistSession: vi.fn(), clearStoredSession: vi.fn() }));

const admin: Session = { sessionId: "session-dual", userId: "dual-user-fixture", username: "dual-role-fixture", displayName: "Dual Role Fixture", role: "ADMIN", roles: ["ADMIN", "TECHNICIAN"], permissions: ["CREATE_ORDER"], issuedAt: "2026-10-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", authenticity: "PILOT_PROVISIONAL" };
const technician: Session = { ...admin, role: "TECHNICIAN", permissions: ["DOWNLOAD_ASSIGNED"] };
type Surface = ReactElement<{ session: Session; roleSwitch?: AppHeaderRoleSwitch }>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function setup(session = admin) {
  vi.resetModules();
  vi.stubEnv("VITE_PILOT_BACKEND_URL", "http://pilot.test");
  runtime.session = session;
  runtime.slots = new Map([["root", []], ["connected", []]]);
  runtime.effects = [];
  runtime.client = { restoreSession: vi.fn(), currentSession: vi.fn().mockResolvedValue(session), switchRole: vi.fn(), logout: vi.fn().mockResolvedValue(undefined) };
  const { App } = await import("./App");
  const render = (): Surface => {
    runtime.scope = "root"; runtime.cursor = 0;
    const root = App();
    const connected = root.props.children[0] as ReactElement<Record<string, unknown>>;
    runtime.scope = "connected"; runtime.cursor = 0;
    const surface = (connected.type as (props: Record<string, unknown>) => Surface)(connected.props);
    for (const effect of runtime.effects.splice(0)) effect();
    return surface;
  };
  render(); await settle();
  return { render };
}
afterEach(() => { vi.unstubAllEnvs(); runtime.slots.clear(); });

describe("connected profile role switch", () => {
  it("keeps current surface until confirmation, prevents duplicate clicks, switches back with same identity", async () => {
    const { render } = await setup();
    const pending = deferred<Session>();
    runtime.client.switchRole.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(admin);
    const action = render().props.roleSwitch!;
    action.onSelect(); action.onSelect();
    expect(runtime.client.switchRole).toHaveBeenCalledTimes(1);
    expect(render().props.session.role).toBe("ADMIN");
    expect(render().props.roleSwitch?.busy).toBe(true);
    pending.resolve(technician); await settle();
    const field = render();
    expect(field.props.session).toMatchObject({ userId: admin.userId, sessionId: admin.sessionId, role: "TECHNICIAN" });
    expect(field.props.roleSwitch?.label).toBe("Cambiar a Administrador");
    field.props.roleSwitch!.onSelect(); await settle();
    expect(render().props.session.role).toBe("ADMIN");
    expect(runtime.client.switchRole).toHaveBeenLastCalledWith(technician, "ADMIN");
  });

  it("hides switch for single-role account; rejected switch retains role and permits retry", async () => {
    const single = await setup({ ...admin, roles: ["ADMIN"] });
    expect(single.render().props.roleSwitch).toBeUndefined();
    const { render } = await setup();
    runtime.client.switchRole.mockRejectedValueOnce(new Error("Solicite ambos permisos al administrador."));
    render().props.roleSwitch!.onSelect(); await settle();
    const unchanged = render();
    expect(unchanged.props.session.role).toBe("ADMIN");
    expect(unchanged.props.roleSwitch).toMatchObject({ busy: false, error: "Solicite ambos permisos al administrador." });
    runtime.client.switchRole.mockResolvedValueOnce(technician);
    unchanged.props.roleSwitch!.onSelect(); await settle();
    expect(render().props.session.role).toBe("TECHNICIAN");
  });

  it("recovers lost switch response from authoritative session; failed recovery preserves role", async () => {
    const { render } = await setup();
    const unknown = Object.assign(new Error("Network unknown"), { name: "NetworkUnknownError" });
    runtime.client.switchRole.mockRejectedValueOnce(unknown);
    runtime.client.currentSession.mockResolvedValueOnce(technician);
    render().props.roleSwitch!.onSelect(); await settle();
    expect(render().props.session.role).toBe("TECHNICIAN");
    runtime.client.switchRole.mockRejectedValueOnce(unknown);
    runtime.client.currentSession.mockRejectedValueOnce(unknown);
    render().props.roleSwitch!.onSelect(); await settle();
    expect(render().props.session.role).toBe("TECHNICIAN");
    expect(render().props.roleSwitch?.error).toContain("reintente o recargue");
  });
});
