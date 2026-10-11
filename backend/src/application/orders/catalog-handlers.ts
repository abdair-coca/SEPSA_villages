import type { ServerResponse } from "node:http";
import type { SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { type TechnicianRow } from "../projections/session.js";
import { requireRole } from "../shared/request-validation.js";
import { sendJson } from "../../http.js";

export interface CatalogHandlers {
  listTechnicians(response: ServerResponse, user: SessionUser): Promise<void>;
}

export function createCatalogHandlers(context: ApplicationContext): CatalogHandlers {
  async function listTechnicians(response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const result = await context.pool.query<TechnicianRow>(
      "SELECT user_id, username, display_name, 'TECHNICIAN' AS role, enabled FROM users WHERE source = $1 AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = users.user_id AND g.role = 'TECHNICIAN') AND enabled = true ORDER BY display_name ASC, username ASC",
      [PROVISIONAL_SOURCE],
    );
    sendJson(response, 200, {
      source: PROVISIONAL_SOURCE,
      technicians: result.rows.map((technician) => ({
        user_id: technician.user_id,
        username: technician.username,
        display_name: technician.display_name,
        role: technician.role,
        enabled: technician.enabled,
        source: PROVISIONAL_SOURCE,
      })),
    });
  }

  return { listTechnicians };
}
