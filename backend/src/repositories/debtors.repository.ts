/**
 * SQL de la tabla `debtors` (morosos con su kardex y contexto): columnas, búsqueda paginada y bloqueo de
 * filas para crear órdenes. Solo ejecuta consultas y devuelve filas; el mapeo a JSON está en
 * `mappers/debtor.mapper.ts` y las reglas (duplicados, rol) en los servicios.
 */
import type { Queryable } from "../db.js";
import type { DebtorRow } from "../mappers/debtor.mapper.js";
import type { PageRequest } from "../shared/pagination.js";
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

export interface DebtorSearchFilters {
  search: string;
  area: string;
  locality: string;
  route: string;
  minMonthsPending: number;
  supplyStatus: string;
}

export interface DebtorSearchCriteria {
  where: string;
  values: [string, string, string, string, string, number, string];
}

export function buildDebtorSearchCriteria(filters: DebtorSearchFilters): DebtorSearchCriteria {
  return {
    where: `source = $1 AND ($2 = '' OR concat_ws(' ', debtor_id, account_id, supply_id, customer_name, address, reference_text,
           meter_id, area, locality, route, debt_cents::text, months_pending::text, updated_at::text, ${kardexColumns("kardex")}::text, circuit,
           customer_ci, contact_phone, tariff, supply_status, enabling_title, route_order::text, cadastral_latitude::text,
           cadastral_longitude::text, meter_brand, meter_index, meter_multiplier::text, claims::text,
           suspension_date::text, reconnection_manual::text, reconnection_date::text, reconnection_technician) ILIKE '%' || $2 || '%')
        AND ($3 = '' OR ($3 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(area), '') IS NULL) OR regexp_replace(LOWER(BTRIM(area)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($3)), '\\s+', ' ', 'g'))
        AND ($4 = '' OR ($4 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(locality), '') IS NULL) OR regexp_replace(LOWER(BTRIM(locality)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($4)), '\\s+', ' ', 'g'))
        AND ($5 = '' OR ($5 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(route), '') IS NULL) OR regexp_replace(LOWER(BTRIM(route)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($5)), '\\s+', ' ', 'g'))
        AND ($6 = 0 OR months_pending >= $6)
        AND ($7 = '' OR ($7 = '${NO_DATA_FILTER_VALUE}' AND NULLIF(BTRIM(supply_status), '') IS NULL) OR regexp_replace(LOWER(BTRIM(supply_status)), '\\s+', ' ', 'g') = regexp_replace(LOWER(BTRIM($7)), '\\s+', ' ', 'g'))`,
    values: [PROVISIONAL_SOURCE, filters.search, filters.area, filters.locality, filters.route, filters.minMonthsPending, filters.supplyStatus],
  };
}

export async function searchDebtors(db: Queryable, criteria: DebtorSearchCriteria, page: PageRequest): Promise<DebtorRow[]> {
  const result = await db.query<DebtorRow>(
    `SELECT ${debtorColumns()}
       FROM debtors WHERE ${criteria.where}
       ORDER BY updated_at DESC NULLS LAST, debtor_id ASC LIMIT $8 OFFSET $9`,
    [...criteria.values, page.limit, page.offset],
  );
  return result.rows;
}

export async function countDebtors(db: Queryable, criteria: DebtorSearchCriteria): Promise<number> {
  const count = await db.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM debtors WHERE ${criteria.where}`,
    criteria.values,
  );
  return Number(count.rows[0]?.total ?? 0);
}
