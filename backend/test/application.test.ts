import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import test from "node:test";
import type { Pool } from "pg";
import { Application } from "../src/application.js";
import { hashToken } from "../src/auth.js";
import type { SecurityEvent } from "../src/security-logger.js";
import { assertSchema } from "./contract-schema.js";

const config = {
  host: "127.0.0.1",
  port: 0,
  databaseUrl: "postgres://test",
  sessionTtlSeconds: 3600,
  authorizationTtlSeconds: 300,
  maxBodyBytes: 1024,
  corsOrigin: "http://localhost:5173",
};

test("admin technician catalog exposes active technician identities without credentials", async () => {
  const pool = new CatalogPool("ADMIN");
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/technicians`, { headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assertSchema("TechniciansResponse", body);
    assert.deepEqual(body, {
      source: "PILOT_PROVISIONAL",
      technicians: [
        { user_id: "technician-1", username: "tech.one", display_name: "Technician One", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" },
      ],
    });
    assert.match(pool.catalogQuery, /role = 'TECHNICIAN'/);
    assert.match(pool.catalogQuery, /enabled = true/);
    assert.doesNotMatch(JSON.stringify(body), /password|hash/i);
  } finally {
    await close(server);
  }
});

test("technician cannot read administrative technician catalog", async () => {
  const pool = new CatalogPool("TECHNICIAN");
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/technicians`, { headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456" } });
    assert.equal(response.status, 403);
    const body = await response.json();
    assertSchema("Error", body);
    assert.deepEqual(body, { code: "FORBIDDEN", message: "Role ADMIN is required." });
  } finally {
    await close(server);
  }
});

test("login returns HttpOnly cookie without exposing session token", async () => {
  const pool = new LoginPool();
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: config.corsOrigin },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { session_token?: string };
    assertSchema("LoginResponse", body);
    assert.equal(body.session_token, undefined);
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /; Secure/i);
  } finally {
    await close(server);
  }
});

