/**
 * Operaciones por conciliar para la vista de solo lectura del administrador (D024). Se calculan con tablas
 * existentes, sin estado nuevo:
 * - `SYNC_CONFLICT`: el servidor rechazó la sincronización (`sync_operations.status = 'conflict'`).
 * - `CONSUMED_NOT_SYNCED`: la autorización se usó y la operación todavía no llegó desde el dispositivo.
 * - `CLOSED_NOT_CONSUMED`: el técnico cerró una operación cuya autorización no se usó y pidió otra (D022).
 */
import type { Queryable } from "../db.js";

export interface ReconciliationRow {
  kind: "SYNC_CONFLICT" | "CONSUMED_NOT_SYNCED" | "CLOSED_NOT_CONSUMED";
  operation_id: string;
  order_id: string;
  action: string | null;
  technician_id: string;
  technician_name: string | null;
  account_id: string | null;
  customer_name: string | null;
  detail: string | null;
  since: string;
}

export async function listReconciliation(db: Queryable, limit = 200): Promise<ReconciliationRow[]> {
  const result = await db.query<ReconciliationRow>(
    `SELECT item.kind, item.operation_id, item.order_id, item.action, item.technician_id, u.display_name AS technician_name,
            d.account_id, d.customer_name, item.detail, item.since
       FROM (
         SELECT 'SYNC_CONFLICT' AS kind, s.operation_id, s.order_id, s.action, s.technician_id, s.conflict_reason AS detail, s.created_at AS since
           FROM sync_operations s
          WHERE s.status = 'conflict'
         UNION ALL
         SELECT 'CONSUMED_NOT_SYNCED', a.consumed_operation_id, a.order_id, a.action, a.technician_id, NULL, a.consumed_at
           FROM cut_authorizations a
          WHERE a.status = 'CONSUMED'
            AND a.consumed_operation_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM sync_operations s WHERE s.operation_id = a.consumed_operation_id)
         UNION ALL
         SELECT 'CLOSED_NOT_CONSUMED', s.operation_id, s.order_id, s.payload->>'attempted_action', s.technician_id, s.payload->>'reason', s.created_at
           FROM sync_operations s
          WHERE s.action = 'VISIT' AND s.payload->>'reason' = 'AUTHORIZATION_CLOSED_NOT_CONSUMED'
       ) item
       JOIN users u ON u.user_id = item.technician_id
       JOIN orders o ON o.order_id = item.order_id
       LEFT JOIN debtors d ON d.debtor_id = o.debtor_id
      ORDER BY item.since DESC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({ ...row, since: new Date(row.since).toISOString() }));
}
