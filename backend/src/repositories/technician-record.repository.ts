/**
 * SQL del registro sincronizado del técnico (`sync_operations`, solo lectura). Devuelve las filas tal como se
 * guardaron; qué campos salen al técnico y en qué forma está en `mappers/technician-record.mapper.ts`.
 * Las reglas de alcance (solo las operaciones del propio técnico) se aplican aquí en la consulta.
 */
import type { Queryable } from "../db.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";
import type { PageRequest } from "../shared/pagination.js";

export interface TechnicianRecordRow {
  operation_id: string;
  order_id: string;
  action: string;
  status: string;
  device_id: string;
  payload: Record<string, unknown>;
  conflict_reason: string | null;
  acknowledged_at: Date | string | null;
  created_at: Date | string;
}

/** Operaciones sincronizadas del técnico, más recientes primero; `orderId` null devuelve todas sus órdenes. */
export async function listTechnicianRecord(db: Queryable, technicianId: string, orderId: string | null, page: PageRequest): Promise<TechnicianRecordRow[]> {
  const result = await db.query<TechnicianRecordRow>(
    `SELECT operation_id, order_id, action, status, device_id, payload, conflict_reason, acknowledged_at, created_at
       FROM sync_operations
      WHERE technician_id = $1 AND source = $2 AND ($3::uuid IS NULL OR order_id = $3::uuid)
      ORDER BY created_at DESC, operation_id DESC
      LIMIT $4 OFFSET $5`,
    [technicianId, PROVISIONAL_SOURCE, orderId, page.limit, page.offset],
  );
  return result.rows;
}

export async function countTechnicianRecord(db: Queryable, technicianId: string, orderId: string | null): Promise<number> {
  const result = await db.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM sync_operations WHERE technician_id = $1 AND source = $2 AND ($3::uuid IS NULL OR order_id = $3::uuid)",
    [technicianId, PROVISIONAL_SOURCE, orderId],
  );
  return Number(result.rows[0]?.total ?? 0);
}