test("login cookie revokes current session at logout", async () => {
  const pool = new LoginFlowPool();
  const application = new Application(pool as unknown as Pool, config);
  const server = createServer((request, response) => { void application.handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const root = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${root}/v1/auth/login`, { method: "POST", headers: { origin: config.corsOrigin, "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "password123" }) });
    assert.equal(login.status, 200);
    const cookieValue = /sepsa_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
    assert.ok(cookieValue);
    assert.equal("session_token" in await login.json(), false);
    const logout = await fetch(`${root}/v1/auth/logout`, { method: "POST", headers: { origin: config.corsOrigin, cookie: `sepsa_session=${cookieValue}` } });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
    const later = await fetch(`${root}/v1/orders`, { headers: { cookie: `sepsa_session=${cookieValue}` } });
    assert.equal(later.status, 401);
  } finally { await close(server); }
});

test("production security configuration marks cookie Secure and enables HSTS", async () => {
  const server = createServer((request, response) => { void new Application(new LoginPool() as unknown as Pool, { ...config, cookieSecure: true }).handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/auth/login`, { method: "POST", headers: { origin: config.corsOrigin, "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "password123" }) });
    assert.match(response.headers.get("set-cookie") ?? "", /; Secure/);
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  } finally { await close(server); }
});

test("expired, revoked, and disabled-user sessions fail cookie authentication", async () => {
  const cases = ["expired", "revoked", "disabled"] as const;
  for (const state of cases) {
    const pool = new SessionGuardPool(state);
    const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
    await listen(server);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/orders`, { headers: { cookie: "sepsa_session=synthetic-cookie" } });
      assert.equal(response.status, 401, state);
      assert.equal((await response.json()).code, "UNAUTHENTICATED", state);
      assert.match(pool.queryText, /revoked_at IS NULL AND s\.expires_at > now\(\).*u\.enabled = true/s);
    } finally { await close(server); }
  }
});

test("HTTP responses carry request and security headers; CORS grants only configured origin", async () => {
  const server = createServer((request, response) => { void new Application(new CatalogPool("ADMIN") as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const suppliedId = "a6c5d1e4-1b6f-4d52-9a27-7c34d23089a1";
    const allowed = await fetch(`http://127.0.0.1:${address.port}/v1/technicians`, { headers: { origin: config.corsOrigin, "x-request-id": suppliedId } });
    assert.equal(allowed.headers.get("x-request-id"), suppliedId);
    assert.equal(allowed.headers.get("access-control-allow-origin"), config.corsOrigin);
    assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
    assert.equal(allowed.headers.get("x-frame-options"), "DENY");
    assert.equal(allowed.headers.get("referrer-policy"), "no-referrer");
    assert.equal(allowed.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    const invalidId = await fetch(`http://127.0.0.1:${address.port}/v1/technicians`, { headers: { "x-request-id": "bad id" } });
    assert.match(invalidId.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
    const preflight = await fetch(`http://127.0.0.1:${address.port}/v1/auth/logout`, { method: "OPTIONS", headers: { origin: "https://attacker.invalid" } });
    assert.equal(preflight.status, 403);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
    assert.ok(preflight.headers.get("x-request-id"));
  } finally { await close(server); }
});

test("cookie writes require exact Origin and reject cross-site Fetch Metadata", async () => {
  const emptyPool = { async query<T extends Record<string, unknown>>() { return { rows: [] as T[], rowCount: 0 }; } } as unknown as Pool;
  const application = new Application(emptyPool, config);
  const server = createServer((request, response) => { void application.handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const url = `http://127.0.0.1:${address.port}/v1/auth/logout`;
    const missingOrigin = await fetch(url, { method: "POST", headers: { cookie: "sepsa_session=synthetic-cookie" } });
    assert.equal(missingOrigin.status, 403);
    assert.equal((await missingOrigin.json()).code, "CSRF_ORIGIN_REJECTED");
    const disallowedOrigin = await fetch(url, { method: "POST", headers: { origin: "https://attacker.invalid", cookie: "sepsa_session=synthetic-cookie" } });
    assert.equal(disallowedOrigin.status, 403);
    const crossSite = await fetch(url, { method: "POST", headers: { origin: config.corsOrigin, "sec-fetch-site": "cross-site", cookie: "sepsa_session=synthetic-cookie" } });
    assert.equal(crossSite.status, 403);
    const allowed = await fetch(url, { method: "POST", headers: { origin: config.corsOrigin, cookie: "sepsa_session=synthetic-cookie" } });
    assert.equal(allowed.status, 401);
  } finally { await close(server); }
});

test("login rate limit groups normalized username by socket without echoing username", async () => {
  const pool = new LoginPool();
  const limitedConfig = { ...config, loginRateLimitMax: 1, loginRateLimitWindowSeconds: 60 };
  const application = new Application(pool as unknown as Pool, limitedConfig);
  const server = createServer((request, response) => { void application.handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const send = (username: string) => fetch(`http://127.0.0.1:${address.port}/v1/auth/login`, { method: "POST", headers: { origin: config.corsOrigin, "content-type": "application/json" }, body: JSON.stringify({ username, password: "wrong-password" }) });
    assert.equal((await send("  ADMIN ")).status, 401);
    const limited = await send("admin");
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.doesNotMatch(JSON.stringify(await limited.json()), /admin/i);
  } finally { await close(server); }
});

test("security logger receives only allowlisted event fields", async () => {
  const events: SecurityEvent[] = [];
  const pool = { async query<T extends Record<string, unknown>>() { return { rows: [] as T[], rowCount: 0 }; } } as unknown as Pool;
  const application = new Application(pool, config, { log(event) { events.push(event); } });
  const server = createServer((request, response) => { void application.handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "private-user", password: "private-password" }) });
    assert.equal(response.status, 403);
    assert.equal(events.length, 1);
    assert.deepEqual(Object.keys(events[0] ?? {}).sort(), ["event", "requestId", "result", "status"]);
    assert.doesNotMatch(JSON.stringify(events), /private-user|private-password/);
  } finally { await close(server); }
});

test("admin assignment locks only order and debtor rows with nullable technician join", async () => {
  const pool = new AssignmentPool();
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/orders/order-1/assignment`, {
      method: "POST",
      headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
      body: JSON.stringify({ operation_id: "assign-1", technician_id: "technician-1", expected_version: 1 }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assertSchema("Order", body);
    assert.equal(body.assigned_technician_id, "technician-1");
    assert.equal(body.assigned_technician_name, "Technician One");
    assert.equal(body.version, 2);
    assert.match(pool.lockQuery, /FOR UPDATE OF o, d$/);
  } finally {
    await close(server);
  }
});

test("acknowledges a cut only after pilot evidence verification", async () => {
  const pool = new SyncPool();
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, {
      method: "POST",
      headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
      body: JSON.stringify(localEvidencePayload()),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assertSchema("SyncResponse", body);
    assert.deepEqual(body, {
      status: "acknowledged", operation_id: "cut-local-evidence-1", source: "PILOT_PROVISIONAL", order_id: "order-1",
      technician_id: "technician-1", technician_name_snapshot: "Technician One", device_id: "device-1", order_version: 1, action: "CUT",
      recorded_at: "2026-09-22T14:00:00.000Z", evidence_refs: ["evidence-local-1"], field_capture: (localEvidencePayload() as { field_capture: unknown }).field_capture,
    });
    assert.equal(pool.client.authorizationConsumed, true);
    assert.equal(pool.client.orderExecuted, true);
    assert.equal(pool.client.syncAcknowledged, true);
    assert.equal(pool.client.auditResult, "accepted");
    assert.deepEqual(
      { evidence_refs: (pool.client.auditMetadata as { evidence_refs: unknown[] }).evidence_refs, evidence_storage: (pool.client.auditMetadata as { evidence_storage: string }).evidence_storage, authorization_token: (pool.client.auditMetadata as { authorization_token?: unknown }).authorization_token },
      { evidence_refs: ["evidence-local-1"], evidence_storage: undefined, authorization_token: undefined },
    );
  } finally {
    await close(server);
  }
});

test("rejects CUT before authorization consumption when evidence upload is absent", async () => {
  const pool = new SyncPool(undefined, false, "2099-09-22T14:05:00.000Z", {}, 1, false);
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, { method: "POST", headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" }, body: JSON.stringify(localEvidencePayload()) });
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { code: string }).code, "CONFLICT");
    assert.equal(pool.client.authorizationConsumed, false);
    assert.equal(pool.client.orderExecuted, false);
  } finally { await close(server); }
});

test("keeps controlled photo exception and reason in accepted audit payload", async () => {
  const pool = new SyncPool();
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const payload = { ...localEvidencePayload(), evidence_refs: [], exception_reason: "saltar_control_fotos: cámara fuera de servicio" };
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, { method: "POST", headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    assert.equal(pool.client.authorizationConsumed, true);
    assert.equal((pool.client.auditMetadata as { exception_reason: string }).exception_reason, payload.exception_reason);
  } finally { await close(server); }
});

test("verifies evidence bytes server-side and makes upload retry idempotent", async () => {
  const pool = new EvidencePool();
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, { ...config, maxBodyBytes: 4096 }).handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC", "base64");
    const payload = { evidence_id: "evidence-upload-1", order_id: "order-1", operation_id: "cut-local-evidence-1", device_id: "device-1", mime_type: "image/png", content_hash: createHash("sha256").update(bytes).digest("hex"), content_base64: bytes.toString("base64") };
    const send = () => fetch(`http://127.0.0.1:${address.port}/v1/evidence/assets`, { method: "POST", headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    assert.equal(pool.client.assets.size, 1);
    const rebound = await fetch(`http://127.0.0.1:${address.port}/v1/evidence/assets`, { method: "POST", headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" }, body: JSON.stringify({ ...payload, operation_id: "different-operation" }) });
    assert.equal(rebound.status, 409);
    assert.equal((await rebound.json() as { code: string }).code, "EVIDENCE_BINDING_CONFLICT");
    const mismatch = await fetch(`http://127.0.0.1:${address.port}/v1/evidence/assets`, { method: "POST", headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" }, body: JSON.stringify({ ...payload, content_hash: "0".repeat(64) }) });
    assert.equal(mismatch.status, 422);
  } finally { await close(server); }
});

test("returns the exact receipt for an idempotent acknowledged replay without consuming authorization twice", async () => {
  const payload = localEvidencePayload();
  const pool = new SyncPool({ operation_id: payload.operation_id, technician_id: "technician-1", device_id: "device-1", status: "acknowledged", payload_hash: payloadDigest(payload), conflict_reason: null });
  const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, {
      method: "POST", headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    const receipt = await response.json() as Record<string, unknown>;
    assert.equal(receipt.operation_id, payload.operation_id);
    assert.equal(receipt.order_id, payload.order_id);
    assert.equal(receipt.technician_id, "technician-1");
    assert.equal(receipt.device_id, payload.device_id);
    assert.equal(receipt.order_version, payload.order_version);
    assert.deepEqual(receipt.evidence_refs, payload.evidence_refs);
    assert.equal(pool.client.authorizationConsumed, false);
    assert.equal(pool.client.orderExecuted, false);
    assert.equal(pool.client.auditResult, "");
  } finally { await close(server); }
});

test("lookup returns a complete receipt only to ADMIN or the owning technician", async () => {
  for (const scenario of [{ role: "ADMIN" as const, userId: "admin-1", expected: "confirmed" }, { role: "TECHNICIAN" as const, userId: "technician-1", expected: "confirmed" }, { role: "TECHNICIAN" as const, userId: "another-tech", expected: "not_found" }]) {
    const pool = new LookupPool(scenario.role, scenario.userId);
    const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
    await listen(server);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations/operation-lookup-1`, { headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456" } });
      assert.equal(response.status, 200);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(body.status, scenario.expected);
      if (scenario.expected === "confirmed") {
        assert.equal(body.order_id, "order-1");
        assert.equal(body.technician_id, "technician-1");
        assert.equal(body.device_id, "device-1");
        assert.equal(body.order_version, 7);
        assert.deepEqual(body.evidence_refs, ["evidence-1"]);
        assert.equal(body.authorization_token, undefined);
      }
    } finally { await close(server); }
  }
});

test("does not replay an unresolved legacy sync operation", async () => {
  const payload = localEvidencePayload();
  const pool = new SyncPool({
    operation_id: payload.operation_id,
    technician_id: "technician-1",
    device_id: "device-1",
    status: "pending",
    payload_hash: payloadDigest(payload),
    conflict_reason: "Photo evidence remains pending until its official upload and verification contract is validated with SEPSA.",
  });
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, {
      method: "POST",
      headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 409);
    assert.equal(pool.client.authorizationConsumed, false);
    assert.equal(pool.client.orderExecuted, false);
  } finally {
    await close(server);
  }
});

test("does not consume an expired authorization while reviewing an unresolved legacy operation", async () => {
  const payload = localEvidencePayload();
  const pool = new SyncPool({
    operation_id: payload.operation_id,
    technician_id: "technician-1",
    device_id: "device-1",
    status: "pending",
    payload_hash: payloadDigest(payload),
    conflict_reason: "Photo evidence remains pending until its official upload and verification contract is validated with SEPSA.",
  }, true, "2026-09-22T14:50:00.000Z");
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, {
      method: "POST",
      headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 409);
    assert.equal(pool.client.authorizationConsumed, false);
    assert.equal(pool.client.orderExecuted, false);
  } finally {
    await close(server);
  }
});

test("does not recover a legacy rejection that occurred after the original authorization TTL", async () => {
  const payload = localEvidencePayload();
  const pool = new SyncPool({
    operation_id: payload.operation_id,
    technician_id: "technician-1",
    device_id: "device-1",
    status: "pending",
    payload_hash: payloadDigest(payload),
    conflict_reason: "Photo evidence remains pending until its official upload and verification contract is validated with SEPSA.",
  }, true, "2026-09-22T14:50:00.000Z", {}, 301);
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, {
      method: "POST",
      headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 409);
    assert.equal(pool.client.authorizationConsumed, false);
    assert.equal(pool.client.orderExecuted, false);
  } finally {
    await close(server);
  }
});

test("does not recover an expired authorization without exact legacy server evidence", async () => {
  const original = localEvidencePayload();
  const pendingOperation = {
    operation_id: original.operation_id,
    technician_id: "technician-1",
    device_id: "device-1",
    status: "pending",
    payload_hash: payloadDigest(original),
    conflict_reason: "Photo evidence remains pending until its official upload and verification contract is validated with SEPSA.",
  };
  const scenarios = [
    { label: "new expired operation", payload: original, existing: undefined, priorReject: true },
    { label: "legacy row without rejected audit", payload: original, existing: pendingOperation, priorReject: false },
    { label: "payload changed", payload: { ...original, recorded_at: "2026-09-22T14:01:00.000Z" }, existing: pendingOperation, priorReject: true },
    { label: "consumed authorization", payload: original, existing: pendingOperation, priorReject: true, authorization: { status: "CONSUMED" } },
    { label: "wrong device binding", payload: original, existing: pendingOperation, priorReject: true, authorization: { device_id: "another-device" } },
    { label: "wrong technician binding", payload: original, existing: pendingOperation, priorReject: true, authorization: { technician_id: "another-technician" } },
    { label: "wrong order binding", payload: original, existing: pendingOperation, priorReject: true, authorization: { order_id: "another-order" } },
    { label: "wrong order version binding", payload: original, existing: pendingOperation, priorReject: true, authorization: { order_version: 2 } },
  ];
  for (const scenario of scenarios) {
    const pool = new SyncPool(scenario.existing, scenario.priorReject, "2026-09-22T14:50:00.000Z", scenario.authorization);
    const server = createServer((request, response) => {
      void new Application(pool as unknown as Pool, config).handle(request, response);
    });
    await listen(server);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations`, {
        method: "POST",
        headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
        body: JSON.stringify(scenario.payload),
      });
      assert.equal(response.status, 409, scenario.label);
      assert.equal(pool.client.authorizationConsumed, false, scenario.label);
      assert.equal(pool.client.orderExecuted, false, scenario.label);
    } finally {
      await close(server);
    }
  }
});

test("ADMIN review records uncertain operation with CAS and audit, never confirming it", async () => {
  const pool = new ReviewPool("ADMIN");
  const server = createServer((request, response) => {
    void new Application(pool as unknown as Pool, config).handle(request, response);
  });
  await listen(server);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
    const headers = { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" };
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations/operation-review-1/review`, {
      method: "POST", headers, body: JSON.stringify({ order_id: "order-1", technician_id: "technician-1", device_id: "device-1", expected_version: 4, reason: "Respuesta de sincronización perdida; requiere revisión." }),
    });
    assert.equal(response.status, 200);
    assertSchema("HumanReviewResponse", await response.json());
    assert.equal(pool.client.orderUpdated, true);
    assert.equal(pool.client.auditAction, "HUMAN_REVIEW_RECORDED");
    assert.equal(pool.client.auditActorRole, "ADMIN");
    assert.equal(pool.client.auditReason, "Respuesta de sincronización perdida; requiere revisión.");
    assert.deepEqual(pool.client.auditMetadata, { expected_version: 4, technician_id: "technician-1", device_id: "device-1", remote_operation_status: "not_found", physical_result_confirmed: false });
  } finally { await close(server); }
});

test("technician, stale version, and blank reason cannot record ADMIN review", async () => {
  for (const scenario of [
    { role: "TECHNICIAN" as const, version: 4, reason: "Reason", expectedStatus: 403 },
    { role: "ADMIN" as const, version: 5, reason: "Reason", expectedStatus: 409 },
    { role: "ADMIN" as const, version: 4, reason: "   ", expectedStatus: 400 },
    { role: "ADMIN" as const, version: 4, reason: "Reason", expectedStatus: 409, operation: { order_id: "different-order", technician_id: "technician-1", device_id: "device-1", status: "conflict" } },
  ]) {
    const pool = new ReviewPool(scenario.role, scenario.operation);
    const server = createServer((request, response) => { void new Application(pool as unknown as Pool, config).handle(request, response); });
    await listen(server);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server address is unavailable.");
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/sync/operations/operation-review-1/review`, {
        method: "POST", headers: { authorization: "Bearer PILOT_PROVISIONAL_TOKEN_123456", "content-type": "application/json" },
        body: JSON.stringify({ order_id: "order-1", technician_id: "technician-1", device_id: "device-1", expected_version: scenario.version, reason: scenario.reason }),
      });
      assert.equal(response.status, scenario.expectedStatus);
      assert.equal(pool.client.orderUpdated, false);
    } finally { await close(server); }
  }
});

class CatalogPool {
  catalogQuery = "";

  constructor(private readonly role: "ADMIN" | "TECHNICIAN") {}

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) {
      return {
        rows: [{ session_id: "session-1", user_id: "user-1", username: "user", display_name: "User", role: this.role } as unknown as T],
        rowCount: 1,
      };
    }
    if (text.includes("FROM users WHERE source")) {
      this.catalogQuery = text;
      return {
        rows: [{ user_id: "technician-1", username: "tech.one", display_name: "Technician One", role: "TECHNICIAN", enabled: true } as unknown as T],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected query: ${text}`);
  }
}

class LoginPool {
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("SELECT user_id, username, display_name, role, password_hash")) {
      return {
        rows: [{ user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN", password_hash: "scrypt$16384$8$1$DGPitTZ--gEW7HtAcRpHdg$coTqCTgT-b8lAaNmr53P6w2clR4WDBcACmGWjCN6FpR0fT1FQ1oMosbxIkdtkNu3eTtMn_waaRZsR35nyZvFLA", enabled: true } as unknown as T],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected pool query: ${text}`);
  }

  async connect(): Promise<LoginClient> {
    return new LoginClient();
  }
}

class LoginFlowPool {
  revoked = false;
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("SELECT user_id, username, display_name, role, password_hash")) {
      return { rows: [{ user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN", password_hash: "scrypt$16384$8$1$DGPitTZ--gEW7HtAcRpHdg$coTqCTgT-b8lAaNmr53P6w2clR4WDBcACmGWjCN6FpR0fT1FQ1oMosbxIkdtkNu3eTtMn_waaRZsR35nyZvFLA", enabled: true } as unknown as T], rowCount: 1 };
    }
    if (text.includes("FROM sessions s JOIN users u")) {
      return { rows: this.revoked ? [] : [{ session_id: "session-1", user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } as unknown as T], rowCount: this.revoked ? 0 : 1 };
    }
    throw new Error(`Unexpected pool query: ${text}`);
  }
  async connect(): Promise<LoginFlowClient> { return new LoginFlowClient(this); }
}

class LoginFlowClient {
  constructor(private readonly pool: LoginFlowPool) {}
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text === "BEGIN" || text === "COMMIT" || text.includes("INSERT INTO sessions") || text.includes("INSERT INTO audit_events")) return { rows: [], rowCount: 1 };
    if (text.includes("UPDATE sessions SET revoked_at")) { this.pool.revoked = true; return { rows: [], rowCount: 1 }; }
    throw new Error(`Unexpected client query: ${text}`);
  }
  release(): void {}
}

class SessionGuardPool {
  queryText = "";
  constructor(private readonly state: "expired" | "revoked" | "disabled") {}
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    this.queryText = text;
    if (!text.includes("FROM sessions s JOIN users u")) throw new Error(`Unexpected ${this.state} session query.`);
    return { rows: [], rowCount: 0 };
  }
}

