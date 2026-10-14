import { describe, expect, it } from "vitest";
import { CONSUME_TIMEOUT_MS, HttpPilotClient } from "./client";

describe("PILOT_PROVISIONAL HTTP client", () => {
  it("limits each consumption request to 15 seconds so a lost response becomes uncertain (RF-19)", () => {
    expect(CONSUME_TIMEOUT_MS).toBe(15_000);
  });


  it("uses browser HttpOnly cookies through login, restored session, and logout", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        return String(input).endsWith("/auth/logout") ? new Response(null, { status: 204 }) : json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } });
      },
    });
    const session = await client.authenticate({ username: "admin", password: "password" });
    expect(session.sessionToken).toBeUndefined();
    const restoredClient = new HttpPilotClient({ baseUrl: "http://localhost:8080", fetchImpl: async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(null, { status: 204 });
    } });
    restoredClient.restoreSession(session);
    await restoredClient.logout(session);
    expect(requests.map((request) => request.init.credentials)).toEqual(["include", "include"]);
    expect(requests.every((request) => !(request.init.headers as Record<string, string>).authorization)).toBe(true);
  });

  it("switches role through the HttpOnly session cookie and preserves identity", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let role = "ADMIN";
    const client = new HttpPilotClient({ baseUrl: "http://localhost:8080", fetchImpl: async (input, init = {}) => {
      requests.push({ url: String(input), init });
      if (String(input).endsWith("/auth/role")) role = JSON.parse(String(init.body)).role;
      return json({ session_id: "session-dual", expires_at: "2099-01-01T00:00:00.000Z", user: { user_id: "dual-user-fixture", username: "dual-role-fixture", display_name: "Dual Role Fixture", role, roles: ["ADMIN", "TECHNICIAN"] } });
    } });
    const admin = await client.authenticate({ username: "dual-role-fixture", password: "test-password" });
    const technician = await client.switchRole(admin, "TECHNICIAN");
    expect(technician).toMatchObject({ sessionId: admin.sessionId, userId: admin.userId, username: admin.username, role: "TECHNICIAN", roles: ["ADMIN", "TECHNICIAN"], issuedAt: admin.issuedAt });
    expect(admin.sessionToken).toBeUndefined();
    expect(technician.sessionToken).toBeUndefined();
    expect(technician.permissions).toContain("DOWNLOAD_ASSIGNED");
    expect(technician.permissions).not.toContain("CREATE_ORDER");
    expect(requests[1]?.init.credentials).toBe("include");
    expect((requests[1]?.init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(JSON.parse(String(requests[1]?.init.body))).toEqual({ role: "TECHNICIAN" });
    expect((await client.currentSession(technician)).role).toBe("TECHNICIAN");
    expect((await client.switchRole(technician, "ADMIN")).permissions).toContain("CREATE_ORDER");
  });

  it("waits for paginated admin reads to finish before switching roles", async () => {
    const requests: string[] = [];
    const debtorFirstStarted = deferred<void>();
    const debtorSecondStarted = deferred<void>();
    const auditFirstStarted = deferred<void>();
    const auditSecondStarted = deferred<void>();
    const debtorFirstPage = deferred<Response>();
    const debtorSecondPage = deferred<Response>();
    const auditFirstPage = deferred<Response>();
    const auditSecondPage = deferred<Response>();
    let roleSwitchSent = false;
    let role = "ADMIN";
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        const url = new URL(String(input));
        requests.push(`${url.pathname}${url.search}`);
        if (url.pathname === "/v1/auth/login") return json({ session_id: "session-dual", expires_at: "2099-01-01T00:00:00.000Z", user: { user_id: "dual-user-fixture", username: "dual-role-fixture", display_name: "Dual Role Fixture", role, roles: ["ADMIN", "TECHNICIAN"] } });
        if (url.pathname === "/v1/debtors") {
          if (url.searchParams.has("cursor")) {
            debtorSecondStarted.resolve(undefined);
            return debtorSecondPage.promise;
          }
          debtorFirstStarted.resolve(undefined);
          return debtorFirstPage.promise;
        }
        if (url.pathname === "/v1/audit") {
          if (url.searchParams.has("cursor")) {
            auditSecondStarted.resolve(undefined);
            return auditSecondPage.promise;
          }
          auditFirstStarted.resolve(undefined);
          return auditFirstPage.promise;
        }
        if (url.pathname === "/v1/auth/role") {
          roleSwitchSent = true;
          role = JSON.parse(String(init.body)).role;
          return json({ session_id: "session-dual", expires_at: "2099-01-01T00:00:00.000Z", user: { user_id: "dual-user-fixture", username: "dual-role-fixture", display_name: "Dual Role Fixture", role, roles: ["ADMIN", "TECHNICIAN"] } });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
    });
    const admin = await client.authenticate({ username: "dual-role-fixture", password: "test-password" });
    const debtorRead = client.findDebtors({ session: admin });
    const auditRead = client.listAudit({ session: admin });
    await Promise.all([debtorFirstStarted.promise, auditFirstStarted.promise]);

    const roleSwitch = client.switchRole(admin, "TECHNICIAN");
    expect(roleSwitchSent).toBe(false);

    debtorFirstPage.resolve(json({ debtors: [], next_cursor: "100" }));
    auditFirstPage.resolve(json({ audit: [], next_cursor: "100" }));
    await Promise.all([debtorSecondStarted.promise, auditSecondStarted.promise]);
    expect(roleSwitchSent).toBe(false);

    debtorSecondPage.resolve(json({ debtors: [], next_cursor: null }));
    await debtorRead;
    expect(roleSwitchSent).toBe(false);

    auditSecondPage.resolve(json({ audit: [], next_cursor: null }));
    await Promise.all([auditRead, roleSwitch]);
    expect(roleSwitchSent).toBe(true);
    expect(requests.at(-1)).toBe("/v1/auth/role");
  });

  it("keeps role unchanged after rejected switch, blocks offline switch, and restores authoritative role", async () => {
    let requestCount = 0;
    const client = new HttpPilotClient({ baseUrl: "http://localhost:8080", fetchImpl: async (input) => {
      requestCount++;
      if (String(input).endsWith("/auth/role")) return new Response(JSON.stringify({ code: "ROLE_NOT_GRANTED", message: "Rol no concedido" }), { status: 403 });
      return json({ session_id: "session-single", expires_at: "2099-01-01T00:00:00.000Z", user: { user_id: "single-role-fixture", username: "single-role-fixture", display_name: "Single Role Fixture", role: "ADMIN", roles: ["ADMIN"] } });
    } });
    const admin = await client.authenticate({ username: "single-role-fixture", password: "test-password" });
    expect(admin.roles).toEqual(["ADMIN"]);
    await expect(client.switchRole(admin, "TECHNICIAN")).rejects.toThrow("Rol no concedido");
    expect(admin.role).toBe("ADMIN");
    client.setMode("offline");
    await expect(client.switchRole(admin, "TECHNICIAN")).rejects.toMatchObject({ name: "NetworkUnknownError" });
    expect(requestCount).toBe(2);
    client.setMode("online");
    client.restoreSession({ ...admin, role: "TECHNICIAN" });
    expect((await client.currentSession(admin)).role).toBe("ADMIN");
  });

  it("rejects a role-switch response that changes session identity", async () => {
    const client = new HttpPilotClient({ baseUrl: "http://localhost:8080", fetchImpl: async (input) => json({ session_id: String(input).endsWith("/auth/role") ? "another-session" : "session-dual", expires_at: "2099-01-01T00:00:00.000Z", user: { user_id: "dual-user-fixture", username: "dual-role-fixture", display_name: "Dual Role Fixture", role: "ADMIN", roles: ["ADMIN", "TECHNICIAN"] } }) });
    const admin = await client.authenticate({ username: "dual-role-fixture", password: "test-password" });
    await expect(client.switchRole(admin, "TECHNICIAN")).rejects.toThrow("La identidad de sesión cambió");
  });

  it("loads enabled technicians from the authoritative API", async () => {
    const requests: string[] = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input) => {
        requests.push(String(input));
        if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } });
        if (String(input).endsWith("/technicians")) return json({ technicians: [{ user_id: "technician-1", username: "tech.one", display_name: "Técnico Uno", role: "TECHNICIAN", enabled: true, source: "PILOT_PROVISIONAL" }] });
        return json({ debtors: [] });
      },
    });
    const session = await client.authenticate({ username: "admin", password: "password" });

    await expect(client.listTechnicians(session)).resolves.toEqual([expect.objectContaining({ userId: "technician-1", username: "tech.one", displayName: "Técnico Uno", enabled: true, source: "PILOT_PROVISIONAL" })]);
    expect(requests).toContain("http://localhost:8080/v1/technicians");
  });

  it("sends all administrative delinquency filters and maps batch creation", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } });
        if (String(input).endsWith("/orders/batch")) return json({ batch_id: "batch-1", requested_debtor_ids: ["debtor-1"], created: [{ order_id: "order-1", debtor_id: "debtor-1", account_id: "account-1", assigned_technician_id: "", status: "GENERADO", physical_status: "NONE", version: 1, created_by: "admin-1", created_at: "2026-09-13T00:00:00.000Z" }], skipped: [] });
        return json({ debtors: [] });
      },
    });
    const session = await client.authenticate({ username: "admin", password: "password" });

    await client.findDebtors({ query: "CTA", area: "B", locality: "002", route: "002", minMonthsPending: 2, supplyStatus: "A", session });
    const batch = await client.createOrdersBatch({ batchId: "batch-1", debtorIds: ["debtor-1"], purpose: "CUT", session });

    expect(requests[1]?.url).toContain("query=CTA");
    expect(requests[1]?.url).toContain("min_months_pending=2");
    expect(requests[1]?.url).toContain("supply_status=A");
    expect(batch).toMatchObject({ batchId: "batch-1", created: [{ orderId: "order-1" }] });
    expect(JSON.parse(String(requests[2]?.init.body))).toEqual({ batch_id: "batch-1", debtor_ids: ["debtor-1"], purpose: "CUT" });
  });

  it("follows server cursors for complete debtor and audit results, exposes page seam", async () => {
    const urls: string[] = [];
    const client = new HttpPilotClient({ baseUrl: "http://localhost:8080", fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } });
      if (url.includes("/v1/debtors")) {
        const cursor = new URL(url).searchParams.get("cursor");
        const index = cursor === "100" ? 1 : 0;
        return json({ debtors: [debtorDto(index)], total: 101, next_cursor: index === 0 ? "100" : null });
      }
      const cursor = new URL(url).searchParams.get("cursor");
      const index = cursor === "100" ? 1 : 0;
      return json({ audit: [auditDto(index)], total: 101, next_cursor: index === 0 ? "100" : null });
    } });
    const session = await client.authenticate({ username: "admin", password: "password" });

    await expect(client.findDebtors({ session })).resolves.toHaveLength(2);
    await expect(client.listAudit({ session })).resolves.toHaveLength(2);
    await expect(client.countAudit(session)).resolves.toBe(101);
    await expect(client.findDebtorsPage({ session }, "100")).resolves.toMatchObject({ nextCursor: undefined, total: 101, debtors: [{ debtorId: "debtor-1" }] });
    expect(urls.filter((url) => url.includes("/v1/debtors")).every((url) => new URL(url).searchParams.get("limit") === "100")).toBe(true);
    expect(urls).toContain("http://localhost:8080/v1/audit?limit=100&cursor=100");
    expect(urls).toContain("http://localhost:8080/v1/audit?limit=1");
  });

  it("maps authoritative area and route names for filter labels", async () => {
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input) => String(input).endsWith("/auth/login")
        ? json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } })
        : json({ debtors: [{ debtor_id: "debtor-1", account_id: "account-1", supply_id: "supply-1", customer_name: "Customer", address: "Address", references: "", meter_id: "meter-1", area: "B", area_name: "BETANZOS", locality: "078 - COA COA", route: "078", route_name: "COA COA", debt_cents: 100, months_pending: 1, updated_at: "2026-09-14T00:00:00.000Z", kardex: [], source: "PILOT_PROVISIONAL" }] }),
    });
    const session = await client.authenticate({ username: "admin", password: "password" });

    await expect(client.findDebtors({ session })).resolves.toEqual([expect.objectContaining({ area: "B", areaName: "BETANZOS", route: "078", routeName: "COA COA" })]);
  });

  it("requests one debtor page by offset and limit, and reads filter options in one call", async () => {
    const urls: string[] = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "admin-1", username: "admin", display_name: "Admin", role: "ADMIN" } });
        if (url.includes("/v1/debtors/filter-options")) return json({ source: "PILOT_PROVISIONAL", options: [{ area: "B", area_name: "BETANZOS", locality: "078 - COA COA", route: "078", route_name: "COA COA", supply_status: "A" }] });
        return json({ debtors: [debtorDto(7)], total: 8, next_cursor: null });
      },
    });
    const session = await client.authenticate({ username: "admin", password: "password" });

    await expect(client.findDebtorPage({ session, query: "CTA", minMonthsPending: 2, supplyStatus: "A", offset: 7, limit: 7 })).resolves.toEqual({ debtors: [expect.objectContaining({ debtorId: "debtor-7" })], total: 8 });
    await expect(client.listDebtorFilterRecords(session)).resolves.toEqual([{ area: "B", areaName: "BETANZOS", locality: "078 - COA COA", route: "078", routeName: "COA COA", supplyStatus: "A" }]);
    const pageUrl = new URL(urls.find((url) => url.includes("/v1/debtors?")) ?? "");
    expect(pageUrl.searchParams.get("offset")).toBe("7");
    expect(pageUrl.searchParams.get("limit")).toBe("7");
    expect(pageUrl.searchParams.has("cursor")).toBe(false);
    expect(urls.filter((url) => url.includes("/v1/debtors"))).toHaveLength(2);
  });

  it("consumes the cut authorization immediately (D020) and sends its binding to sync", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Tech", role: "TECHNICIAN" } });
        if (String(input).endsWith("/authorizations/cut")) return json({ authorization_id: "auth-1", token: "opaque-1", order_id: "order-1", technician_id: "tech-1", device_id: "device-1", operation_id: "cut-1", version: 2, issued_at: "2026-09-12T09:00:00.000Z", expires_at: "2026-09-12T09:05:00.000Z" });
        if (String(input).endsWith("/authorizations/cut/consume")) return json({ status: "consumed", operation_id: "cut-1", source: "PILOT_PROVISIONAL" });
        if (String(input).endsWith("/authorizations/cut/cut-1")) return json({ status: "consumed", operation_id: "cut-1", source: "PILOT_PROVISIONAL" });
        return json({ status: "acknowledged", operation_id: "cut-1" });
      },
    });

    const session = await client.authenticate({ username: "tech", password: "password" });
    const authorization = await client.requestCut({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "cut-1", orderVersion: 2 });
    const consumed = await client.consumeCut({ authorizationId: "auth-1", token: "opaque-1", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "cut-1", version: 2 });
    await expect(client.lookupCutAuthorization("cut-1")).resolves.toEqual({ status: "consumed", operationId: "cut-1" });
    const result = await client.send({ operationId: "cut-1", action: "CUT", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", recordedAt: "2026-09-12T09:01:00.000Z", evidenceRefs: ["evidence-1"], orderVersion: 2, authorizationId: authorization.grant?.authorizationId, authorizationToken: authorization.grant?.token, fieldCapture: { reading: { value: 1, unit: "kWh", meterId: "meter-1", recordedAt: "2026-09-12T09:01:00.000Z", status: "CAPTURED" }, location: { latitude: 1, longitude: 1, accuracyMeters: 5, recordedAt: "2026-09-12T09:01:00.000Z", status: "CAPTURED" }, cutType: "RED", nearbyMeters: false } }, session);

    expect(session.authenticity).toBe("PILOT_PROVISIONAL");
    expect(authorization.grant?.consumption).toBe("immediate");
    expect(consumed).toEqual({ status: "consumed", operationId: "cut-1" });
    expect(JSON.parse(String(requests[2]?.init.body))).toEqual({ authorization_id: "auth-1", token: "opaque-1", order_id: "order-1", technician_id: "tech-1", device_id: "device-1", operation_id: "cut-1", version: 2 });
    expect(result).toEqual({ status: "acknowledged", operationId: "cut-1" });
    expect(JSON.parse(String(requests[4]?.init.body))).toMatchObject({ authorization_id: "auth-1", authorization_token: "opaque-1", order_version: 2, operation_id: "cut-1" });
  });

  it.each([
    ["ORDER_NOT_FOUND", 404],
    ["ORDER_NOT_ASSIGNED", 403],
    ["VERSION_CONFLICT", 409],
    ["ORDER_NOT_ELIGIBLE", 409],
    ["PHYSICAL_STATUS_NOT_ELIGIBLE", 409],
    ["UNAUTHENTICATED", 401],
  ])("returns explicit %s cut rejection as not_authorized so the cut is recorded as blocked", async (code, status) => {
    const client = authorizationClient("/authorizations/cut", () => new Response(JSON.stringify({ code, message: "Rechazo del backend." }), { status }));
    await client.authenticate({ username: "tech", password: "password" });

    await expect(client.requestCut({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "cut-1", orderVersion: 2 })).resolves.toEqual({ operationId: "cut-1", status: "not_authorized", errorCode: code });
  });

  it.each([
    ["AUTHORIZATION_OPERATION_REPLAY", 409],
    ["IDEMPOTENCY_CONFLICT", 409],
    ["INTERNAL_ERROR", 500],
  ])("returns %s cut response as unknown so the cut is kept for review", async (code, status) => {
    const client = authorizationClient("/authorizations/cut", () => new Response(JSON.stringify({ code, message: "Respuesta en duda." }), { status }));
    await client.authenticate({ username: "tech", password: "password" });

    await expect(client.requestCut({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "cut-1", orderVersion: 2 })).resolves.toEqual({ operationId: "cut-1", status: "unknown", errorCode: code });
  });

  it.each([
    ["VERSION_CONFLICT", 409, "not_enabled"],
    ["UNAUTHENTICATED", 401, "not_enabled"],
    ["ENABLEMENT_OPERATION_REPLAY", 409, "unknown"],
    ["IDEMPOTENCY_CONFLICT", 409, "unknown"],
    ["INTERNAL_ERROR", 500, "unknown"],
  ])("maps reconnection %s (HTTP %s) to %s", async (code, status, expected) => {
    const client = authorizationClient("/authorizations/reconnection", () => new Response(JSON.stringify({ code, message: "Respuesta de reconexión." }), { status }));
    await client.authenticate({ username: "tech", password: "password" });

    await expect(client.requestReconnection({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "reconnect-1", orderVersion: 2 })).resolves.toEqual({ operationId: "reconnect-1", status: expected, errorCode: code });
  });

  it.each([
    [502, "BAD_GATEWAY"],
    [503, "HTTP_ERROR"],
    [401, "UNAUTHENTICATED"],
  ])("returns an uncertain consume for HTTP %i with a timeout signal", async (status, code) => {
    const signals: Array<AbortSignal | null | undefined> = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Técnico Uno", role: "TECHNICIAN" } });
        signals.push(init.signal);
        return new Response(code === "HTTP_ERROR" ? "<html>Bad gateway</html>" : JSON.stringify({ code, message: "x" }), { status, headers: { "content-type": "application/json" } });
      },
    });
    await client.authenticate({ username: "tech", password: "password" });
    await expect(client.consumeReconnection({ enablementId: "enablement-1", token: "one-use-token", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "reconnect-1", version: 4 }))
      .resolves.toEqual({ operationId: "reconnect-1", status: "unknown", errorCode: code });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("uses provisional reconnection habilitation and sync contracts without resending the consumed token", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const operationId = "reconnection-http-1";
    const effectiveAt = "2026-10-04T10:00:00.000Z";
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Técnico Uno", role: "TECHNICIAN" } });
        if (String(input).endsWith("/authorizations/reconnection")) return json({ enablement_id: "enablement-1", token: "one-use-token", order_id: "order-1", technician_id: "tech-1", technician_name_snapshot: "Técnico Uno", device_id: "device-1", operation_id: operationId, version: 4, issued_at: effectiveAt, expires_at: "2099-09-12T17:05:00.000Z", source: "PILOT_PROVISIONAL" });
        if (String(input).endsWith("/authorizations/reconnection/consume")) return json({ status: "consumed", operation_id: operationId, source: "PILOT_PROVISIONAL" });
        if (String(input).includes("/authorizations/reconnection/")) return json({ status: "consumed", operation_id: operationId, source: "PILOT_PROVISIONAL" });
        if (String(input).endsWith("/sync/operations")) return json({ status: "acknowledged", operation_id: operationId, source: "PILOT_PROVISIONAL", order_id: "order-1", technician_id: "tech-1", technician_name_snapshot: "Técnico Uno", device_id: "device-1", order_version: 4, action: "RECONNECTION", recorded_at: effectiveAt, effective_at: effectiveAt, demora: "Sin demora", evidence_refs: [] });
        return json({ status: "not_found", operation_id: operationId });
      },
    });
    const session = await client.authenticate({ username: "tech", password: "password" });
    const request = { orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId, orderVersion: 4, technicianNameSnapshot: "cliente-no-autoritativo" };
    const habilitation = await client.requestReconnection(request);
    expect(habilitation.grant).toMatchObject({ enablementId: "enablement-1", technicianNameSnapshot: "Técnico Uno", operationId });
    await expect(client.consumeReconnection({ enablementId: "enablement-1", token: "one-use-token", ...request, version: 4 })).resolves.toMatchObject({ status: "consumed", operationId });
    await expect(client.lookupReconnection(operationId)).resolves.toMatchObject({ status: "consumed", operationId });
    const payload = { operationId, action: "RECONNECTION" as const, orderId: "order-1", technicianId: "tech-1", technicianNameSnapshot: "Técnico Uno", deviceId: "device-1", recordedAt: effectiveAt, effectiveAt, demora: "Sin demora", evidenceRefs: [], orderVersion: 4, authorizationId: "enablement-1" };
    await expect(client.send(payload, session)).resolves.toMatchObject({ status: "acknowledged", orderVersion: 4, action: "RECONNECTION", effectiveAt, demora: "Sin demora", technicianNameSnapshot: "Técnico Uno" });

    expect(JSON.parse(String(requests[1]?.init.body))).toEqual({ operation_id: operationId, order_id: "order-1", device_id: "device-1", order_version: 4 });
    const syncBody = JSON.parse(String(requests[4]?.init.body)) as Record<string, unknown>;
    expect(syncBody).toMatchObject({ action: "RECONNECTION", operation_id: operationId, technician_name_snapshot: "Técnico Uno", effective_at: effectiveAt, demora: "Sin demora", authorization_id: "enablement-1" });
    expect(syncBody).not.toHaveProperty("authorization_token");
  });

  it("rejects a tampered assigned package before local persistence", async () => {
    const packageValue = { package_id: "package-1", technician_id: "tech-1", device_id: "device-1", version: 1, downloaded_at: "2026-09-12T09:00:00.000Z", orders: [] };
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input) => String(input).endsWith("/auth/login")
        ? json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Tech", role: "TECHNICIAN" } })
        : json({ package: packageValue, checksum: "tampered" }),
    });
    const session = await client.authenticate({ username: "tech", password: "password" });

    await expect(client.downloadAssigned("tech-1", "device-1", session)).rejects.toThrow("La validación de integridad del paquete de trabajo del servidor falló.");
  });
});

function authorizationClient(endpoint: string, authorizationResponse: () => Response): HttpPilotClient {
  return new HttpPilotClient({
    baseUrl: "http://localhost:8080",
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Tech", role: "TECHNICIAN" } });
      if (String(input).endsWith(endpoint)) return authorizationResponse();
      throw new Error(`Unexpected request: ${String(input)}`);
    },
  });
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function debtorDto(index: number): Record<string, unknown> {
  return { debtor_id: `debtor-${index}`, account_id: `account-${index}`, supply_id: `supply-${index}`, customer_name: "Synthetic", address: "Synthetic", references: "", meter_id: "meter", area: "A", locality: "B", route: "C", debt_cents: 100, months_pending: 1, updated_at: "2026-09-01T00:00:00.000Z", kardex: [], source: "PILOT_PROVISIONAL" };
}

function auditDto(index: number): Record<string, unknown> {
  return { audit_id: `audit-${index}`, actor_id: "admin-1", actor_role: "ADMIN", action: "SYNTHETIC", result: "accepted", occurred_at: "2026-09-01T00:00:00.000Z", source: "PILOT_PROVISIONAL" };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
