import { PROVISIONAL_SOURCE } from "../application-context.js";
import { projectContext } from "./command-response.js";
import { kardexColumns } from "./debtor.js";

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

export function orderColumns(alias: string): string {
  return `${alias}.order_id, ${alias}.cuc, ${alias}.debtor_id, d.account_id, d.supply_id, ${alias}.purpose, ${alias}.status, ${alias}.physical_status, ${alias}.version, ${alias}.created_by, ${alias}.assigned_technician_id, assigned_technician.display_name AS assigned_technician_name, ${alias}.created_at,
    jsonb_build_object('debtor_id', d.debtor_id, 'account_id', d.account_id, 'supply_id', d.supply_id, 'customer_name', d.customer_name, 'address', d.address, 'references', d.reference_text, 'meter_id', d.meter_id, 'area', d.area, 'area_name', NULLIF(BTRIM(d.context->>'area_name'), ''), 'locality', d.locality, 'route', d.route, 'route_name', NULLIF(BTRIM(d.context->>'ruta_name'), ''), 'debt_cents', d.debt_cents, 'months_pending', d.months_pending, 'updated_at', d.updated_at, 'kardex', ${kardexColumns("d.kardex")}, 'source', d.source, 'circuit', d.circuit, 'customer_ci', d.customer_ci, 'contact_phone', d.contact_phone, 'tariff', d.tariff, 'supply_status', d.supply_status, 'enabling_title', d.enabling_title, 'route_order', d.route_order, 'cadastral_latitude', d.cadastral_latitude, 'cadastral_longitude', d.cadastral_longitude, 'meter_brand', d.meter_brand, 'meter_index', d.meter_index, 'meter_multiplier', d.meter_multiplier, 'claims', d.claims, 'suspension_date', d.suspension_date, 'reconnection_manual', d.reconnection_manual, 'reconnection_date', d.reconnection_date, 'reconnection_technician', d.reconnection_technician) AS context`;
}

export function orderSelect(where: string, order: string): string {
  return `SELECT ${orderColumns("o")} FROM orders o JOIN debtors d ON d.debtor_id = o.debtor_id LEFT JOIN users assigned_technician ON assigned_technician.user_id = o.assigned_technician_id AND EXISTS (SELECT 1 FROM user_role_grants g WHERE g.user_id = assigned_technician.user_id AND g.role = 'TECHNICIAN') WHERE ${where} ORDER BY ${order}`;
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
