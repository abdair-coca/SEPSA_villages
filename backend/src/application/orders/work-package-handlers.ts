import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { withTransaction } from "../../db.js";
import { HttpError, requiredString, sendJson } from "../../http.js";
import type { SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { insertAudit } from "../audit/record.js";
import { digestJson } from "../shared/json-digest.js";
import { orderSelect, toOrder, type OrderRow } from "../projections/order.js";
import { parseNonNegativeInteger, requireRole } from "../shared/request-validation.js";

export interface WorkPackageHandlers {
  technicianOrders(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
}

export function createWorkPackageHandlers(context: ApplicationContext): WorkPackageHandlers {
  async function technicianOrders(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    requireRole(user, "TECHNICIAN");
    const deviceId = requiredString(url.searchParams.get("device_id"), "device_id");
    const knownVersionText = url.searchParams.get("known_version");
    const knownVersion = knownVersionText === null ? 0 : parseNonNegativeInteger(knownVersionText, "known_version");
    const packageValue = await withTransaction(context.pool, async (client) => {
      await client.query("INSERT INTO work_package_versions(technician_id, device_id, last_version) VALUES ($1, $2, 0) ON CONFLICT (technician_id, device_id) DO NOTHING", [user.userId, deviceId]);
      const currentVersion = await client.query<{ last_version: string }>("SELECT last_version::text FROM work_package_versions WHERE technician_id = $1 AND device_id = $2 FOR UPDATE", [user.userId, deviceId]);
      const lastVersion = Number(currentVersion.rows[0]?.last_version ?? 0);
      const nextVersion = Math.max(Date.now(), lastVersion + 1, knownVersion + 1);
      if (!Number.isSafeInteger(nextVersion)) throw new HttpError(400, "INVALID_REQUEST", "known_version exceeds safe integer range.");
      const result = await client.query<OrderRow>(orderSelect("o.assigned_technician_id = $1 AND o.source = $2", "o.updated_at DESC NULLS LAST, o.order_id ASC"), [user.userId, PROVISIONAL_SOURCE]);
      const orders = result.rows.map(toOrder);
      const generatedAt = new Date().toISOString();
      await client.query("UPDATE work_package_versions SET last_version = $3, updated_at = now() WHERE technician_id = $1 AND device_id = $2", [user.userId, deviceId, nextVersion]);
      return { package_id: randomUUID(), technician_id: user.userId, device_id: deviceId, version: nextVersion, downloaded_at: generatedAt, orders, source: PROVISIONAL_SOURCE };
    });
    const checksum = digestJson(packageValue);
    await withTransaction(context.pool, async (client) => {
      await insertAudit(client, { actorId: user.userId, actorRole: user.role, action: "DOWNLOAD_ASSIGNED", result: "accepted", deviceId, metadata: { package_id: packageValue.package_id, technician_id: packageValue.technician_id, device_id: packageValue.device_id, version: packageValue.version, downloaded_at: packageValue.downloaded_at, order_ids: packageValue.orders.map((order) => order.order_id) } });
    });
    sendJson(response, 200, { package: packageValue, authenticity: PROVISIONAL_SOURCE, integrity: PROVISIONAL_SOURCE, validation: "PILOT_PROVISIONAL_VALID", checksum });
  }

  return { technicianOrders };
}
