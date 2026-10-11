import { isRecord } from "../../http.js";
import { PROVISIONAL_SOURCE } from "../application-context.js";
import { projectContext } from "./command-response.js";

export const NO_DATA_FILTER_VALUE = "__NO_DATA__";

export interface DebtorRow {
  debtor_id: string;
  account_id: string;
  supply_id: string;
  customer_name: string;
  address: string;
  reference_text: string;
  meter_id: string;
  area: string;
  locality: string;
  route: string;
  debt_cents: number;
  months_pending: number;
  updated_at: string | null;
  kardex: unknown;
  circuit: string;
  customer_ci: string | null;
  contact_phone: string | null;
  tariff: string;
  supply_status: string;
  enabling_title: string | null;
  route_order: number | null;
  cadastral_latitude: number | null;
  cadastral_longitude: number | null;
  meter_brand: string | null;
  meter_index: string | null;
  meter_multiplier: number | null;
  claims: boolean | null;
  suspension_date: string | null;
  reconnection_manual: boolean | null;
  reconnection_date: string | null;
  reconnection_technician: string | null;
  context: unknown;
}

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

export function toDebtor(row: DebtorRow): Record<string, unknown> {
  return {
    debtor_id: row.debtor_id,
    account_id: row.account_id,
    supply_id: row.supply_id,
    customer_name: row.customer_name,
    address: row.address,
    references: row.reference_text,
    meter_id: row.meter_id,
    area: row.area,
    area_name: contextString(row.context, "area_name"),
    locality: row.locality,
    route: row.route,
    route_name: contextString(row.context, "ruta_name"),
    debt_cents: row.debt_cents,
    months_pending: row.months_pending,
    updated_at: row.updated_at,
    kardex: row.kardex,
    source: PROVISIONAL_SOURCE,
    circuit: row.circuit,
    customer_ci: row.customer_ci,
    contact_phone: row.contact_phone,
    tariff: row.tariff,
    supply_status: row.supply_status,
    enabling_title: row.enabling_title,
    route_order: row.route_order,
    cadastral_latitude: row.cadastral_latitude,
    cadastral_longitude: row.cadastral_longitude,
    meter_brand: row.meter_brand,
    meter_index: row.meter_index,
    meter_multiplier: row.meter_multiplier,
    claims: row.claims,
    suspension_date: row.suspension_date,
    reconnection_manual: row.reconnection_manual,
    reconnection_date: row.reconnection_date,
    reconnection_technician: row.reconnection_technician,
  };
}

function contextString(context: unknown, key: string): string | undefined {
  const value = isRecord(context) ? context[key] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
