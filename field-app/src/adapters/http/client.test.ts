import { describe, expect, it } from "vitest";
import { HttpPilotClient } from "./client";

describe("PILOT_PROVISIONAL HTTP client", () => {
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
    await expect(client.findDebtorsPage({ session }, "100")).resolves.toMatchObject({ nextCursor: undefined, total: 101, debtors: [{ debtorId: "debtor-1" }] });
    expect(urls.filter((url) => url.includes("/v1/debtors")).every((url) => new URL(url).searchParams.get("limit") === "100")).toBe(true);
    expect(urls).toContain("http://localhost:8080/v1/audit?limit=100&cursor=100");
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

  it("keeps cut authorization deferred and sends its binding to sync", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", expires_at: "2099-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Tech", role: "TECHNICIAN" } });
        if (String(input).endsWith("/authorizations/cut")) return json({ authorization_id: "auth-1", token: "opaque-1", order_id: "order-1", technician_id: "tech-1", device_id: "device-1", operation_id: "cut-1", version: 2, issued_at: "2026-09-12T09:00:00.000Z", expires_at: "2026-09-12T09:05:00.000Z" });
        return json({ status: "acknowledged", operation_id: "cut-1" });
      },
    });

    const session = await client.authenticate({ username: "tech", password: "password" });
    const authorization = await client.requestCut({ orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", operationId: "cut-1", orderVersion: 2 });
    const result = await client.send({ operationId: "cut-1", action: "CUT", orderId: "order-1", technicianId: "tech-1", deviceId: "device-1", recordedAt: "2026-09-12T09:01:00.000Z", evidenceRefs: ["evidence-1"], orderVersion: 2, authorizationId: authorization.grant?.authorizationId, authorizationToken: authorization.grant?.token, fieldCapture: { reading: { value: 1, unit: "kWh", meterId: "meter-1", recordedAt: "2026-09-12T09:01:00.000Z", status: "CAPTURED" }, location: { latitude: 1, longitude: 1, accuracyMeters: 5, recordedAt: "2026-09-12T09:01:00.000Z", status: "CAPTURED" }, cutType: "RED", nearbyMeters: false } }, session);

    expect(session.authenticity).toBe("PILOT_PROVISIONAL");
    expect(authorization.grant?.consumption).toBe("deferred");
    expect(result).toEqual({ status: "acknowledged", operationId: "cut-1" });
    expect(JSON.parse(String(requests[2]?.init.body))).toMatchObject({ authorization_id: "auth-1", authorization_token: "opaque-1", order_version: 2, operation_id: "cut-1" });
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

    await expect(client.downloadAssigned("tech-1", "device-1", session)).rejects.toThrow("integrity validation failed");
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function debtorDto(index: number): Record<string, unknown> {
  return { debtor_id: `debtor-${index}`, account_id: `account-${index}`, supply_id: `supply-${index}`, customer_name: "Synthetic", address: "Synthetic", references: "", meter_id: "meter", area: "A", locality: "B", route: "C", debt_cents: 100, months_pending: 1, updated_at: "2026-09-01T00:00:00.000Z", kardex: [], source: "PILOT_PROVISIONAL" };
}

function auditDto(index: number): Record<string, unknown> {
  return { audit_id: `audit-${index}`, actor_id: "admin-1", actor_role: "ADMIN", action: "SYNTHETIC", result: "accepted", occurred_at: "2026-09-01T00:00:00.000Z", source: "PILOT_PROVISIONAL" };
}
