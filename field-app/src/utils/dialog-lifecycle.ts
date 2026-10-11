export interface DialogCloseOptions {
  onClose: () => void;
  closeDisabled?: boolean;
}

export type DialogTheme = "field" | "admin" | "login";

const OWNER_SELECTOR = '[data-ui-theme], .field-app, .operations-app, .login-shell';
const CONTROL_SELECTOR = 'a[href], area[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]';

export function resolveDialogTheme(doc: Document, fallback: DialogTheme = "admin"): DialogTheme {
  const owner = doc.activeElement?.closest(OWNER_SELECTOR) ?? doc.querySelector(OWNER_SELECTOR);
  const explicit = owner?.getAttribute("data-ui-theme");
  if (explicit === "field" || explicit === "admin" || explicit === "login") return explicit;
  if (owner?.matches(".field-app")) return "field";
  if (owner?.matches(".operations-app")) return "admin";
  if (owner?.matches(".login-shell")) return "login";
  return fallback;
}

/** Query on every key press: controls may disappear or become disabled while saving. */
export function getDialogControls(dialog: HTMLElement): HTMLElement[] {
  const view = dialog.ownerDocument.defaultView;
  return Array.from(dialog.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[inert]") || !element.getClientRects().length) return false;
    const visibility = view?.getComputedStyle(element).visibility;
    return visibility !== "hidden" && visibility !== "collapse";
  });
}

function focusFirstControl(dialog: HTMLElement): void {
  (getDialogControls(dialog)[0] ?? dialog).focus();
}

export function handleDialogKeyDown(event: KeyboardEvent, dialog: HTMLElement, options: DialogCloseOptions): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (!options.closeDisabled) options.onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = getDialogControls(dialog);
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = dialog.ownerDocument.activeElement;
  if (!first) {
    event.preventDefault();
    dialog.focus();
  } else if (!controls.some((control) => control === active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

interface ActiveDialog {
  dialog: HTMLElement;
  portalRoot: HTMLElement;
  openers: HTMLElement[];
  getOptions: () => DialogCloseOptions;
}

interface DialogStack {
  entries: ActiveDialog[];
  inert: Map<Element, string | null>;
  closedDialogs: HTMLElement[];
  release: () => void;
}

const documentStacks = new WeakMap<Document, DialogStack>();

function restoreInert(element: Element, inert: string | null): void {
  if (inert === null) element.removeAttribute("inert");
  else element.setAttribute("inert", inert);
}

function lockBackground(doc: Document, stack: DialogStack): void {
  const top = stack.entries.at(-1)!;
  for (const element of Array.from(doc.body.children)) {
    if (!stack.inert.has(element)) stack.inert.set(element, element.getAttribute("inert"));
    if (element === top.portalRoot || element.contains(top.portalRoot)) element.removeAttribute("inert");
    else element.setAttribute("inert", "");
  }
}

function createDialogStack(doc: Document): DialogStack {
  const body = doc.body;
  const overflow = body.style.getPropertyValue("overflow");
  const overflowPriority = body.style.getPropertyPriority("overflow");
  const stack: DialogStack = {
    entries: [],
    inert: new Map(),
    closedDialogs: [],
    release: () => {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("focusin", onFocusIn, true);
      stack.inert.forEach((inert, element) => restoreInert(element, inert));
      if (overflow) body.style.setProperty("overflow", overflow, overflowPriority);
      else body.style.removeProperty("overflow");
      documentStacks.delete(doc);
    },
  };
  const onKeyDown = (event: KeyboardEvent) => {
    // Read once: synchronous dismissal must not send this event to the next dialog.
    const top = stack.entries.at(-1);
    if (top) handleDialogKeyDown(event, top.dialog, top.getOptions());
  };
  let redirectingFocus = false;
  const onFocusIn = (event: FocusEvent) => {
    const top = stack.entries.at(-1);
    if (!top || redirectingFocus || event.target === top.dialog || top.dialog.contains(event.target as Node | null)) return;
    redirectingFocus = true;
    try { focusFirstControl(top.dialog); }
    finally { redirectingFocus = false; }
  };
  body.style.setProperty("overflow", "hidden");
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("focusin", onFocusIn, true);
  return stack;
}

/** A document shares one lock and one focus/keyboard owner across overlapping modals. */
export function activateDialog(dialog: HTMLElement, portalRoot: HTMLElement, getOptions: () => DialogCloseOptions): () => void {
  const doc = dialog.ownerDocument;
  let stack = documentStacks.get(doc);
  if (!stack) {
    stack = createDialogStack(doc);
    documentStacks.set(doc, stack);
  }
  const opener = doc.activeElement as HTMLElement | null;
  const entry: ActiveDialog = {
    dialog,
    portalRoot,
    getOptions,
    // Keep ancestry even if the underlying dialog closes before this one.
    openers: [...(opener ? [opener] : []), ...(stack.entries.at(-1)?.openers ?? [])],
  };
  stack.entries.push(entry);
  lockBackground(doc, stack);
  focusFirstControl(dialog);

  return () => {
    const index = stack.entries.indexOf(entry);
    if (index === -1) return;
    const wasTop = index === stack.entries.length - 1;
    stack.entries.splice(index, 1);
    stack.closedDialogs.push(dialog);
    const top = stack.entries.at(-1);
    if (top) lockBackground(doc, stack);
    else stack.release();
    if (!wasTop) return;
    const restore = entry.openers.find((candidate) => candidate.isConnected
      && !stack.closedDialogs.some((closed) => candidate === closed || closed.contains(candidate))
      && (!top || candidate === top.dialog || top.dialog.contains(candidate)));
    if (restore) restore.focus?.();
    else if (top) focusFirstControl(top.dialog);
  };
}
