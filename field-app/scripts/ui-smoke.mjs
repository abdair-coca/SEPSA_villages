import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { assertPreviewMatchesBuild, assertSimulatedBuild } from "./smoke-build.mjs";

// Real browser checks complement the SSR suite. All data lives in a temporary profile.
const baseline = process.argv.includes("--baseline");
const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const profileDirectory = mkdtempSync(join(tmpdir(), "sepsa-ui-smoke-"));
const outputDirectory = process.env.UI_QA_OUTPUT || join(tmpdir(), "sepsa-ui-qa");
const appUrl = "http://127.0.0.1:4185";
const debuggingUrl = "http://127.0.0.1:9225";
const chromePath = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((path) => path && existsSync(path));
if (!chromePath) throw new Error("Chrome not found; set CHROME_PATH.");
mkdirSync(outputDirectory, { recursive: true });
let preview;
let browser;
let cdp;
const observations = [];

try {
  const build = await assertSimulatedBuild(join(projectDirectory, "dist"), process.env.VITE_PILOT_BACKEND_URL);
  preview = spawn(process.execPath, [join(projectDirectory, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "4185", "--strictPort"], { cwd: projectDirectory, stdio: "ignore" });
  await waitForHttp(appUrl);
  await assertPreviewMatchesBuild(appUrl, build);
  browser = spawn(chromePath, ["--headless=new", "--disable-gpu", "--disable-background-mode", "--no-first-run", "--remote-debugging-port=9225", `--user-data-dir=${profileDirectory}`, "about:blank"], { stdio: "ignore" });
  await waitForHttp(`${debuggingUrl}/json/version`);
  const page = await fetch(`${debuggingUrl}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" }).then((response) => response.json());
  cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await viewport(390, 844);
  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor(`document.querySelector('.login-form') !== null`);
  await screenshot("login-390");
  if (!baseline) {
    await login("admin.simulated", "invalid-smoke-password");
    await waitFor(`document.querySelector('.login-form [role="alert"]') !== null`);
  }
  await login("admin.simulated", "SIMULATED-admin-003");
  await waitFor(`document.querySelector('.operations-search .admin-record') !== null`);
  if (!baseline) observations.push({ check: "login-retry", passed: true });
  await viewport(1280, 900);
  await screenshot("admin-1280");
  await viewport(390, 844);
  await screenshot("admin-390");
  if (!baseline) {
    for (const width of [360, 390, 760]) {
      await viewport(width, 844);
      assert.equal(await evaluate(`document.querySelector('.app-header__brand').getBoundingClientRect().right <= document.querySelector('.app-header__topbar-actions').getBoundingClientRect().left`), true, `Header sections must not overlap at ${width}px`);
    }
    observations.push({ check: "admin-header-without-overlap", passed: true });
  }
  await viewport(1280, 900);
  await click(".filter-select-all");
  await waitFor(`document.querySelector('.filter-batch-action') !== null`);
  await evaluate(`document.querySelector('.filter-batch-action').focus()`);
  await click(".filter-batch-action");
  await waitFor(`document.querySelector('[role="dialog"]') !== null`);
  await evaluate(`document.querySelector('[role="dialog"] select').value = 'tech-camila'; document.querySelector('[role="dialog"] select').dispatchEvent(new Event('change', { bubbles: true }))`);
  await delay(100);
  const opener = await evaluate(`document.activeElement?.className`);
  const focusContained = await evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement)`);
  observations.push({ check: "modal-initial-focus", passed: focusContained, opener });
  if (!baseline) assert.equal(focusContained, true, "Modal must receive focus");
  if (!baseline) {
    await evaluate(`const controls = [...document.querySelector('[role="dialog"]').querySelectorAll('button:not(:disabled), select:not(:disabled)')]; controls.at(-1).focus()`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement)`), true, "Tab must stay inside modal");
    assert.equal(await evaluate(`document.querySelector('.operations-app').closest('[inert]') !== null`), true, "Background must be inert");
    await viewport(390, 844);
    await evaluate(`history.back()`);
    await waitFor(`document.querySelector('#exit-modal-title') !== null`);
    assert.equal(await evaluate(`document.querySelector('#exit-modal-title').closest('[role="dialog"]').contains(document.activeElement)`), true, "Top modal owns focus");
    await key("Escape", 27);
    await waitFor(`document.querySelector('#exit-modal-title') === null`);
    assert.equal(await evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement)`), true, "Closing top modal restores underlying focus");
    await key("Escape", 27);
    await waitFor(`document.querySelector('[role="dialog"]') === null`);
    assert.equal(await evaluate(`document.activeElement === document.querySelector('.filter-batch-action')`), true, "Cancel restores opener focus");
    assert.equal(await evaluate(`document.querySelector('.operations-app').closest('[inert]') === null`), true, "Cancel unlocks background");
    await click(".filter-batch-action");
    await waitFor(`document.querySelector('[role="dialog"] select') !== null`);
    await evaluate(`document.querySelector('[role="dialog"] select').value = 'tech-camila'; document.querySelector('[role="dialog"] select').dispatchEvent(new Event('change', { bubbles: true }))`);
    await viewport(1280, 900);
    observations.push({ check: "modal-keyboard-stack-and-restoration", passed: true });
  }
  await screenshot("admin-modal-1280");
  await evaluate(`document.querySelector('[role="dialog"] .primary-action').click()`);
  await waitFor(`document.querySelector('[role="dialog"]') === null && document.querySelector('.order-index-item') !== null`);
  await logout();
  await viewport(390, 844);
  await login("camila.simulated", "SIMULATED-camila-003");
  await waitFor(`document.querySelector('.current-order-card') !== null`);
  await screenshot("home-390");
  if (!baseline) {
    for (const width of [360, 390]) await assertMobileNotification(width);
  }
  if (!baseline) {
    await viewport(1280, 900);
    await click(".current-order-card__navigation button:last-child");
    const customer = await evaluate(`document.querySelector('.current-order-card__identity p').textContent`);
    await click(".current-order-card__map-action");
    await waitFor(`document.querySelector('.map-page .map-order-marker--selected') !== null`);
    assert.equal(await evaluate(`document.querySelector('.map-page .map-order-marker--selected .map-order-marker__label').textContent`), customer, "Map keeps clicked current order");
    observations.push({ check: "map-keeps-current-order", passed: true });
    await navigate("Inicio");
    await viewport(390, 844);
  }
  await navigate("Mis órdenes");
  for (const width of [360, 390, 760, 1280]) {
    await viewport(width, width === 1280 ? 900 : 844);
    await screenshot(`orders-${width}`);
    const overflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth + 1`);
    observations.push({ check: `horizontal-overflow-${width}`, passed: !overflow });
    if (!baseline) assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
  }
  await viewport(390, 844);
  if (!baseline) {
    await click('.order-pagination__controls button:last-child');
    await waitFor(`document.querySelector('.order-pagination__controls span').textContent === 'Página 2 de 8'`);
    await click('.order-pagination__controls button:first-child');
    await setInput('#order-search', 'no-such-smoke-order');
    await waitFor(`document.querySelector('.order-list-empty') !== null`);
    await click('.ui-search-field .search-clear-btn');
    await waitFor(`document.querySelector('.order-card') !== null`);
    observations.push({ check: "shared-search-clear-and-pagination", passed: true });
  }
  await click(".order-filter-disclosure > summary");
  await waitFor(`document.querySelector('.order-filter-disclosure').open === true`);
  await delay(350);
  const filterOnTop = await evaluate(`(() => { const row = document.querySelector('#order-filter-options'); const rect = row.getBoundingClientRect(); const point = document.elementFromPoint(rect.x + 20, rect.y + 20); return row.contains(point); })()`);
  observations.push({ check: "filters-above-card", passed: filterOnTop });
  if (!baseline) assert.equal(filterOnTop, true, "Filters must paint above order cards");
  await screenshot("orders-filters-390");
  await click(".order-filter-disclosure > summary");
  await click(".order-card__action-btn");
  await waitFor(`document.querySelector('.order-review-mobile:not([hidden])') !== null`);
  await screenshot("detail-390");
  if (!baseline) {
    await evaluate(`window.__gpsCallbacks = []; navigator.geolocation.getCurrentPosition = (success, error, options) => window.__gpsCallbacks.push({success, error, options})`);
    await click('.order-review-mobile .order-review-actions .primary-action');
    await waitFor(`document.querySelector('.capture-wizard input[type=number]') !== null`);
    await setInput(".capture-wizard input[type=number]", "125");
    await click(".capture-wizard__footer .primary-action");
    await waitFor(`document.querySelector('.capture-wizard h3').textContent === 'Datos del corte'`);
    await click(".capture-wizard__footer .primary-action");
    await waitFor(`document.querySelector('.capture-wizard h3').textContent === 'Ubicación GPS'`);
    await click(".capture-wizard__body .secondary-action");
    await waitFor(`window.__gpsCallbacks.length === 1`);
    assert.equal(await evaluate(`window.__gpsCallbacks[0].options.timeout`), 15000);
    await evaluate(`window.__gpsCallbacks[0].error({code: 3})`);
    await waitFor(`document.querySelector('.capture-wizard__error') !== null`);
    await click(".capture-wizard__body .secondary-action");
    await waitFor(`window.__gpsCallbacks.length === 2`);
    await click(".capture-wizard__body input[type=checkbox]");
    await click(".capture-wizard__footer .primary-action");
    await waitFor(`document.querySelector('.capture-wizard textarea') !== null`);
    await setInput(".capture-wizard textarea", "Justificación GPS que no debe perderse con un callback tardío.");
    await evaluate(`window.__gpsCallbacks.forEach(({success}) => success({coords:{latitude:-19.5, longitude:-65.7, accuracy:10}}))`);
    assert.match(await evaluate(`document.querySelector('.capture-wizard textarea').value`), /no debe perderse/);
    await click(".capture-wizard__back");
    await waitFor(`document.querySelector('.capture-wizard h3').textContent === 'Ubicación GPS'`);
    assert.match(await evaluate(`document.querySelector('.capture-wizard__body p').textContent`), /no capturadas/);
    observations.push({ check: "gps-retry-and-late-callback", passed: true });
    // Back through the existing capture steps; leave without performing a physical cut.
    for (let step = 0; step < 3; step++) await click(".capture-wizard__back");
    await waitFor(`document.querySelector('.capture-wizard') === null`);
  }
  await navigate("Inicio");
  await waitFor(`document.querySelector('.current-order-card') !== null`);
  await click(".current-order-card .tertiary-action");
  await waitFor(`document.querySelector('.capture-wizard input[type="checkbox"]') !== null`);
  await click(".capture-wizard input[type=checkbox]");
  await click(".capture-wizard__footer .primary-action");
  await waitFor(`document.querySelector('.capture-wizard textarea') !== null`);
  await setInput(".capture-wizard textarea", "No fue posible adjuntar foto durante esta comprobación local. Se conserva la excepción para verificar el borrador.");
  await viewport(390, 360);
  await evaluate(`document.querySelector('.capture-wizard textarea').focus()`);
  await delay(150);
  const captureScrollable = await evaluate(`getComputedStyle(document.querySelector('.capture-wizard__body')).overflowY === 'auto'`);
  observations.push({ check: "capture-scrollable", passed: captureScrollable });
  if (!baseline) assert.equal(captureScrollable, true, "Capture body must scroll in short viewports");
  await screenshot("capture-short-390");
  if (!baseline) await evaluate(`window.__zoomedText = [...document.querySelectorAll('.capture-wizard :is(h3, label, button, textarea, strong, span)')].map(element => ({element, font: element.style.fontSize, line: element.style.lineHeight, size: parseFloat(getComputedStyle(element).fontSize), height: parseFloat(getComputedStyle(element).lineHeight)})); window.__zoomedText.forEach(({element,size,height}) => { element.style.fontSize = size*2+'px'; if (Number.isFinite(height)) element.style.lineHeight = height*2+'px'; })`);
  await screenshot("capture-text-200");
  if (!baseline) {
    assert.equal(await evaluate(`(() => { const body = document.querySelector('.capture-wizard__body'); body.scrollTop = body.scrollHeight; const footer = document.querySelector('.capture-wizard__footer').getBoundingClientRect(); return body.scrollTop > 0 && footer.bottom <= innerHeight + 1; })()`), true, "Large text scrolls without hiding final action");
    await evaluate(`window.__zoomedText.forEach(({element,font,line}) => { element.style.fontSize = font; element.style.lineHeight = line; })`);
    observations.push({ check: "capture-text-200-and-footer", passed: true });
  }
  await viewport(760, 390);
  await screenshot("capture-landscape-760");
  await viewport(390, 844);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  if (!baseline) assert.equal(await evaluate(`getComputedStyle(document.querySelector('.capture-wizard')).animationName`), "none");
  await cdp.send("Page.reload", {});
  await waitFor(`document.querySelector('.current-order-card') !== null`);
  await click(".current-order-card .tertiary-action");
  await waitFor(`document.querySelector('.capture-wizard input[type=checkbox]')?.checked === true`);
  await click(".capture-wizard__footer .primary-action");
  await waitFor(`document.querySelector('.capture-wizard textarea')?.value.includes('comprobación local')`);
  observations.push({ check: "draft-survives-reload", passed: true });
  writeFileSync(join(outputDirectory, `${baseline ? "before" : "after"}-results.json`), JSON.stringify(observations, null, 2));
  console.log(JSON.stringify({ mode: baseline ? "baseline" : "verification", outputDirectory, observations }, null, 2));
} finally {
  cdp?.close();
  for (const process of [browser, preview]) if (process?.pid) stopProcessTree(process.pid);
  await delay(500);
  // Only remove the exact temporary Chrome profile created by mkdtemp, never workspace data.
  if (resolve(dirname(profileDirectory)) !== resolve(tmpdir()) || !profileDirectory.includes("sepsa-ui-smoke-")) throw new Error("Unexpected temporary profile target.");
  rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

async function viewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 760 });
  await delay(120);
}
async function screenshot(name) {
  await delay(350);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(outputDirectory, `${baseline ? "before" : "after"}-${name}.png`), Buffer.from(data, "base64"));
}
async function assertMobileNotification(width) {
  await viewport(width, 844);
  const layout = await evaluate(`(() => {
    document.querySelector('#notification-layout-smoke')?.remove();
    const notification = document.createElement('div');
    notification.id = 'notification-layout-smoke';
    notification.className = 'message notification message--warning';
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    notification.innerHTML = '<span class="notification__kind notification__kind--warning"><svg class="notification__glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 10 18H2L12 3Z"/></svg><span>Advertencia</span></span><span class="notification__text">Algunas operaciones requieren revisión; ninguna fue eliminada.</span><div class="notification__actions"><button type="button" class="notification__action">Ver operaciones pendientes</button><button type="button" class="notification__dismiss" aria-label="Cerrar notificación">×</button></div>';
    document.querySelector('.field-app .app-header').after(notification);
    const rect = notification.getBoundingClientRect();
    const text = notification.querySelector('.notification__text').getBoundingClientRect();
    const actions = notification.querySelector('.notification__actions').getBoundingClientRect();
    const dismiss = notification.querySelector('.notification__dismiss').getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      textWidth: text.width,
      actionsBelowText: actions.top >= text.bottom - 1,
      dismissHeight: dismiss.height,
      dismissSharesActionRow: Math.abs(dismiss.top - actions.top) < 1,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  })()`);
  assert.ok(layout.textWidth >= 180, `Notification text must keep a readable width at ${width}px: ${JSON.stringify(layout)}`);
  assert.ok(layout.height <= 180, `Notification must remain compact at ${width}px: ${JSON.stringify(layout)}`);
  assert.equal(layout.actionsBelowText, true, `Notification actions must follow the message at ${width}px`);
  assert.ok(layout.dismissHeight >= 44, `Dismiss action must remain accessible at ${width}px`);
  assert.equal(layout.dismissSharesActionRow, true, `Dismiss action should share the action row at ${width}px`);
  assert.equal(layout.horizontalOverflow, false, `Notification must not cause horizontal overflow at ${width}px`);
  observations.push({ check: `mobile-notification-layout-${width}`, passed: true, ...layout });
  await screenshot(`notification-warning-${width}`);
  await evaluate(`document.querySelector('#notification-layout-smoke')?.remove()`);
}
async function click(selector) {
  await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await delay(100);
}
async function setInput(selector, value) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await delay(100);
}
async function login(username, password) {
  await waitFor(`document.querySelector('.login-form') !== null`);
  await setInput(".login-form input[autocomplete=username]", username);
  await setInput(".login-form input[type=password]", password);
  await evaluate(`document.querySelector('.login-form').requestSubmit()`);
}
async function logout() {
  await evaluate(`document.querySelector('.app-header__account-trigger').click()`);
  await click(".app-header__logout");
  await waitFor(`document.querySelector('.login-form') !== null`);
}
async function navigate(label) {
  await evaluate(`([...document.querySelectorAll('.bottom-navigation button, .desktop-navigation button')].find(button => button.textContent.includes(${JSON.stringify(label)}))).click()`);
  await delay(200);
}
async function key(key, windowsVirtualKeyCode) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode });
  await delay(100);
}
async function evaluate(expression) {
  const response = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}
async function waitForHttp(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Starting process. */ }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  function send(method, params = {}) {
    const key = ++id;
    return new Promise((resolve, reject) => { pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
  }
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      const response = new URL(request.url).origin === appUrl
        ? send("Fetch.continueRequest", { requestId })
        : send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      // Navigations cancel paused requests before CDP can resume them.
      void response.catch((error) => { if (!error.message.includes("Invalid InterceptionId")) socket.close(); });
    }
    if (!pending.has(message.id)) return;
    const handler = pending.get(message.id); pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const handler of pending.values()) handler.reject(new Error("Chrome debugging connection closed."));
    pending.clear();
  });
  return { send, close: () => socket.close() };
}
function stopProcessTree(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else globalThis.process.kill(pid, "SIGTERM");
}
