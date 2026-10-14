/**
 * Registro sincronizado del técnico (solo lectura). No conoce HTTP ni escribe SQL (`repositories/`).
 * - `listRecord`: devuelve las operaciones del propio técnico y audita la consulta en la misma transacción. El
 *   evento guarda solo el alcance pedido y el número de filas, nunca el contenido del registro.
 */
import { withTransaction } from "../db.js";
import { insertAudit } from "../repositories/audit.repository.js";
import { countTechnicianRecord, listTechnicianRecord } from "../repositories/technician-record.repository.js";
import { toTechnicianRecordEntry } from "../mappers/technician-record.mapper.js";
import type { ServiceContext } from "../shared/application-context.js";
import type { PageRequest } from "../shared/pagination.js";
import type { SessionUser } from "../types.js";

export interface TechnicianRecordQuery {
  orderId: string | null;
  page: PageRequest;
}

export interface TechnicianRecordResult {
  operations: Record<string, unknown>[];
  total: number;
}

export interface TechnicianRecordService {
  listRecord(user: SessionUser, query: TechnicianRecordQuery): Promise<TechnicianRecordResult>;
}

export function createTechnicianRecordService(context: ServiceContext): TechnicianRecordService {
  async function listRecord(user: SessionUser, query: TechnicianRecordQuery): Promise<TechnicianRecordResult> {
    return withTransaction(context.pool, async (client) => {
      const rows = await listTechnicianRecord(client, user.userId, query.orderId, query.page);
      const total = await countTechnicianRecord(client, user.userId, query.orderId);
      await insertAudit(client, {
        actorId: user.userId,
        actorRole: user.role,
        action: "TECHNICIAN_RECORD_READ",
        result: "accepted",
        metadata: { order_id: query.orderId, limit: query.page.limit, offset: query.page.offset, returned: rows.length, total },
      });
      return { operations: rows.map(toTechnicianRecordEntry), total };
    });
  }

  return { listRecord };
}
