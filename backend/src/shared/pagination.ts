/**
 * Paginación por `limit` y `offset`/`cursor` (no ambos), con límites máximos.
 */
import { HttpError } from "../http/responses.js";
import { parseNonNegativeInteger } from "./request-validation.js";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000_000;

export interface PageRequest {
  limit: number;
  offset: number;
}

export function pageRequest(url: URL): PageRequest {
  const limitText = url.searchParams.get("limit");
  const offsetText = url.searchParams.get("offset");
  const cursor = url.searchParams.get("cursor");
  if (offsetText !== null && cursor !== null) {
    throw new HttpError(400, "INVALID_REQUEST", "Use offset o cursor, no ambos.");
  }

  const limit = limitText === null ? DEFAULT_PAGE_SIZE : parseNonNegativeInteger(limitText, "limit");
  let offset = 0;
  if (offsetText !== null) offset = parseNonNegativeInteger(offsetText, "offset");
  else if (cursor !== null) offset = parseNonNegativeInteger(cursor, "cursor");

  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new HttpError(400, "INVALID_REQUEST", `limit must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (offset < 0 || offset > MAX_OFFSET) {
    throw new HttpError(400, "INVALID_REQUEST", "offset debe estar entre 0 y 1000000000.");
  }
  return { limit, offset };
}

export function pageResponse(page: PageRequest, total: number, returned: number): PageRequest & { total: number; next_cursor: string | null } {
  const nextOffset = page.offset + returned;
  return { ...page, total, next_cursor: nextOffset < total ? String(nextOffset) : null };
}
