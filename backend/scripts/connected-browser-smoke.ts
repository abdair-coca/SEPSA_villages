import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { Application } from "../src/application.js";
import { hashPassword } from "../src/auth.js";
import { loadConfig } from "../src/config.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required. Run `npm run db:migrate:test` against isolated PostgreSQL before this browser smoke.");

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const fieldAppRoot = join(projectRoot, "field-app");
const frontendUrl = "http://127.0.0.1:5174";
const profile = mkdtempSync(join(tmpdir(), "sepsa-phase5-connected-"));
const chromePath = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((path) => path && existsSync(path));
if (!chromePath) throw new Error("Chrome/Chromium not found; set CHROME_PATH to a headless-capable browser.");

const pool = new Pool({ connectionString: databaseUrl, max: 4 });
let server: ReturnType<typeof createServer> | undefined;
let browser: ReturnType<typeof spawn> | undefined;
let vite: ReturnType<typeof spawn> | undefined;
let cdp: CdpClient | undefined;

try {
  const adminId = randomUUID();
  const technicianId = randomUUID();
  const password = `synthetic-${randomUUID()}`;
  const adminUsername = `phase5-admin-${adminId}`;
  const technicianUsername = `phase5-tech-${technicianId}`;
  const passwordHash = await hashPassword(password);
  await pool.query("INSERT INTO users(user_id, username, display_name, role, password_hash, source) VALUES ($1, $2, 'Fase cinco admin sintético', 'ADMIN', $3, 'PILOT_PROVISIONAL'), ($4, $5, $5, 'TECHNICIAN', $3, 'PILOT_PROVISIONAL')", [adminId, adminUsername, passwordHash, technicianId, technicianUsername]);
  const debtorId = `phase5-browser-${randomUUID()}`;
  await pool.query("INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, reference_text, meter_id, area, locality, route, debt_cents, months_pending, supply_status, updated_at, source) VALUES ($1, $2, $3, 'Fase cinco cliente sintético', 'Dirección sintética', '', 'Medidor sintético', 'A', 'Localidad sintética', '1', 9999999, 3, 'A', now(), 'PILOT_PROVISIONAL')", [debtorId, `${debtorId}-account`, `${debtorId}-supply`]);

  const config = loadConfig({ ...process.env, HOST: "127.0.0.1", PORT: "0", CORS_ORIGIN: frontendUrl });
  const application = new Application(pool, config);
  server = createServer((request, response) => { void application.handle(request, response); });
  await listen(server);
  const apiAddress = server.address();
  if (!apiAddress || typeof apiAddress === "string") throw new Error("Connected browser API address unavailable.");
  const apiUrl = `http://127.0.0.1:${apiAddress.port}`;
  const viteCli = join(fieldAppRoot, "node_modules", "vite", "bin", "vite.js");
  const build = spawnSync(process.execPath, [viteCli, "build"], {
    cwd: fieldAppRoot,
    env: { ...process.env, VITE_PILOT_BACKEND_URL: apiUrl },
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error(`Connected browser production build failed (${build.status ?? build.signal}).`);
  vite = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1", "--port", "5174", "--strictPort"], {
    cwd: fieldAppRoot,
    env: { ...process.env, VITE_PILOT_BACKEND_URL: apiUrl },
    stdio: "ignore",
  });
  await waitForHttp(frontendUrl);

  const debugPort = await findFreePort();
  browser = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-mode", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--remote-debugging-port=" + debugPort, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const target = await waitForTarget(debugPort, frontendUrl);
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setGeolocationOverride", { latitude: -17.39, longitude: -66.16, accuracy: 8 });
  await cdp.send("Browser.grantPermissions", { origin: frontendUrl, permissions: ["geolocation", "videoCapture"] });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__phase5FakeGps = [-17.39, -66.16];" });
  await cdp.send("Page.navigate", { url: frontendUrl });
  await login(cdp, adminUsername, password);
  await waitForExpression(cdp, `document.querySelector('.operations-search .admin-record') !== null`);
  await evaluate(cdp, `([...document.querySelectorAll('.operations-search .record-review')].find((item) => item.innerText.includes('Fase cinco cliente sintético')))?.click()`);
  await waitForExpression(cdp, `document.querySelector('.supply-order-action button:not(:disabled)') !== null`);
  await evaluate(cdp, `document.querySelector('.supply-order-action button:not(:disabled)')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[role="dialog"] select') !== null`);
  await evaluate(cdp, `(() => { const select = document.querySelector('[role="dialog"] select'); const option = [...select.options].find((item) => item.textContent.includes(${JSON.stringify(technicianUsername)})); if (!option) throw new Error('Synthetic technician missing from assignment dialog'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await evaluate(cdp, `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.includes('Aceptar y crear orden'))?.click()`);
  await waitForExpression(cdp, `document.body.innerText.includes('Orden creada y asignada')`);
  const order = await pool.query<{ order_id: string; assigned_technician_id: string; version: number }>("SELECT order_id, assigned_technician_id, version FROM orders WHERE debtor_id = $1", [debtorId]);
  assert.equal(order.rows[0]?.assigned_technician_id, technicianId, "Admin UI assignment must persist in PostgreSQL");

  await evaluate(cdp, `[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Cerrar sesión'))?.click()`);
  await login(cdp, technicianUsername, password);
  await waitForExpression(cdp, `document.querySelector('.current-order-card') !== null`);
  await waitForExpression(cdp, `navigator.serviceWorker.controller !== null`, "PWA service worker control");
  await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitForExpression(cdp, `navigator.onLine === false`, "offline browser state");

  await evaluate(cdp, `document.querySelector('.current-order-card .tertiary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard[aria-label="Captura de visita"]') !== null`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.disabled === false`);
  await evaluate(cdp, `document.querySelector('.capture-wizard input[type="checkbox"]')?.click()`);
  await evaluate(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard textarea') !== null`);
  await setValue(cdp, '.capture-wizard textarea', 'Excepción de evidencia sintética de prueba conectada.');
  await evaluate(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard h3')?.textContent === 'Revisar y confirmar'`);
  await evaluate(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[role="dialog"] h2')?.textContent === 'Visita guardada'`);
  const operationId = await evaluate(cdp, `document.querySelector('[role="dialog"]')?.innerText`);
  await evaluate(cdp, `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Listo')?.click()`);
  await cdp.send("Page.navigate", { url: frontendUrl });
  await waitForExpression(cdp, `document.querySelector('.current-order-card') !== null`, "field package recovery after reload");
  await evaluate(cdp, `[...document.querySelectorAll('.bottom-navigation button')].find((button) => button.textContent.includes('Pendientes'))?.click()`);
  await waitForExpression(cdp, `document.querySelector('.queue-panel .queue-status--pending') !== null`, "durable offline queue after reload");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitForExpression(cdp, `navigator.onLine === true`, "browser reconnect");
  await waitForExpression(cdp, `document.querySelector('.queue-panel .queue-status--synced') !== null`, "queued visit synchronization", 120);

  const browserCapture = await evaluate(cdp, `(async () => {
    const api = ${JSON.stringify(apiUrl)};
    const order = ${JSON.stringify(order.rows[0])};
    const deviceId = localStorage.getItem('sepsa.simulated.device-id');
    if (!deviceId) throw new Error('Synthetic device id missing');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.createElement('video'); video.muted = true; video.srcObject = stream; await video.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d'); context.drawImage(video, 0, 0, 64, 64);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    stream.getTracks().forEach((track) => track.stop());
    if (!blob) throw new Error('Synthetic camera frame encoding failed');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const contentHash = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const contentBase64 = btoa(String.fromCharCode(...bytes));
    const operationId = 'phase5-browser-cut-' + crypto.randomUUID();
    const evidenceId = 'phase5-browser-evidence-' + crypto.randomUUID();
    const headers = { 'content-type': 'application/json' };
    const upload = await fetch(api + '/v1/evidence/assets', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ evidence_id: evidenceId, order_id: order.order_id, operation_id: operationId, device_id: deviceId, mime_type: 'image/jpeg', content_hash: contentHash, content_base64: contentBase64 }) });
    const uploadBody = await upload.json();
    const authorization = await fetch(api + '/v1/authorizations/cut', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ operation_id: operationId, order_id: order.order_id, device_id: deviceId, order_version: order.version }) });
    const authorizationBody = await authorization.json();
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition((value) => resolve({ latitude: value.coords.latitude, longitude: value.coords.longitude, accuracyMeters: value.coords.accuracy }), reject));
    const sync = await fetch(api + '/v1/sync/operations', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ operation_id: operationId, action: 'CUT', order_id: order.order_id, technician_id: order.assigned_technician_id, device_id: deviceId, recorded_at: new Date().toISOString(), evidence_refs: [evidenceId], order_version: order.version, authorization_id: authorizationBody.authorization_id, authorization_token: authorizationBody.token, field_capture: { reading: { value: 123.45, unit: 'kWh', meterId: 'Medidor sintético', recordedAt: new Date().toISOString(), status: 'CAPTURED' }, location: { ...position, recordedAt: new Date().toISOString(), status: 'CAPTURED' }, cutType: 'RED', nearbyMeters: false } }) });
    return { cameraFrameBytes: bytes.length, uploadStatus: upload.status, uploadBody, authorizationStatus: authorization.status, syncStatus: sync.status, syncBody: await sync.json(), syntheticGps: position, operationId, evidenceId };
  })()`);
  assert.equal(browserCapture.uploadStatus, 200, "Browser camera frame must upload as evidence");
  assert.equal(browserCapture.authorizationStatus, 200, "Assigned order must receive a cut reservation");
  assert.equal(browserCapture.syncStatus, 200, "Authorized CUT must synchronize with verified evidence");
  assert.equal(browserCapture.syncBody.status, "acknowledged");
  const browserAsset = await pool.query("SELECT status, content_hash FROM evidence_assets WHERE evidence_id = $1", [browserCapture.evidenceId]);
  const browserOperation = await pool.query("SELECT status FROM sync_operations WHERE operation_id = $1", [browserCapture.operationId]);
  const browserAudit = await pool.query("SELECT action FROM audit_events WHERE operation_id = $1", [browserCapture.operationId]);
  assert.equal(browserAsset.rows[0]?.status, "verified");
  assert.equal(browserOperation.rows[0]?.status, "acknowledged");
  assert.ok(browserAudit.rows.some((row) => row.action === "SYNC_CUT"));

  const persisted = await pool.query<{ status: string }>("SELECT status FROM sync_operations WHERE order_id = $1 AND action = 'VISIT' ORDER BY created_at DESC LIMIT 1", [order.rows[0]?.order_id]);
  assert.equal(persisted.rows[0]?.status, "acknowledged", "Recovered offline visit must sync into PostgreSQL");
  const audit = await pool.query("SELECT audit_id FROM audit_events WHERE order_id = $1 AND action = 'SYNC_VISIT' AND result = 'accepted'", [order.rows[0]?.order_id]);
  assert.ok(audit.rows.length > 0, "PostgreSQL must retain accepted sync audit");
  console.log(JSON.stringify({ result: "passed", browser: "headless Chrome/Chromium", checks: ["admin login", "order creation and assignment", "technician login", "offline visit", "reload recovery", "sync and PostgreSQL audit", "synthetic camera evidence upload", "synthetic GPS", "CUT confirmation and PostgreSQL evidence/audit"], cameraBytes: browserCapture.cameraFrameBytes, gps: browserCapture.syntheticGps }));
} finally {
  cdp?.close();
  if (browser?.pid) stopProcess(browser.pid);
  if (vite?.pid) stopProcess(vite.pid);
  if (server) await close(server);
  await pool.end();
  await delay(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

async function login(client: CdpClient, username: string, password: string): Promise<void> {
  await waitForExpression(client, `document.querySelector('.login-form') !== null`, "login form");
  await evaluate(client, `(() => { const inputs = [...document.querySelectorAll('.login-form input')].filter((input) => input.type !== 'checkbox'); const set = (input, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }; set(inputs[0], ${JSON.stringify(username)}); set(inputs[1], ${JSON.stringify(password)}); document.querySelector('.login-form')?.requestSubmit(); })()`);
}

async function setValue(client: CdpClient, selector: string, value: string): Promise<void> {
  await evaluate(client, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}

async function evaluate(client: CdpClient, expression: string): Promise<any> {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForExpression(client: CdpClient, expression: string, label: string, seconds = 30): Promise<void> {
  for (let attempt = 0; attempt < seconds * 4; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(250);
  }
  const pageText = await evaluate(client, "document.body?.innerText?.slice(0, 500) ?? ''");
  throw new Error(`Timed out waiting for ${label ?? expression}; page text: ${pageText}`);
}

async function waitForHttp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* startup pending */ }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function findFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolveListen, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolveListen); });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate Chrome debug port.");
  await close(probe);
  return address.port;
}

async function waitForTarget(port: number, url: string): Promise<{ webSocketDebuggerUrl: string }> {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) {
        const page = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
        return await page.json() as { webSocketDebuggerUrl: string };
      }
    } catch { /* browser startup pending */ }
    await delay(250);
  }
  throw new Error("Timed out waiting for headless Chrome DevTools.");
}

type CdpClient = { send(method: string, params?: Record<string, unknown>): Promise<any>; close(): void };
async function connectCdp(url: string): Promise<CdpClient> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolveOpen, reject) => { socket.addEventListener("open", () => resolveOpen(), { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    send(method, params = {}) { const nextId = ++id; socket.send(JSON.stringify({ id: nextId, method, params })); return new Promise((resolveResult, reject) => pending.set(nextId, { resolve: resolveResult, reject })); },
    close() { socket.close(); },
  };
}

function listen(value: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveListen, reject) => { value.once("error", reject); value.listen(0, "127.0.0.1", resolveListen); });
}
function close(value: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveClose, reject) => value.close((error) => error ? reject(error) : resolveClose()));
}
function stopProcess(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(pid, "SIGTERM");
}
