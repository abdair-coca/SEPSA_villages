/**
 * Fila de orden (con el contexto del moroso) y su conversión al JSON de la API. El SQL que la produce está en
 * `repositories/orders.repository.ts`.
 */
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";
import { projectContext } from "./command-response.mapper.js";

export interface OrderRow {
  order_id: string;
  debtor_id: string;
  account_id: string;
  supply_id: string;
  purpose: "CUT";
  status: string;
  physical_status: string;
  version: number;
  created_by: string;
  assigned_technician_id: string | null;
  created_at: string;
  context: unknown;
  cuc: string | null;
  assigned_technician_name: string | null;
}

export function toOrder(row: OrderRow): Record<string, unknown> {
  return {
    order_id: row.order_id,
    cuc: row.cuc,
    debtor_id: row.debtor_id,
    account_id: row.account_id,
    supply_id: row.supply_id,
    purpose: row.purpose,
    status: row.status,
    physical_status: row.physical_status,
    version: row.version,
    created_by: row.created_by,
    assigned_technician_id: row.assigned_technician_id,
    assigned_technician_name: row.assigned_technician_name,
    created_at: row.created_at,
    context: projectContext(row.context),
    source: PROVISIONAL_SOURCE,
  };
}
