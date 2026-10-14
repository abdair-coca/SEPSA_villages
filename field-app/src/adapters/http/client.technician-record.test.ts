import { describe, expect, it } from "vitest";
import { HttpPilotClient } from "./client";
import type { Session } from "../../domain/types";

const technicianLogin = { session_id: "session-tech", expires_at: "2099-01-01T00:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Técnico", role: "TECHNICIAN" } };

const entryDto = {
  operation_id: "cut-1", order_id: "order-1", action: "CUT", status: "acknowledged", device_id: "device-a",
  recorded_at: "2026-10-01T10:00:02.000Z", created_at: "2026-10-01T10:00:02.500Z", acknowledged_at: "2026-10-01T10:00:03.000Z",
  conflict_reason: null, order_version: 3, effective_at: null, demora: null, technician_name_snapshot: null, reason: null,
  exception_reason: null, evidence_refs: ["evidence-1"],
  field_capture: { reading: { status: "CAPTURED", value: 10, meterId: "MTR-1", unit: "kWh", recordedAt: "2026-10-01T10:00:00.000Z" }, location: { status: "CAPTURED", latitude: 1, longitude: 2, accuracyMeters: 3, recordedAt: "2026-10-01T10:00:01.000Z" }, cutType: "RED", nearbyMeters: true },
};

/** Cliente con sesión iniciada: la primera llamada es el login; las siguientes, las que responde `route`. */
async function loggedInClient(route: (url: URL, init: RequestInit, index: number) => Response | Promise<Response>) {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const client = new HttpPilotClient({
    baseUrl: "http://localhost:8080",
    fetchImpl: async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/auth/login") return json(technicianLogin);
      requests.push({ url, init });
      return route(url, init, requests.length - 1);
    },
  });
  const session = await client.authenticate({ username: "tech", password: "test-password" });
  return { client, session, requests };
}

describe("HTTP client: registro sincronizado del técnico (solo lectura)", () => {
  it("pide las operaciones de la orden con cookie de sesión, sin cabecera de autorización, y mapea el DTO", async () => {
    const { client, session, requests } = await loggedInClient(() => json({ source: "PILOT_PROVISIONAL", operations: [entryDto], limit: 100, offset: 0, total: 1, next_cursor: null }));

    const entries = await client.listOrderRecord(session, "order-1");

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe("/v1/technician/record");
    expect(requests[0]?.url.searchParams.get("order_id")).toBe("order-1");
    expect(requests[0]?.url.searchParams.get("limit")).toBe("100");
    expect(requests[0]?.init.credentials).toBe("include");
    expect((requests[0]?.init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(entries).toEqual([{
      operationId: "cut-1", orderId: "order-1", action: "CUT", status: "acknowledged", deviceId: "device-a",
      recordedAt: "2026-10-01T10:00:02.000Z", createdAt: "2026-10-01T10:00:02.500Z", acknowledgedAt: "2026-10-01T10:00:03.000Z",
      conflictReason: undefined, orderVersion: 3, effectiveAt: undefined, demora: undefined, technicianNameSnapshot: undefined,
      reason: undefined, exceptionReason: undefined, evidenceRefs: ["evidence-1"],
      fieldCapture: entryDto.field_capture,
    }]);
  });

  it("sigue el cursor hasta la última página y conserva el orden del servidor", async () => {
    const pages = [
      { source: "PILOT_PROVISIONAL", operations: [{ ...entryDto, operation_id: "newest" }], total: 2, next_cursor: "1" },
      { source: "PILOT_PROVISIONAL", operations: [{ ...entryDto, operation_id: "oldest" }], total: 2, next_cursor: null },
    ];
    const { client, session, requests } = await loggedInClient((_url, _init, index) => json(pages[index]!));

    const entries = await client.listOrderRecord(session, "order-1");

    expect(entries.map((entry) => entry.operationId)).toEqual(["newest", "oldest"]);
    expect(requests.map((request) => request.url.searchParams.get("cursor"))).toEqual([null, "1"]);
  });

  it("sin cookie de sesión el servidor rechaza la consulta y el cliente no muestra registro", async () => {
    const requests: string[] = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input) => {
        requests.push(String(input));
        return json({ code: "UNAUTHENTICATED", message: "Sesión requerida." }, 401);
      },
    });
    const notLoggedIn = { sessionId: "other", userId: "tech-1", role: "TECHNICIAN", expiresAt: "2099-01-01T00:00:00.000Z" } as unknown as Session;

    await expect(client.listOrderRecord(notLoggedIn, "order-1")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/v1/technician/record?");
  });

  it("traduce un rechazo del servidor a su código, sin inventar un registro", async () => {
    const { client, session } = await loggedInClient(() => json({ code: "FORBIDDEN", message: "El rol no está permitido." }, 403));

    await expect(client.listOrderRecord(session, "order-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un fallo de red es resultado desconocido, nunca un registro vacío", async () => {
    const { client, session } = await loggedInClient(() => { throw new TypeError("fetch failed"); });

    await expect(client.listOrderRecord(session, "order-1")).rejects.toMatchObject({ name: "NetworkUnknownError" });
  });
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
