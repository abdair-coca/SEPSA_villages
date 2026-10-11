import { describe, expect, it, vi } from "vitest";
import { activateDialog, getDialogControls, handleDialogKeyDown, resolveDialogTheme } from "./dialog-lifecycle";

function control({ visible = true, disabled = false, tabIndex = 0, visibility = "visible" } = {}) {
  return {
    tabIndex,
    isConnected: true,
    visibility,
    focus: vi.fn(),
    matches: vi.fn(() => disabled),
    closest: vi.fn((): Element | null => null),
    getClientRects: () => visible ? [{}] : [],
  };
}

function fixture(controls = [control(), control()]) {
  const attributes = new Map<string, string>();
  const background = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    contains: () => false,
  };
  const overflow = { value: "clip", priority: "important" };
  const style = {
    getPropertyValue: () => overflow.value,
    getPropertyPriority: () => overflow.priority,
    setProperty: (_name: string, value: string, priority = "") => Object.assign(overflow, { value, priority }),
    removeProperty: () => Object.assign(overflow, { value: "", priority: "" }),
  };
  const opener = { isConnected: true, focus: vi.fn() };
  const listeners = new Map<string, Set<EventListener>>();
  const dispatch = (name: string, event: Event) => {
    // Snapshot listeners like DOM dispatch: removing one must not hide a competing trap.
    for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
  };
  const rootAttributes = new Map<string, string>();
  const root = {
    getAttribute: (name: string) => rootAttributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => rootAttributes.set(name, value),
    removeAttribute: (name: string) => rootAttributes.delete(name),
    contains: (node: unknown) => controls.includes(node as typeof controls[number]),
  };
  const doc = {
    activeElement: opener,
    body: { children: [background, root], style },
    defaultView: { getComputedStyle: (element: { visibility: string }) => ({ visibility: element.visibility }) },
    addEventListener: vi.fn((name: string, listener: EventListener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    }),
    removeEventListener: vi.fn((name: string, listener: EventListener) => {
      listeners.get(name)?.delete(listener);
      if (!listeners.get(name)?.size) listeners.delete(name);
    }),
  };
  const dialog = { ownerDocument: doc, querySelectorAll: () => controls, focus: vi.fn(), contains: (node: unknown) => controls.includes(node as typeof controls[number]) };
  return { dialog: dialog as unknown as HTMLElement, root: root as unknown as HTMLElement, rootAttributes, doc, controls, opener, attributes, overflow, listeners, dispatch };
}