class LoginClient {
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text === "BEGIN" || text === "COMMIT" || text.includes("INSERT INTO sessions") || text.includes("INSERT INTO audit_events")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected client query: ${text}`);
  }

  release(): void {}
}

class AssignmentPool {
  lockQuery = "";

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) {
      return {
        rows: [{ session_id: "session-1", user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } as unknown as T],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected pool query: ${text}`);
  }

  async connect(): Promise<AssignmentClient> {
    return new AssignmentClient(this);
  }
}

class AssignmentClient {
  constructor(private readonly pool: AssignmentPool) {}

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text === "BEGIN" || text === "COMMIT") return { rows: [], rowCount: 0 };
    if (text.includes("INSERT INTO command_operations")) return { rows: [], rowCount: 1 };
    if (text.startsWith("SELECT user_id FROM users")) return { rows: [{ user_id: "technician-1" } as unknown as T], rowCount: 1 };
    if (text.includes("FOR UPDATE OF o, d")) {
      this.pool.lockQuery = text;
      return { rows: [assignmentOrder({ version: 1 }) as unknown as T], rowCount: 1 };
    }
    if (text.startsWith("UPDATE orders SET")) return { rows: [], rowCount: 1 };
    if (text.startsWith("SELECT") && text.includes("FROM orders o")) {
      return { rows: [assignmentOrder({ version: 2, assigned_technician_id: "technician-1", assigned_technician_name: "Technician One" }) as unknown as T], rowCount: 1 };
    }
    if (text.startsWith("INSERT INTO order_assignments")) return { rows: [], rowCount: 1 };
    if (text.startsWith("INSERT INTO audit_events")) return { rows: [], rowCount: 1 };
    if (text.startsWith("UPDATE command_operations")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected client query: ${text}`);
  }

  release(): void {}
}

class SyncPool {
  readonly client: SyncClient;

  constructor(private readonly existingOperation?: Record<string, unknown>, private readonly priorLegacyReject = false, private readonly authorizationExpiresAt = "2099-09-22T14:05:00.000Z", private readonly authorizationOverrides: Record<string, unknown> = {}, private readonly rejectedAuditDelaySeconds = 1, private readonly evidenceVerified = true) {
    this.client = new SyncClient(existingOperation, priorLegacyReject, authorizationExpiresAt, authorizationOverrides, rejectedAuditDelaySeconds, evidenceVerified);
  }

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) {
      return {
        rows: [{ session_id: "session-1", user_id: "technician-1", username: "tech.one", display_name: "Technician One", role: "TECHNICIAN" } as unknown as T],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected pool query: ${text}`);
  }

  async connect(): Promise<SyncClient> {
    return this.client;
  }
}

