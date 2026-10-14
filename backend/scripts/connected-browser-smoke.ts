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
import { Application } from "../src/http/application.js";
import { hashPassword } from "../src/shared/auth-crypto.js";
import { loadConfig } from "../src/config.js";
import { requireLocalDatabaseUrl } from "./local-database-guard.mjs";

const databaseUrl = requireLocalDatabaseUrl(process.env.DATABASE_URL, "the connected browser smoke (run `npm run db:migrate:test` first)");

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
  const accountId = `${debtorId}-account`;
  await pool.query("INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, reference_text, meter_id, area, locality, route, debt_cents, months_pending, supply_status, updated_at, source) VALUES ($1, $2, $3, 'Fase cinco cliente sintético', 'Dirección sintética', '', 'Medidor sintético', 'A', 'Localidad sintética', '1', 9999999, 3, 'A', now(), 'PILOT_PROVISIONAL')", [debtorId, accountId, `${debtorId}-supply`]);

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
  await waitForExpression(cdp, `document.querySelector('.operations-search .admin-record') !== null`, "admin supplies list");
  await evaluate(cdp, `(() => { const input = document.querySelector('#admin-search'); if (!(input instanceof HTMLInputElement)) throw new Error('Admin supply search input missing'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (!setter) throw new Error('Admin supply search value setter missing'); setter.call(input, ${JSON.stringify(accountId)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const syntheticSupplyResult = `([...document.querySelectorAll('.operations-search .record-review')].some((item) => item.innerText.includes(${JSON.stringify(accountId)})))`;
  await waitForExpression(cdp, syntheticSupplyResult, `synthetic supply search result ${accountId}`);
  const selectedSyntheticSupply = await evaluate(cdp, `(() => { const item = [...document.querySelectorAll('.operations-search .record-review')].find((candidate) => candidate.innerText.includes(${JSON.stringify(accountId)})); if (!item) return false; item.click(); return true; })()`);
  assert.equal(selectedSyntheticSupply, true, `Synthetic supply ${accountId} must be visible before selection`);
  await waitForExpression(cdp, `document.querySelector('.operations-search .admin-record--selected .record-review')?.innerText.includes(${JSON.stringify(accountId)}) === true`, `synthetic supply selection ${accountId}`);
  await waitForExpression(cdp, `document.querySelector('.supply-order-action button:not(:disabled)') !== null`, "enabled order action after supply selection");
  await evaluate(cdp, `document.querySelector('.supply-order-action button:not(:disabled)')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[role="dialog"] select') !== null`, "order assignment dialog technician selector");
  await evaluate(cdp, `(() => { const select = document.querySelector('[role="dialog"] select'); const option = [...select.options].find((item) => item.textContent.includes(${JSON.stringify(technicianUsername)})); if (!option) throw new Error('Synthetic technician missing from assignment dialog'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await evaluate(cdp, `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.includes('Aceptar y crear orden'))?.click()`);
  const assignedOrderVisible = `(() => { const detail = document.querySelector('.admin-order-detail'); return Boolean(detail && detail.innerText.includes(${JSON.stringify(accountId)}) && detail.innerText.includes(${JSON.stringify(technicianUsername)})); })()`;
  await waitForExpression(cdp, assignedOrderVisible, `created order details for ${accountId} assigned to ${technicianUsername}`);
  const order = await pool.query<{ order_id: string; assigned_technician_id: string; version: number }>("SELECT order_id, assigned_technician_id, version FROM orders WHERE debtor_id = $1", [debtorId]);
  assert.equal(order.rows[0]?.assigned_technician_id, technicianId, "Admin UI assignment must persist in PostgreSQL");

  await evaluate(cdp, `[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Cerrar sesión'))?.click()`);
  await login(cdp, technicianUsername, password);
  await waitForExpression(cdp, `document.querySelector('.current-order-card') !== null`, "technician current order card");
  await waitForServiceWorkerControl(cdp);
  await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitForExpression(cdp, `navigator.onLine === false`, "offline browser state");

  await evaluate(cdp, `document.querySelector('.current-order-card .tertiary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard[aria-label="Captura de visita"]') !== null`, "visit capture form");
  await waitForExpression(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.disabled === false`, "visit capture action enabled");
  await evaluate(cdp, `document.querySelector('.capture-wizard input[type="checkbox"]')?.click()`);
  await evaluate(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard textarea') !== null`, "visit evidence exception field");
  await setValue(cdp, '.capture-wizard textarea', 'Excepción de evidencia sintética de prueba conectada.');
  await evaluate(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('.capture-wizard h3')?.textContent === 'Revisar y confirmar'`, "visit capture review step");
  await evaluate(cdp, `document.querySelector('.capture-wizard__footer .primary-action')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[role="dialog"] h2')?.textContent === 'Visita guardada'`, "visit saved confirmation");
  const operationId = await evaluate(cdp, `document.querySelector('[role="dialog"]')?.innerText`);
  await evaluate(cdp, `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Listo')?.click()`);
  await cdp.send("Page.navigate", { url: frontendUrl });
  await waitForExpression(cdp, `document.querySelector('.current-order-card') !== null`, "field package recovery after reload");
  await evaluate(cdp, `[...document.querySelectorAll('.bottom-navigation button')].find((button) => button.textContent.includes('Pendientes'))?.click()`);
  await waitForExpression(cdp, `document.querySelector('.queue-panel .queue-status--pending') !== null`, "durable offline queue after reload");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitForExpression(cdp, `navigator.onLine === true`, "browser reconnect");
  await waitForExpression(cdp, `document.querySelector('.queue-panel .queue-status--synced') !== null`, "queued visit synchronization", 120);

  // Corte desde la interfaz (D020). La primera respuesta del consumo se pierde después de que el servidor la
  // procesó: la app debe reintentar con el mismo operationId y el servidor responder con un replay (D019).
  let lostConsumeResponses = 0;
  cdp.on("Fetch.requestPaused", (event) => {
    // Solo el POST: el preflight CORS (OPTIONS) no llega al consumo.
    if (lostConsumeResponses === 0 && event.request?.method === "POST") {
      lostConsumeResponses += 1;
      void cdp?.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "ConnectionReset" });
    } else void cdp?.send("Fetch.continueRequest", { requestId: event.requestId });
  });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/v1/authorizations/cut/consume", requestStage: "Response" }] });
  await openAssignedOrder(cdp);
  await clickButton(cdp, ".order-review-actions", "Registrar corte");
  await waitForStep(cdp, "Lectura");
  await setInputValue(cdp, '.capture-wizard input[type="number"]', "123.45");
  await clickWizardPrimary(cdp);
  await waitForStep(cdp, "Datos del corte");
  await evaluate(cdp, `document.querySelector('.capture-wizard input[type="checkbox"]')?.click()`);
  await clickWizardPrimary(cdp);
  await waitForStep(cdp, "Ubicación GPS");
  await clickButton(cdp, ".capture-wizard", "Capturar GPS");
  await waitForExpression(cdp, `document.querySelector('.capture-wizard')?.innerText.includes('precisión') === true`, "captured GPS");
  await clickWizardPrimary(cdp);
  await waitForStep(cdp, "Evidencia");
  const cutCameraBytes = await attachCameraPhoto(cdp, "corte.jpg");
  await clickWizardPrimary(cdp);
  await waitForStep(cdp, "Revisar y confirmar");
  await clickWizardPrimary(cdp);
  await closeResultDialog(cdp);
  const orderId = order.rows[0]?.order_id;
  const cutAudit = await waitForAudit(pool, orderId, "SYNC_CUT");
  assert.equal(lostConsumeResponses, 1, "The first consume response must have been lost on purpose");
  assert.ok(cutAudit.includes("CONSUME_CUT") && cutAudit.includes("CONSUME_CUT_REPLAY"), `Lost consume response must be retried with the same operation: ${cutAudit.join(", ")}`);
  const cutEvidence = await pool.query<{ status: string }>("SELECT e.status FROM evidence_assets e JOIN sync_operations s ON s.operation_id = e.operation_id WHERE s.order_id = $1 AND s.action = 'CUT'", [orderId]);
  assert.equal(cutEvidence.rows[0]?.status, "verified", "The cut photo must be uploaded and verified");
  const cutOrder = await pool.query<{ status: string; physical_status: string }>("SELECT status, physical_status FROM orders WHERE order_id = $1", [orderId]);
  assert.deepEqual(cutOrder.rows[0], { status: "EJECUTADO", physical_status: "CONFIRMED" });

  // Reconexión desde la interfaz sobre la misma orden.
  await cdp.send("Fetch.disable");
  await waitForExpression(cdp, `[...document.querySelectorAll('.order-review-actions button')].some((button) => button.textContent.includes('Preparar reconexión') && !button.disabled)`, "reconnection action after the confirmed cut", 60);
  await clickButton(cdp, ".order-review-actions", "Preparar reconexión");
  await waitForStep(cdp, "Evidencia");
  await attachCameraPhoto(cdp, "reconexion.jpg");
  await clickWizardPrimary(cdp);
  await waitForStep(cdp, "Revisar y confirmar");
  await clickWizardPrimary(cdp);
  await closeResultDialog(cdp);
  const reconnectionAudit = await waitForAudit(pool, orderId, "SYNC_RECONNECTION");
  assert.ok(reconnectionAudit.includes("CONSUME_RECONNECTION"), `Reconnection must consume its enablement: ${reconnectionAudit.join(", ")}`);
  const reconnectedOrder = await pool.query<{ status: string; physical_status: string }>("SELECT status, physical_status FROM orders WHERE order_id = $1", [orderId]);
  assert.deepEqual(reconnectedOrder.rows[0], { status: "RECONEXIÓN", physical_status: "CONFIRMED" });

  const persisted = await pool.query<{ status: string }>("SELECT status FROM sync_operations WHERE order_id = $1 AND action = 'VISIT' ORDER BY created_at DESC LIMIT 1", [order.rows[0]?.order_id]);
  assert.equal(persisted.rows[0]?.status, "acknowledged", "Recovered offline visit must sync into PostgreSQL");
  const audit = await pool.query("SELECT audit_id FROM audit_events WHERE order_id = $1 AND action = 'SYNC_VISIT' AND result = 'accepted'", [order.rows[0]?.order_id]);
  assert.ok(audit.rows.length > 0, "PostgreSQL must retain accepted sync audit");
  console.log(JSON.stringify({ result: "passed", browser: "headless Chrome/Chromium", checks: ["admin login", "order creation and assignment", "technician login", "offline visit", "reload recovery", "sync and PostgreSQL audit", "CUT from the UI with synthetic camera photo and GPS", "lost consume response retried with the same operation", "RECONNECTION from the UI", "PostgreSQL evidence and audit"], cameraBytes: cutCameraBytes }));
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

async function clickButton(client: CdpClient, scope: string, text: string): Promise<void> {
  await waitForExpression(client, `[...document.querySelectorAll(${JSON.stringify(scope + " button")})].some((button) => button.textContent.includes(${JSON.stringify(text)}) && !button.disabled)`, `button ${text}`);
  await evaluate(client, `[...document.querySelectorAll(${JSON.stringify(scope + " button")})].find((button) => button.textContent.includes(${JSON.stringify(text)}) && !button.disabled)?.click()`);
}

async function openAssignedOrder(client: CdpClient): Promise<void> {
  await clickButton(client, ".bottom-navigation", "Inicio");
  await clickButton(client, ".current-order-card", "Abrir orden");
  await waitForExpression(client, `document.querySelector('.order-review-actions') !== null`, "order review actions");
}

async function waitForStep(client: CdpClient, title: string): Promise<void> {
  await waitForExpression(client, `document.querySelector('.capture-wizard h3')?.textContent === ${JSON.stringify(title)}`, `capture step ${title}`);
}

async function clickWizardPrimary(client: CdpClient): Promise<void> {
  await waitForExpression(client, `document.querySelector('.capture-wizard__footer .primary-action')?.disabled === false`, "enabled capture action");
  await evaluate(client, `document.querySelector('.capture-wizard__footer .primary-action')?.click()`);
}

async function setInputValue(client: CdpClient, selector: string, value: string): Promise<void> {
  await evaluate(client, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}

/** Toma un cuadro de la cámara sintética y lo entrega al selector de foto del asistente como un archivo JPEG. */
async function attachCameraPhoto(client: CdpClient, fileName: string): Promise<number> {
  const bytes = await evaluate(client, `(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.createElement('video'); video.muted = true; video.srcObject = stream; await video.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    canvas.getContext('2d').drawImage(video, 0, 0, 64, 64);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    stream.getTracks().forEach((track) => track.stop());
    if (!blob) throw new Error('Synthetic camera frame encoding failed');
    const input = document.querySelector('.capture-wizard .file-field__input');
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], ${JSON.stringify(fileName)}, { type: 'image/jpeg' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return blob.size;
  })()`);
  await waitForExpression(client, `document.querySelector('.capture-wizard')?.innerText.includes(${JSON.stringify(fileName)}) === true || document.querySelector('.capture-wizard img') !== null`, `selected photo ${fileName}`);
  return bytes;
}

async function closeResultDialog(client: CdpClient): Promise<void> {
  await waitForExpression(client, `[...document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent.trim() === 'Listo')`, "action result dialog", 60);
  await evaluate(client, `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Listo')?.click()`);
}

/** Espera hasta que la auditoría de la orden contenga la acción y devuelve todas sus acciones. */
async function waitForAudit(database: Pool, orderId: string | undefined, action: string): Promise<string[]> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const rows = await database.query<{ action: string }>("SELECT action FROM audit_events WHERE order_id = $1 ORDER BY occurred_at", [orderId]);
    const actions = rows.rows.map((row) => row.action);
    if (actions.includes(action)) return actions;
    await delay(250);
  }
  throw new Error(`Timed out waiting for audit ${action} on order ${orderId}.`);
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

/** Si la página no queda controlada por el Service Worker, el error dice en qué estado quedó el registro. */
async function waitForServiceWorkerControl(client: CdpClient): Promise<void> {
  try {
    await waitForExpression(client, `navigator.serviceWorker.controller !== null`, "PWA service worker control");
  } catch (error) {
    const state = await evaluate(client, `(async () => { const registration = await navigator.serviceWorker.getRegistration(); return JSON.stringify({ controller: navigator.serviceWorker.controller?.state ?? null, registration: registration ? { scope: registration.scope, active: registration.active?.state ?? null, installing: registration.installing?.state ?? null, waiting: registration.waiting?.state ?? null } : null, caches: await caches.keys() }); })()`)
      .catch((diagnosticError: unknown) => `unavailable: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
    throw new Error(`${error instanceof Error ? error.message : String(error)}; service worker state: ${state}`);
  }
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

type CdpClient = { send(method: string, params?: Record<string, unknown>): Promise<any>; on(method: string, handler: (params: any) => void): void; close(): void };
async function connectCdp(url: string): Promise<CdpClient> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolveOpen, reject) => { socket.addEventListener("open", () => resolveOpen(), { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const handlers = new Map<string, (params: any) => void>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      if (message.method) handlers.get(message.method)?.(message.params);
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    send(method, params = {}) { const nextId = ++id; socket.send(JSON.stringify({ id: nextId, method, params })); return new Promise((resolveResult, reject) => pending.set(nextId, { resolve: resolveResult, reject })); },
    on(method, handler) { handlers.set(method, handler); },
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
