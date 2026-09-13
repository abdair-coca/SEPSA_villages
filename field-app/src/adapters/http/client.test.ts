import { describe, expect, it } from "vitest";
import { HttpPilotClient } from "./client";

describe("PILOT_PROVISIONAL HTTP client", () => {
  it("keeps cut authorization deferred and sends its binding to sync", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/auth/login")) return json({ session_id: "session-1", session_token: "session-token-12345678901234567890", expires_at: "2026-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Tech", role: "TECHNICIAN" } });
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

  it("rejects a tampered assigned package before local persistence", async () => {
    const packageValue = { package_id: "package-1", technician_id: "tech-1", device_id: "device-1", version: 1, downloaded_at: "2026-09-12T09:00:00.000Z", orders: [] };
    const client = new HttpPilotClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input) => String(input).endsWith("/auth/login")
        ? json({ session_id: "session-1", session_token: "session-token-12345678901234567890", expires_at: "2026-09-12T17:00:00.000Z", user: { user_id: "tech-1", username: "tech", display_name: "Tech", role: "TECHNICIAN" } })
        : json({ package: packageValue, checksum: "tampered" }),
    });
    const session = await client.authenticate({ username: "tech", password: "password" });

    await expect(client.downloadAssigned("tech-1", "device-1", session)).rejects.toThrow("integrity validation failed");
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
