/**
 * HTTP de la búsqueda de morosos (`GET /v1/debtors`, solo ADMIN): lee y valida los filtros y la paginación de la
 * URL y responde la página. No tiene servicio propio: la búsqueda no aplica reglas de negocio más allá del rol,
 * así que el controlador llama directo a `repositories/debtors.repository.ts`, que arma y ejecuta el SQL.
 */
import type { ServerResponse } from "node:http";
import { HttpError, sendJson } from "../http/responses.js";
import { toDebtor } from "../mappers/debtor.mapper.js";
import { buildDebtorSearchCriteria, countDebtors, searchDebtors, type DebtorSearchFilters } from "../repositories/debtors.repository.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../shared/application-context.js";
import { pageRequest, pageResponse } from "../shared/pagination.js";
import { requireRole } from "../shared/request-validation.js";
import type { SessionUser } from "../types.js";

export interface DebtorHandlers {
  listDebtors(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
}

export function createDebtorHandlers(context: ApplicationContext): DebtorHandlers {
  async function listDebtors(response: ServerResponse, user: SessionUser, url: URL): Promise<void> {
    requireRole(user, "ADMIN");
    const filters = parseDebtorSearchFilters(url);
    const criteria = buildDebtorSearchCriteria(filters);
    const page = pageRequest(url);
    const debtors = await searchDebtors(context.pool, criteria, page);
    const total = await countDebtors(context.pool, criteria);
    sendJson(response, 200, {
      source: PROVISIONAL_SOURCE,
      debtors: debtors.map(toDebtor),
      ...pageResponse(page, total, debtors.length),
    });
  }

  return { listDebtors };
}

export function parseDebtorSearchFilters(url: URL): DebtorSearchFilters {
  const minMonthsText = (url.searchParams.get("min_months_pending") ?? "").trim();
  const minMonthsPending = minMonthsText === "" ? 0 : Number(minMonthsText);
  if (!Number.isSafeInteger(minMonthsPending) || minMonthsPending < 0) {
    throw new HttpError(400, "INVALID_REQUEST", "min_months_pending debe ser un entero no negativo.");
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