function key(key: string, shiftKey = false) {
  return { key, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe("dialog keyboard lifecycle", () => {
  it("filters hidden, disabled and negative-tabindex controls", () => {
    const visible = control();
    const f = fixture([control({ visible: false }), control({ disabled: true }), control({ tabIndex: -1 }), control({ visibility: "hidden" }), control({ visibility: "collapse" }), visible]);
    expect(getDialogControls(f.dialog)).toEqual([visible]);
  });

  it("wraps both directions; leaves interior Tab to the browser", () => {
    const f = fixture([control(), control(), control()]);
    f.doc.activeElement = f.controls[2] as unknown as typeof f.opener;
    const forward = key("Tab");
    handleDialogKeyDown(forward as unknown as KeyboardEvent, f.dialog, { onClose: vi.fn() });
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    expect(f.controls[0].focus).toHaveBeenCalledOnce();
    f.doc.activeElement = f.controls[0] as unknown as typeof f.opener;
    const backward = key("Tab", true);
    handleDialogKeyDown(backward as unknown as KeyboardEvent, f.dialog, { onClose: vi.fn() });
    expect(f.controls[2].focus).toHaveBeenCalledOnce();
    f.doc.activeElement = f.controls[1] as unknown as typeof f.opener;
    const interior = key("Tab");
    handleDialogKeyDown(interior as unknown as KeyboardEvent, f.dialog, { onClose: vi.fn() });
    expect(interior.preventDefault).not.toHaveBeenCalled();
  });

  it("recovers escaped focus and handles dialogs with no enabled controls", () => {
    const f = fixture();
    handleDialogKeyDown(key("Tab", true) as unknown as KeyboardEvent, f.dialog, { onClose: vi.fn() });
    expect(f.controls[1].focus).toHaveBeenCalledOnce();
    const empty = fixture([]);
    const event = key("Tab");
    handleDialogKeyDown(event as unknown as KeyboardEvent, empty.dialog, { onClose: vi.fn() });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(empty.dialog.focus).toHaveBeenCalledOnce();
  });

  it("consumes Escape but respects dismissal lock", () => {
    const f = fixture();
    const onClose = vi.fn();
    for (const closeDisabled of [true, false]) {
      const event = key("Escape");
      handleDialogKeyDown(event as unknown as KeyboardEvent, f.dialog, { onClose, closeDisabled });
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledTimes(closeDisabled ? 0 : 1);
    }
  });
});

describe("dialog activation and cleanup", () => {
  it("focuses first control, locks body, isolates background and restores prior states", () => {
    const f = fixture();
    f.attributes.set("inert", "existing");
    const cleanup = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    expect(f.controls[0].focus).toHaveBeenCalledOnce();
    expect(f.attributes.get("inert")).toBe("");
    expect(f.overflow.value).toBe("hidden");
    cleanup();
    expect(f.attributes.get("inert")).toBe("existing");
    expect(f.overflow).toEqual({ value: "clip", priority: "important" });
    expect(f.opener.focus).toHaveBeenCalledOnce();
    expect(f.listeners.size).toBe(0);
    cleanup();
    expect(f.opener.focus).toHaveBeenCalledOnce();
  });

  it("removes added inert, avoids detached opener and uses latest close state", () => {
    const f = fixture();
    f.opener.isConnected = false;
    const oldClose = vi.fn();
    const newClose = vi.fn();
    let options = { onClose: oldClose, closeDisabled: true };
    const cleanup = activateDialog(f.dialog, f.root, () => options);
    options = { onClose: newClose, closeDisabled: false };
    f.dispatch("keydown", key("Escape") as unknown as Event);
    expect(oldClose).not.toHaveBeenCalled();
    expect(newClose).toHaveBeenCalledOnce();
    cleanup();
    expect(f.attributes.has("inert")).toBe(false);
    expect(f.opener.focus).not.toHaveBeenCalled();
  });

  it("contains programmatic focus and falls back to dialog when controls disappear", () => {
    const controls = [control()];
    const f = fixture(controls);
    const cleanup = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    f.dispatch("focusin", { target: f.opener } as unknown as Event);
    expect(controls[0].focus).toHaveBeenCalledTimes(2);
    controls.length = 0;
    f.dispatch("focusin", { target: f.opener } as unknown as Event);
    expect(f.dialog.focus).toHaveBeenCalledOnce();
    cleanup();
  });

  it("restores an absent body overflow declaration", () => {
    const f = fixture([]);
    f.overflow.value = "";
    f.overflow.priority = "";
    const cleanup = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    expect(f.dialog.focus).toHaveBeenCalledOnce();
    cleanup();
    expect(f.overflow.value).toBe("");
  });
});

function overlappingFixture() {
  const f = fixture();
  const upperControls = [control(), control()];
  const upperAttributes = new Map<string, string>();
  const upperRoot = {
    getAttribute: (name: string) => upperAttributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => upperAttributes.set(name, value),
    removeAttribute: (name: string) => upperAttributes.delete(name),
    contains: (node: unknown) => upperControls.includes(node as typeof upperControls[number]),
  };
  const upperDialog = { ownerDocument: f.doc, querySelectorAll: () => upperControls, focus: vi.fn(), contains: upperRoot.contains };
  const enableFocus = (element: { focus: ReturnType<typeof vi.fn> }) => {
    element.focus.mockImplementation(() => {
      f.doc.activeElement = element as typeof f.opener;
      f.dispatch("focusin", { target: element } as unknown as Event);
    });
  };
  [...f.controls, ...upperControls, f.opener, f.dialog, upperDialog].forEach((element) => enableFocus(element as unknown as { focus: ReturnType<typeof vi.fn> }));
  f.controls.forEach((element) => element.closest.mockImplementation(() => f.rootAttributes.has("inert") ? f.root : null));
  upperControls.forEach((element) => element.closest.mockImplementation(() => upperAttributes.has("inert") ? upperRoot as unknown as Element : null));
  const appendUpperRoot = () => f.doc.body.children.push(upperRoot);
  return { ...f, upperControls, upperAttributes, upperRoot: upperRoot as unknown as HTMLElement, upperDialog: upperDialog as unknown as HTMLElement, appendUpperRoot };
}

describe("overlapping dialogs", () => {
  it("gives only the top dialog focus and keyboard ownership", () => {
    const f = overlappingFixture();
    const lowerClose = vi.fn();
    const upperClose = vi.fn();
    const closeLower = activateDialog(f.dialog, f.root, () => ({ onClose: lowerClose }));
    f.appendUpperRoot();
    const closeUpper = activateDialog(f.upperDialog, f.upperRoot, () => ({ onClose: upperClose }));
    expect(f.rootAttributes.get("inert")).toBe("");
    expect(f.upperAttributes.has("inert")).toBe(false);
    expect(f.doc.activeElement).toBe(f.upperControls[0]);
    f.opener.focus();
    expect(f.doc.activeElement).toBe(f.upperControls[0]);
    f.upperControls[1].focus();
    const tab = key("Tab");
    f.dispatch("keydown", tab as unknown as Event);
    expect(tab.preventDefault).toHaveBeenCalledOnce();
    expect(f.doc.activeElement).toBe(f.upperControls[0]);
    const escape = key("Escape");
    f.dispatch("keydown", escape as unknown as Event);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(upperClose).toHaveBeenCalledOnce();
    expect(lowerClose).not.toHaveBeenCalled();
    closeUpper();
    closeLower();
  });

  it("keeps the lower dialog locked when upper dismissal is disabled", () => {
    const f = overlappingFixture();
    const lowerClose = vi.fn();
    const upperClose = vi.fn();
    const closeLower = activateDialog(f.dialog, f.root, () => ({ onClose: lowerClose }));
    f.appendUpperRoot();
    const closeUpper = activateDialog(f.upperDialog, f.upperRoot, () => ({ onClose: upperClose, closeDisabled: true }));
    f.dispatch("keydown", key("Escape") as unknown as Event);
    expect(lowerClose).not.toHaveBeenCalled();
    expect(upperClose).not.toHaveBeenCalled();
    closeUpper();
    closeLower();
  });

  it("closing top first restores its opener inside lower without unlocking the page", () => {
    const f = overlappingFixture();
    f.attributes.set("inert", "existing");
    const closeLower = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    f.controls[1].focus();
    f.appendUpperRoot();
    const closeUpper = activateDialog(f.upperDialog, f.upperRoot, () => ({ onClose: vi.fn() }));
    closeUpper();
    expect(f.doc.activeElement).toBe(f.controls[1]);
    expect(f.rootAttributes.has("inert")).toBe(false);
    expect(f.upperAttributes.get("inert")).toBe("");
    expect(f.attributes.get("inert")).toBe("");
    expect(f.overflow.value).toBe("hidden");
    closeLower();
    expect(f.doc.activeElement).toBe(f.opener);
    expect(f.attributes.get("inert")).toBe("existing");
    expect(f.overflow).toEqual({ value: "clip", priority: "important" });
    expect(f.listeners.size).toBe(0);
  });

  it("closing lower first preserves locks and restores the connected outside opener last", () => {
    const f = overlappingFixture();
    const closeLower = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    f.appendUpperRoot();
    const closeUpper = activateDialog(f.upperDialog, f.upperRoot, () => ({ onClose: vi.fn() }));
    f.opener.focus.mockClear();
    closeLower();
    expect(f.opener.focus).not.toHaveBeenCalled();
    expect(f.doc.activeElement).toBe(f.upperControls[0]);
    expect(f.attributes.get("inert")).toBe("");
    expect(f.rootAttributes.get("inert")).toBe("");
    expect(f.overflow.value).toBe("hidden");
    closeUpper();
    expect(f.doc.activeElement).toBe(f.opener);
    expect(f.attributes.has("inert")).toBe(false);
    expect(f.rootAttributes.has("inert")).toBe(false);
    expect(f.upperAttributes.has("inert")).toBe(false);
    expect(f.overflow).toEqual({ value: "clip", priority: "important" });
    expect(f.listeners.size).toBe(0);
    closeLower();
    closeUpper();
    expect(f.opener.focus).toHaveBeenCalledOnce();
  });

  it("falls back to lower's first control if the upper opener disconnects", () => {
    const f = overlappingFixture();
    const closeLower = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    f.controls[1].focus();
    f.appendUpperRoot();
    const closeUpper = activateDialog(f.upperDialog, f.upperRoot, () => ({ onClose: vi.fn() }));
    f.controls[1].isConnected = false;
    closeUpper();
    expect(f.doc.activeElement).toBe(f.controls[0]);
    closeLower();
  });

  it("does not send one Escape to the lower dialog after synchronous upper cleanup", () => {
    const f = overlappingFixture();
    const lowerClose = vi.fn();
    const closeLower = activateDialog(f.dialog, f.root, () => ({ onClose: lowerClose }));
    f.appendUpperRoot();
    let closeUpper: () => void;
    closeUpper = activateDialog(f.upperDialog, f.upperRoot, () => ({ onClose: () => closeUpper() }));
    f.dispatch("keydown", key("Escape") as unknown as Event);
    expect(lowerClose).not.toHaveBeenCalled();
    f.dispatch("keydown", key("Escape") as unknown as Event);
    expect(lowerClose).toHaveBeenCalledOnce();
    closeLower();
  });

  it("keeps separate documents independent", () => {
    const a = fixture();
    const b = fixture();
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();
    const closeA = activateDialog(a.dialog, a.root, () => ({ onClose: onCloseA }));
    const closeB = activateDialog(b.dialog, b.root, () => ({ onClose: onCloseB }));
    a.dispatch("keydown", key("Escape") as unknown as Event);
    expect(onCloseA).toHaveBeenCalledOnce();
    expect(onCloseB).not.toHaveBeenCalled();
    closeA();
    expect(b.overflow.value).toBe("hidden");
    expect(b.attributes.get("inert")).toBe("");
    closeB();
  });

  it("preserves original inert when both roots exist before either lifecycle starts", () => {
    const f = overlappingFixture();
    f.appendUpperRoot();
    f.upperAttributes.set("inert", "existing-upper");
    const closeLower = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    const closeUpper = activateDialog(f.upperDialog, f.upperRoot, () => ({ onClose: vi.fn() }));
    expect(f.upperAttributes.has("inert")).toBe(false);
    expect(f.rootAttributes.get("inert")).toBe("");
    closeLower();
    closeUpper();
    expect(f.upperAttributes.get("inert")).toBe("existing-upper");
    expect(f.rootAttributes.has("inert")).toBe(false);
  });

  it("captures fresh body state on reactivation after the last dialog closes", () => {
    const f = fixture();
    activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }))();
    f.overflow.value = "scroll";
    f.overflow.priority = "";
    f.attributes.set("inert", "changed-background");
    const cleanup = activateDialog(f.dialog, f.root, () => ({ onClose: vi.fn() }));
    expect(f.overflow.value).toBe("hidden");
    cleanup();
    expect(f.overflow).toEqual({ value: "scroll", priority: "" });
    expect(f.attributes.get("inert")).toBe("changed-background");
    expect(f.listeners.size).toBe(0);
  });
});

describe("dialog owner theme", () => {
  it.each(["field", "admin", "login"] as const)("inherits explicit %s theme from opener", (theme) => {
    const owner = { getAttribute: () => theme, matches: () => false };
    const doc = { activeElement: { closest: () => owner }, querySelector: vi.fn() };
    expect(resolveDialogTheme(doc as unknown as Document)).toBe(theme);
    expect(doc.querySelector).not.toHaveBeenCalled();
  });

  it.each([[".field-app", "field"], [".operations-app", "admin"], [".login-shell", "login"]])("falls back to mounted %s root", (selector, theme) => {
    const owner = { getAttribute: () => null, matches: (value: string) => value === selector };
    const doc = { activeElement: null, querySelector: () => owner };
    expect(resolveDialogTheme(doc as unknown as Document)).toBe(theme);
  });
});