class SyncClient {
  authorizationConsumed = false;
  orderExecuted = false;
  syncAcknowledged = false;
  auditResult = "";
  auditMetadata: unknown;
  recoveryAuditValues?: unknown[];

  constructor(private readonly existingOperation?: Record<string, unknown>, private readonly priorLegacyReject = false, private readonly authorizationExpiresAt = "2099-09-22T14:05:00.000Z", private readonly authorizationOverrides: Record<string, unknown> = {}, private readonly rejectedAuditDelaySeconds = 1, private readonly evidenceVerified = true) {}

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (text.includes("SELECT operation_id, technician_id, device_id, status, payload_hash, conflict_reason FROM sync_operations")) return { rows: this.existingOperation ? [this.existingOperation as T] : [], rowCount: this.existingOperation ? 1 : 0 };
    if (text.includes("INSERT INTO sync_operations")) return { rows: [], rowCount: 1 };
    if (text.includes("FOR UPDATE OF o, d")) return { rows: [syncOrder() as unknown as T], rowCount: 1 };
    if (text.includes("FROM evidence_assets")) return { rows: (this.evidenceVerified ? (values[0] as string[]) : []).map((evidence_id) => ({ evidence_id } as unknown as T)), rowCount: this.evidenceVerified ? (values[0] as string[]).length : 0 };
    if (text.includes("FROM cut_authorizations")) {
      return {
        rows: [{ authorization_id: "authorization-1", operation_id: "cut-local-evidence-1", token_hash: hashToken("opaque-token"), status: "RESERVED", expires_at: this.authorizationExpiresAt, order_id: "order-1", technician_id: "technician-1", technician_name_snapshot: "Technician One", device_id: "device-1", order_version: 1, action: "CUT", ...this.authorizationOverrides } as unknown as T],
        rowCount: 1,
      };
    }
    if (text.includes("FROM audit_events") && text.includes("AUTHORIZE_CUT")) {
      this.recoveryAuditValues = values;
      const insideOriginalTtl = !text.includes("authorization_audit.occurred_at + ($8 * INTERVAL '1 second')") || this.rejectedAuditDelaySeconds <= Number(values[7]);
      const eligible = this.priorLegacyReject && insideOriginalTtl;
      return { rows: eligible ? [{ eligible: true } as unknown as T] : [], rowCount: eligible ? 1 : 0 };
    }
    if (text.startsWith("UPDATE cut_authorizations SET")) {
      if (text.includes("expires_at > clock_timestamp()") && Date.parse(this.authorizationExpiresAt) <= Date.now()) return { rows: [], rowCount: 0 };
      this.authorizationConsumed = true;
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE orders SET")) {
      this.orderExecuted = true;
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE sync_operations SET status = 'pending'")) return { rows: [], rowCount: 1 };
    if (text.startsWith("UPDATE sync_operations SET status = 'conflict'")) return { rows: [], rowCount: 1 };
    if (text.startsWith("UPDATE sync_operations SET status = 'acknowledged'")) {
      this.syncAcknowledged = true;
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("INSERT INTO audit_events")) {
      this.auditResult = String(values[7] ?? "");
      this.auditMetadata = values[11];
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected client query: ${text}`);
  }

  release(): void {}
}

class EvidencePool {
  readonly client = new EvidenceClient();
  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) return { rows: [{ session_id: "session-1", user_id: "technician-1", username: "tech.one", display_name: "Tech", role: "TECHNICIAN" } as unknown as T], rowCount: 1 };
    if (text.includes("FROM orders")) return { rows: [{ assigned_technician_id: "technician-1" } as unknown as T], rowCount: 1 };
    throw new Error(`Unexpected evidence pool query: ${text}`);
  }
  async connect(): Promise<EvidenceClient> { return this.client; }
}

class EvidenceClient {
  readonly assets = new Map<string, Record<string, unknown>>();
  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [], rowCount: 0 };
    if (text.includes("SELECT assigned_technician_id FROM orders")) return { rows: [{ assigned_technician_id: "technician-1" } as unknown as T], rowCount: 1 };
    if (text.includes("FROM evidence_assets")) {
      const row = this.assets.get(String(values[0]));
      return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith("INSERT INTO evidence_assets")) {
      this.assets.set(String(values[0]), { order_id: values[1], operation_id: values[2], technician_id: values[3], device_id: values[4], mime_type: values[5], content_hash: values[6] } as Record<string, unknown>);
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("INSERT INTO audit_events")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected evidence client query: ${text}`);
  }
  release(): void {}
}

