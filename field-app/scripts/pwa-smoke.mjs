import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const port = 4182;
const appUrl = `http://127.0.0.1:${port}`;
const debuggingUrl = "http://127.0.0.1:9223";
const profileDirectory = join(tmpdir(), `sepsa-pwa-smoke-${Date.now()}`);
const chromePath = findChrome();
const viteCli = join(projectDirectory, "node_modules", "vite", "bin", "vite.js");

let preview;
let browser;

try {
  preview = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: projectDirectory,
    stdio: "ignore",
  });
  await waitForHttp(appUrl);

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

  await evaluate(cdp, `
    [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Ver detalle"))?.click()
  `);
  await waitForExpression(cdp, `document.body.innerText.includes("Registrar visita")`);
  await evaluate(cdp, `
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("Registrar visita"))
      ?.click()
  `);
  await waitForExpression(cdp, `document.body.innerText.includes("Confirmar datos")`);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await waitForExpression(cdp, `document.body.innerText.includes("Sin conexión")`);
  await evaluate(cdp, `document.querySelector('.action-form input[type="checkbox"]')?.click()`);
  await waitForExpression(cdp, `document.querySelector(".action-form textarea") !== null`);
  await evaluate(cdp, `(() => {
    const textarea = document.querySelector('.action-form textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, 'No fue posible adjuntar evidencia durante smoke test.');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitForExpression(cdp, `[...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Confirmar")`);
  await evaluate(cdp, `
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.trim() === "Confirmar")
      ?.click()
  `);
  await waitForExpression(cdp, `document.querySelector(".notification__action") !== null`);
  await evaluate(cdp, `document.querySelector(".notification__action")?.click()`);
  await waitForExpression(cdp, `document.querySelector(".queue-panel") !== null`);

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

  stopProcessTree(preview.pid);
  preview = undefined;
  await delay(500);

  const documentToken = `online-${Date.now()}`;
  await evaluate(cdp, `document.documentElement.dataset.pwaSmokeDocument = ${JSON.stringify(documentToken)}`);
  await cdp.send("Page.navigate", { url: appUrl });
  await waitForExpression(cdp, `document.documentElement.dataset.pwaSmokeDocument !== ${JSON.stringify(documentToken)}`);
  await waitForExpression(cdp, `document.querySelector(".bottom-navigation") !== null`);
  await waitForExpression(cdp, `document.querySelector(".current-order-card") !== null`);
  await evaluate(cdp, `document.querySelector(".collapsible-card__summary")?.click()`);
  await waitForExpression(cdp, `document.querySelector(".home-secondary-link") !== null`);
  await evaluate(cdp, `document.querySelector(".home-secondary-link")?.click()`);
  await waitForExpression(cdp, `document.body.innerText.includes("Cola de sincronización")`);

  const offlineState = await evaluate(cdp, `({
    shell: document.body.innerText.includes("Jornada de campo"),
    orders: document.body.innerText.includes("Cola de sincronización"),
    pendingVisit: document.querySelector(".queue-status")?.textContent.includes("Pendiente") ?? false,
    networkError: document.body.innerText.includes("ERR_CONNECTION_REFUSED"),
  })`);

  const result = { previewHttp200: true, serviceWorker, offlineState };
  console.log(JSON.stringify(result, null, 2));

  if (!serviceWorker.active || !serviceWorker.controlled || !serviceWorker.hasScript || !serviceWorker.hasStyles || !serviceWorker.hasFont) {
    throw new Error("Service Worker did not cache complete application shell.");
  }
  if (!offlineState.shell || !offlineState.orders || !offlineState.pendingVisit || offlineState.networkError) {
    throw new Error("Application did not recover persisted work from offline shell.");
  }

  cdp.close();
} finally {
  if (preview?.pid) stopProcessTree(preview.pid);
  if (browser?.pid) stopProcessTree(browser.pid);
  await delay(500);
  try {
    rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`Could not remove temporary browser profile: ${error.message}`);
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
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      events.push(message);
      if (events.length > 100) events.shift();
      return;
    }
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    events,
    send(method, params = {}) {
      const id = ++messageId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
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

async function waitForExpression(cdp, expression) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(250);
  }
  const state = await evaluate(cdp, `({
    location: location.href,
    body: document.body?.innerText?.slice(0, 500),
    html: document.documentElement?.outerHTML?.slice(0, 1000),
    resources: performance.getEntriesByType("resource").map((entry) => entry.name),
  })`);
  const failures = cdp.events
    .filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Network.loadingFailed")
    .slice(-10);
  throw new Error(`Timed out waiting for expression: ${expression}\n${JSON.stringify({ state, failures })}`);
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
