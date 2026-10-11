/**
 * Opciones y coincidencia de filtros de búsqueda de suministros del administrador.
 * Los valores se comparan sin distinguir mayúsculas ni espacios repetidos; `NO_DATA_FILTER_VALUE` selecciona "Sin dato".
 */
import { NO_DATA_FILTER_VALUE, type DebtorRecord } from "../domain/types";

export interface AdminFilterOption { value: string; label: string; }

export interface AdminFilterOptions { areas: AdminFilterOption[]; localities: AdminFilterOption[]; routes: AdminFilterOption[]; statuses: AdminFilterOption[]; }

export function getAdminFilterOptions(records: readonly DebtorRecord[], selectedArea = "", selectedLocality = "", selectedRoute = "", selectedStatus = ""): AdminFilterOptions {
  const areaRecords = records.filter((record) => matchesFilterValue(record.area, selectedArea));
  return {
    areas: filterOptionEntries(records.map((record) => ({ value: record.area, label: record.areaName })), selectedArea),
    localities: filterOptionEntries(areaRecords.map((record) => ({ value: record.locality })), selectedLocality),
    routes: filterOptionEntries(records.map((record) => ({ value: record.route, label: record.routeName })), selectedRoute),
    statuses: filterOptionEntries(records.map((record) => ({ value: record.supplyStatus ?? "" })), selectedStatus),
  };
}

export function filterOptions(values: string[], selected: string): string[] {
  return filterOptionEntries(values.map((value) => ({ value })), selected).map((option) => option.value);
}

function filterOptionEntries(values: readonly { value: string; label?: string }[], selected: string): AdminFilterOption[] {
  const options = new Map<string, AdminFilterOption>();
  for (const entry of selected ? [...values, { value: selected }] : values) {
    if (entry.value === NO_DATA_FILTER_VALUE) {
      options.set(NO_DATA_FILTER_VALUE, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" });
      continue;
    }
    const displayValue = entry.value.trim().replace(/\s+/g, " ");
    const normalizedValue = normalizeFilterValue(displayValue);
    if (normalizedValue && !options.has(normalizedValue)) options.set(normalizedValue, { value: displayValue, label: entry.label?.trim() || displayValue });
    if (!normalizedValue) options.set(NO_DATA_FILTER_VALUE, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" });
  }
  return [...options.values()].sort((left, right) => {
    if (left.value === NO_DATA_FILTER_VALUE) return 1;
    if (right.value === NO_DATA_FILTER_VALUE) return -1;
    return left.label.localeCompare(right.label, "es");
  });
}

export function matchesFilterValue(value: string | undefined, expected: string | undefined): boolean {
  if (!expected) return true;
  if (expected === NO_DATA_FILTER_VALUE) return !normalizeFilterValue(value ?? "");
  return normalizeFilterValue(value ?? "") === normalizeFilterValue(expected);
}

function normalizeFilterValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function getMissingOrderCreationDebtorIds(debtorIds: readonly string[], debtors: readonly DebtorRecord[]): string[] {
  const availableDebtorIds = new Set(debtors.map((debtor) => debtor.debtorId));
  return debtorIds.filter((debtorId) => !availableDebtorIds.has(debtorId));
}
