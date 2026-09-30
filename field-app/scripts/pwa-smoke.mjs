import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { assertPreviewMatchesBuild, assertSimulatedBuild } from "./smoke-build.mjs";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const port = 4182;
const appUrl = `http://127.0.0.1:${port}`;
const debuggingUrl = "http://127.0.0.1:9223";
const profileDirectory = join(tmpdir(), `sepsa-pwa-smoke-${Date.now()}`);
const chromePath = findChrome();
const viteCli = join(projectDirectory, "node_modules", "vite", "bin", "vite.js");
const distDirectory = join(projectDirectory, "dist");

let preview;
let browser;

try {
  const build = await assertSimulatedBuild(distDirectory, process.env.VITE_PILOT_BACKEND_URL);
  preview = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectDirectory,
    stdio: "ignore",
  });
  await waitForHttp(appUrl);
  await assertPreviewMatchesBuild(appUrl, build);

  browser = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-mode",
    "--no-first-run",
    `--remote-debugging-port=9223`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: "ignore" });

  await waitForHttp(`${debuggingUrl}/json/version`);
  const page = await fetch(`${debuggingUrl}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" }).then(assertOk).then((response) => response.json());
  const cdp = await connectCdp(page.webSocketDebuggerUrl);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await cdp.send("Page.navigate", { url: appUrl });
  await login(cdp, "admin.simulated", "SIMULATED-admin-003");
  await waitForExpression(cdp, `document.body.innerText.includes("Centro de control")`);
  await waitForExpression(cdp, `document.querySelector(".operations-search .admin-record") !== null`);
  await evaluate(cdp, `document.querySelector(".operations-search .record-review")?.click()`);
  await waitForExpression(cdp, `[...document.querySelectorAll(".operations-orders button")].find((button) => button.textContent.includes("Crear orden"))?.disabled === false`);
  await evaluate(cdp, `[...document.querySelectorAll(".operations-orders button")].find((button) => button.textContent.includes("Crear orden"))?.click()`);
  await waitForExpression(cdp, `[...document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent.includes("Aceptar y crear orden"))`);
  await evaluate(cdp, `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.includes("Aceptar y crear orden"))?.click()`);
  await waitForExpression(cdp, `document.body.innerText.includes("Orden creada y asignada")`);
  await waitForExpression(cdp, `document.querySelector(".order-index-item") !== null`);
  await evaluate(cdp, `[...document.querySelectorAll("button")].find((button) => button.textContent.includes("Cerrar sesión"))?.click()`);
  await login(cdp, "camila.simulated", "SIMULATED-camila-003");
  await waitForExpression(cdp, `document.body.innerText.includes("Jornada de campo")`);
  await waitForExpression(cdp, `document.querySelector(".current-order-card") !== null`);
  await waitForExpression(cdp, `navigator.serviceWorker.controller !== null`);
  await evaluate(cdp, `[...document.querySelectorAll(".bottom-navigation button")].find((button) => button.textContent.includes("Pendientes"))?.click()`);
  await waitForExpression(cdp, `document.querySelector(".queue-panel") !== null`);
  const baselineOperationIds = await evaluate(cdp, `[...document.querySelectorAll(".queue-list--desktop .queue-item")].map((item) => item.querySelector(".queue-item__meta .technical-id")?.title).filter(Boolean)`);
  await evaluate(cdp, `[...document.querySelectorAll(".bottom-navigation button")].find((button) => button.textContent.includes("Inicio"))?.click()`);
  await waitForExpression(cdp, `document.querySelector(".current-order-card") !== null`);

  await evaluate(cdp, `document.querySelector(".current-order-card .tertiary-action")?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard[aria-label="Captura de visita"]') !== null`);
  await waitForExpression(cdp, `document.querySelector(".capture-wizard__footer .primary-action")?.disabled === false`);
  await evaluate(cdp, `document.querySelector('.capture-wizard input[type="checkbox"]')?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard input[type="checkbox"]')?.checked === true`);
  await evaluate(cdp, `document.querySelector(".capture-wizard__footer .primary-action")?.click()`);
  await waitForExpression(cdp, `document.querySelector(".capture-wizard textarea") !== null`);
  await evaluate(cdp, `(() => {
    const textarea = document.querySelector('.capture-wizard textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, 'No fue posible adjuntar evidencia durante smoke test.');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(cdp, `document.querySelector(".capture-wizard__footer .primary-action")?.click()`);
  await waitForExpression(cdp, `document.querySelector(".capture-wizard h3")?.textContent === "Revisar y confirmar"`);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await waitForExpression(cdp, `document.body.innerText.includes("Sin conexión")`);
  await evaluate(cdp, `document.querySelector(".capture-wizard__footer .primary-action")?.click()`);
  await waitForExpression(cdp, `document.querySelector('[role="dialog"] h2')?.textContent === "Visita guardada"`);
  const completionFocused = await evaluate(cdp, `document.querySelector('[role="dialog"]').contains(document.activeElement) && document.activeElement.textContent.trim() === 'Listo' && document.querySelector('.field-app').closest('[inert]') !== null`);
  if (!completionFocused) throw new Error("Completion dialog did not focus Listo and isolate the background.");
  await evaluate(cdp, `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === "Listo")?.click()`);
  await cdp.send("Page.navigate", { url: appUrl });
  await waitForExpression(cdp, `document.querySelector(".current-order-card") !== null`);
  await evaluate(cdp, `[...document.querySelectorAll(".bottom-navigation button")].find((button) => button.textContent.includes("Pendientes"))?.click()`);
  await waitForExpression(cdp, `document.querySelector(".queue-panel .queue-status--pending") !== null`);
  const persistedOffline = await evaluate(cdp, `({
    offline: !navigator.onLine,
    items: [...document.querySelectorAll(".queue-list--desktop .queue-item")].map((item) => ({
      action: item.querySelector(".queue-item__header strong")?.textContent,
      status: [...(item.querySelector(".queue-status")?.classList ?? [])].find((name) => name.startsWith("queue-status--")),
      operationId: item.querySelector(".queue-item__meta .technical-id")?.title,
    })),
  })`);
  const newVisitIds = persistedOffline.items.filter((item) => item.action === "Observación de campo" && !baselineOperationIds.includes(item.operationId)).map((item) => item.operationId);
  const pendingNewVisits = persistedOffline.items.filter((item) => newVisitIds.includes(item.operationId) && item.status === "queue-status--pending").length;
  const baselineStillPresent = baselineOperationIds.every((id) => persistedOffline.items.filter((item) => item.operationId === id).length === 1);
  if (!persistedOffline.offline || newVisitIds.length !== 1 || pendingNewVisits !== 1 || !baselineStillPresent) {
    throw new Error(`Offline reload persisted unexpected queue state: ${JSON.stringify(persistedOffline)}.`);
  }

  const serviceWorker = await evaluate(cdp, `
    navigator.serviceWorker.ready.then(async (registration) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const keys = await caches.keys();
      const entries = (await Promise.all(keys.map(async (key) => {
        const requests = await (await caches.open(key)).keys();
        return requests.map((request) => new URL(request.url).pathname);
      }))).flat();
      return {
        active: registration.active?.state === "activated",
        controlled: Boolean(navigator.serviceWorker.controller),
        hasScript: entries.some((entry) => entry.endsWith(".js")),
        hasStyles: entries.some((entry) => entry.endsWith(".css")),
        hasFont: entries.some((entry) => entry.endsWith(".woff2")),
      };
    })
  `, true);
  console.log(JSON.stringify({ serviceWorker }, null, 2));

  await evaluate(cdp, `window.__pwaSmokeOnlineEventCount = 0; window.addEventListener("online", () => { window.__pwaSmokeOnlineEventCount += 1; });`);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await waitForExpression(cdp, "navigator.onLine === true", "browser online event after reconnect");
  await waitForExpression(cdp, "document.querySelector('.app-status-badge--positive')?.textContent.includes('Red disponible') === true", "UI online state after reconnect");
  let automaticallySynced = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    automaticallySynced = await evaluate(cdp, `[...document.querySelectorAll(".queue-list--desktop .queue-item")].some((item) => {
      const operationId = item.querySelector(".queue-item__meta .technical-id")?.title;
      return ${JSON.stringify(newVisitIds)}.includes(operationId) && item.querySelector(".queue-status--synced") !== null;
    })`);
    if (automaticallySynced) break;
    await delay(250);
  }
  const onlineEventCount = await evaluate(cdp, "window.__pwaSmokeOnlineEventCount");
  let manualSyncUsed = false;
  if (!automaticallySynced) {
    await evaluate(cdp, `document.querySelector(".queue-panel .sync-button")?.click()`);
    manualSyncUsed = true;
    await waitForExpression(cdp, `[...document.querySelectorAll(".queue-list--desktop .queue-item")].some((item) => {
      const operationId = item.querySelector(".queue-item__meta .technical-id")?.title;
      return ${JSON.stringify(newVisitIds)}.includes(operationId) && item.querySelector(".queue-status--synced") !== null;
    })`, "manual sync of offline visit");
  }
  const synchronized = await evaluate(cdp, `({
    items: [...document.querySelectorAll(".queue-list--desktop .queue-item")].map((item) => ({
      action: item.querySelector(".queue-item__header strong")?.textContent,
      status: [...(item.querySelector(".queue-status")?.classList ?? [])].find((name) => name.startsWith("queue-status--")),
      operationId: item.querySelector(".queue-item__meta .technical-id")?.title,
    })),
  })`);
  const syncedVisits = synchronized.items.filter((item) => newVisitIds.includes(item.operationId) && item.status === "queue-status--synced").length;
  const pendingVisitCount = synchronized.items.filter((item) => newVisitIds.includes(item.operationId) && item.status === "queue-status--pending").length;
  const queueIdsUnchanged = synchronized.items.length === persistedOffline.items.length
    && persistedOffline.items.every((item) => synchronized.items.filter((candidate) => candidate.operationId === item.operationId).length === 1);
  if (syncedVisits !== 1 || pendingVisitCount !== 0 || !queueIdsUnchanged) {
    throw new Error("Reconnect did not synchronize exactly one visit without duplicates.");
  }

  const result = { previewHttp200: true, serviceWorker, persistedOffline, reconnect: { onlineEventCount, automaticallySynced, manualSyncUsed }, synchronized };
  console.log(JSON.stringify(result, null, 2));

  if (!serviceWorker.active || !serviceWorker.controlled || !serviceWorker.hasScript || !serviceWorker.hasStyles || !serviceWorker.hasFont) {
    throw new Error("Service Worker did not cache complete application shell.");
  }
  if (!persistedOffline.offline || newVisitIds.length !== 1 || pendingNewVisits !== 1 || syncedVisits !== 1 || pendingVisitCount !== 0 || !queueIdsUnchanged) {
    throw new Error("Application did not preserve and synchronize offline work exactly once.");
  }

  const unexpectedExternalRequests = cdp.blockedOrigins.filter((origin) => origin !== "https://server.arcgisonline.com");
  if (unexpectedExternalRequests.length) throw new Error("Smoke attempted a non-simulated external request; request was blocked.");
  if (!automaticallySynced) {
    throw new Error(`Automatic sync did not run after reconnect; onlineEventCount=${onlineEventCount}; manualSyncRecovered=${manualSyncUsed}.`);
  }

  cdp.close();
} finally {
  if (preview?.pid) stopProcessTree(preview.pid);
  if (browser?.pid) stopProcessTree(browser.pid);
  await delay(500);
  try {
    rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn("Could not remove temporary browser profile.");
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
  ].filter(Boolean);
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error("Chrome not found. Set CHROME_PATH to run PWA smoke test.");
  return match;
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Process may still be starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function assertOk(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${response.url}`);
  return response;
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let messageId = 0;
  const pending = new Map();
  const blockedOrigins = [];
  function send(method, params = {}) {
    const id = ++messageId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      if (message.method === "Fetch.requestPaused") {
        const { requestId, request } = message.params;
        let requestOrigin;
        try { requestOrigin = new URL(request.url).origin; } catch { requestOrigin = "invalid"; }
        if (requestOrigin === appUrl) void send("Fetch.continueRequest", { requestId });
        else {
          blockedOrigins.push(requestOrigin);
          void send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
        }
      }
      return;
    }
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    blockedOrigins,
    send,
    close() {
      socket.close();
    },
  };
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function waitForExpression(cdp, expression, description = "expected PWA UI state") {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function login(cdp, username, password) {
  await waitForExpression(cdp, `document.querySelector(".login-form") !== null`);
  await evaluate(cdp, `(() => {
    const inputs = [...document.querySelectorAll(".login-form input")];
    const set = (input, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); };
    set(inputs[0], ${JSON.stringify(username)});
    set(inputs[1], ${JSON.stringify(password)});
    document.querySelector(".login-form")?.requestSubmit();
  })()`);
}

function stopProcessTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}
