/**
 * Búsqueda paginada de suministros morosos (solo ADMIN) con filtros de texto, área, localidad, ruta,
 * meses pendientes y estado del suministro.
 */
import type { ServerResponse } from "node:http";
import { HttpError, sendJson } from "../http/responses.js";
import type { SessionUser } from "../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { debtorColumns, kardexColumns, NO_DATA_FILTER_VALUE, toDebtor, type DebtorRow } from "../mappers/debtor.mapper.js";
import { pageRequest, pageResponse } from "../shared/pagination.js";
import { requireRole } from "../shared/request-validation.js";

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

export interface DebtorHandlers {
  listDebtors(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
}

export function createDebtorHandlers(context: ApplicationContext): DebtorHandlers {
  async function listDebtors(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    requireRole(user, "ADMIN");
    const filters = parseDebtorSearchFilters(url);
    const criteria = buildDebtorSearchCriteria(filters);
    const page = pageRequest(url);
    const result = await context.pool.query<DebtorRow>(
      `SELECT ${debtorColumns()}
       FROM debtors WHERE ${criteria.where}
       ORDER BY updated_at DESC NULLS LAST, debtor_id ASC LIMIT $8 OFFSET $9`,
      [...criteria.values, page.limit, page.offset],
    );
    const count = await context.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM debtors WHERE ${criteria.where}`,
      criteria.values,
    );
    sendJson(response, 200, {
      source: PROVISIONAL_SOURCE,
      debtors: result.rows.map(toDebtor),
      ...pageResponse(page, Number(count.rows[0]?.total ?? 0), result.rows.length),
    });
  }

  return { listDebtors };
}

export function parseDebtorSearchFilters(url: URL): DebtorSearchFilters {
  const minMonthsText = (url.searchParams.get("min_months_pending") ?? "").trim();
  const minMonthsPending = minMonthsText === "" ? 0 : Number(minMonthsText);
  if (!Number.isSafeInteger(minMonthsPending) || minMonthsPending < 0) {
    throw new HttpError(400, "INVALID_REQUEST", "min_months_pending must be a non-negative integer.");
  }
  return {
    search: (url.searchParams.get("query") ?? "").trim(),
    area: (url.searchParams.get("area") ?? "").trim(),
    locality: (url.searchParams.get("locality") ?? "").trim(),
    route: (url.searchParams.get("route") ?? "").trim(),
    minMonthsPending,
    supplyStatus: (url.searchParams.get("supply_status") ?? "").trim(),
  };
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