class ReviewPool {
  readonly client: ReviewClient;

  constructor(private readonly role: "ADMIN" | "TECHNICIAN", operation?: Record<string, unknown>) { this.client = new ReviewClient(operation); }

  async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) return { rows: [{ session_id: "session-1", user_id: this.role === "ADMIN" ? "admin-1" : "technician-1", username: "reviewer", display_name: "Reviewer", role: this.role } as unknown as T], rowCount: 1 };
    throw new Error(`Unexpected pool query: ${text}`);
  }

  async connect(): Promise<ReviewClient> { return this.client; }
}

class LookupPool {
  constructor(private readonly role: "ADMIN" | "TECHNICIAN", private readonly userId: string) {}

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (text.includes("FROM sessions")) return { rows: [{ session_id: "session-1", user_id: this.userId, username: "user", display_name: "User", role: this.role } as unknown as T], rowCount: 1 };
    if (text.includes("FROM sync_operations")) {
      const canRead = values[1] === "ADMIN" || values[2] === "technician-1";
      const row = { operation_id: "operation-lookup-1", status: "acknowledged", order_id: "order-1", technician_id: "technician-1", device_id: "device-1", action: "CUT", payload: { recorded_at: "2026-09-29T12:00:00.000Z", evidence_refs: ["evidence-1"], order_version: 7, field_capture: { reading: { value: 1, unit: "kWh" } } } };
      return { rows: canRead ? [row as unknown as T] : [], rowCount: canRead ? 1 : 0 };
    }
    throw new Error(`Unexpected lookup query: ${text}`);
  }
}

