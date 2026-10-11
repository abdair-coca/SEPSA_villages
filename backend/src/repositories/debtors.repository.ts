/**
 * SQL de la tabla `debtors` (morosos con su kardex y contexto): columnas, búsqueda paginada y bloqueo de
 * filas para crear órdenes. Solo ejecuta consultas y devuelve filas; el mapeo a JSON está en
 * `mappers/debtor.mapper.ts` y las reglas (duplicados, rol) en los servicios.
 */
import type { Queryable } from "../db.js";
import type { DebtorRow } from "../mappers/debtor.mapper.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";

export const NO_DATA_FILTER_VALUE = "__NO_DATA__";

export function kardexColumns(column: string): string {
  return `(SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'entry_id', COALESCE(invoice->'entry_id', invoice->'entryId'), 'period', invoice->'period',
    'amount_cents', COALESCE(invoice->'amount_cents', invoice->'amountCents'),
    'billing_date', COALESCE(invoice->'billing_date', invoice->'billingDate'),
    'invoice_origin', COALESCE(invoice->'invoice_origin', invoice->'invoiceOrigin'),
    'days_late', COALESCE(invoice->'days_late', invoice->'daysLate')
  )) ORDER BY position), '[]'::jsonb) FROM jsonb_array_elements(${column}) WITH ORDINALITY AS entries(invoice, position))`;
}

export function debtorColumns(): string {
  return `debtor_id, account_id, supply_id, customer_name, address, reference_text, meter_id, area, locality,
    route, debt_cents, months_pending, updated_at, ${kardexColumns("kardex")} AS kardex, circuit, customer_ci,
    contact_phone, tariff, supply_status, enabling_title, route_order, cadastral_latitude, cadastral_longitude,
    meter_brand, meter_index, meter_multiplier, claims, suspension_date, reconnection_manual, reconnection_date,
    reconnection_technician, jsonb_build_object('area_name', context->'area_name', 'ruta_name', context->'ruta_name') AS context`;
}

export async function findDebtorForUpdate(client: Queryable, debtorId: string): Promise<DebtorRow | undefined> {
  const debtor = await client.query<DebtorRow>(`SELECT ${debtorColumns()} FROM debtors WHERE debtor_id = $1 AND source = $2 FOR UPDATE`, [debtorId, PROVISIONAL_SOURCE]);
  return debtor.rows[0];
}

export async function findDebtorsForUpdate(client: Queryable, debtorIds: string[]): Promise<DebtorRow[]> {
  const debtors = await client.query<DebtorRow>(`SELECT ${debtorColumns()} FROM debtors WHERE debtor_id = ANY($1::text[]) AND source = $2 FOR UPDATE`, [debtorIds, PROVISIONAL_SOURCE]);
  return debtors.rows;
}
