/**
 * Paginación de listas en pantalla (órdenes y suministros del administrador, cola y ficha del técnico).
 * Las páginas pedidas fuera de rango se ajustan al rango válido.
 */
import type { SyncItem } from "../ports/sync";
import { splitReviewText } from "./format";

export const ADMIN_ORDERS_PAGE_SIZE = 4;

export const ADMIN_SUPPLIES_PAGE_SIZE = 7;

export function getAdminOrderPage<T>(items: readonly T[], requestedPage: number, pageSize = ADMIN_ORDERS_PAGE_SIZE): { items: T[]; page: number; totalPages: number } {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : ADMIN_ORDERS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages);
  const start = (page - 1) * safePageSize;
  return { items: items.slice(start, start + safePageSize), page, totalPages };
}

export function queuePageItem(items: SyncItem[], requestedPage: number) {
  const pageCount = Math.max(1, items.length);
  const page = Number.isFinite(requestedPage) ? Math.min(pageCount, Math.max(1, Math.trunc(requestedPage))) : 1;
  return { page, pageCount, item: items[page - 1] };
}

export function paginateReviewFields(fields: readonly { label: string; value?: string }[], pageSize = 4): Array<Array<{ label: string; value?: string }>> {
  const pages: Array<Array<{ label: string; value?: string }>> = [];
  let currentPage: Array<{ label: string; value?: string }> = [];
  const flush = () => { if (!currentPage.length) return; pages.push(currentPage); currentPage = []; };
  for (const field of fields) {
    if ((field.value?.length ?? 0) > 120) {
      flush();
      const chunks = splitReviewText(field.value ?? "");
      chunks.forEach((value, index) => pages.push([{ label: `${field.label} · parte ${index + 1} de ${chunks.length}`, value }]));
      continue;
    }
    currentPage.push(field);
    if (currentPage.length === pageSize) flush();
  }
  flush();
  return pages;
}