class ReviewClient {
  orderUpdated = false;
  auditAction?: string;
  auditActorRole?: string;
  auditReason?: string;
  auditMetadata?: unknown;

  constructor(private readonly operation?: Record<string, unknown>) {}

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [], rowCount: 0 };
    if (text.includes("SELECT order_id, version, status, physical_status, assigned_technician_id FROM orders")) {
      return { rows: [{ order_id: "order-1", version: 4, status: "GENERADO", physical_status: "NONE", assigned_technician_id: "technician-1" } as unknown as T], rowCount: 1 };
    }
    if (text.includes("SELECT order_id, technician_id, device_id, status FROM sync_operations")) return { rows: this.operation ? [this.operation as T] : [], rowCount: this.operation ? 1 : 0 };
    if (text.startsWith("UPDATE orders SET physical_status = 'PHYSICAL_UNKNOWN'")) {
      this.orderUpdated = true;
      assert.deepEqual(values, ["order-1", 4]);
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("INSERT INTO audit_events")) {
      this.auditActorRole = String(values[2]);
      this.auditAction = String(values[3]);
      this.auditReason = String(values[8]);
      this.auditMetadata = values[11];
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected review query: ${text}`);
  }

  release(): void {}
}

function assignmentOrder(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    order_id: "order-1",
    debtor_id: "debtor-1",
    account_id: "account-1",
    supply_id: "supply-1",
    purpose: "CUT",
    status: "GENERADO",
    physical_status: "NONE",
    version: 1,
    created_by: "admin-1",
    assigned_technician_id: null,
    created_at: "2026-09-14T00:00:00.000Z",
    context: {},
    cuc: "CUC-1",
    assigned_technician_name: null,
    ...overrides,
  };
}

function syncOrder(): Record<string, unknown> {
  return {
    order_id: "order-1",
    debtor_id: "debtor-1",
    account_id: "account-1",
    supply_id: "supply-1",
    purpose: "CUT",
    status: "GENERADO",
    physical_status: "NONE",
    version: 1,
    created_by: "admin-1",
    assigned_technician_id: "technician-1",
    created_at: "2026-09-22T13:00:00.000Z",
    context: { meter_id: "meter-1" },
    cuc: "CUC-1",
    assigned_technician_name: "Technician One",
  };
}

function localEvidencePayload(): Record<string, unknown> {
  return {
    operation_id: "cut-local-evidence-1",
    action: "CUT",
    order_id: "order-1",
    device_id: "device-1",
    recorded_at: "2026-09-22T14:00:00.000Z",
    evidence_refs: ["evidence-local-1"],
    technician_id: "technician-1",
    technician_name_snapshot: "Technician One",
    order_version: 1,
    authorization_id: "authorization-1",
    authorization_token: "opaque-token",
    field_capture: {
      reading: { value: 123.45, unit: "kWh", meterId: "meter-1", recordedAt: "2026-09-22T14:00:00.000Z", status: "CAPTURED" },
      location: { latitude: -17.39, longitude: -66.16, accuracyMeters: 8, recordedAt: "2026-09-22T14:00:00.000Z", status: "CAPTURED" },
      cutType: "RED",
      nearbyMeters: false,
    },
  };
}

function payloadDigest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
