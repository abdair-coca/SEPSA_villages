import { describe, expect, it } from "vitest";
import { NO_DATA_FILTER_VALUE, type DebtorRecord } from "../domain/types";
import { filterOptions, getAdminFilterOptions } from "./filters";

describe("admin filter options", () => {
  const records = [
    { area: "B", areaName: "BETANZOS", locality: "078 - COA COA", route: "078", routeName: "COA COA", supplyStatus: "A" },
    { area: "B", locality: "079 - MAYU TAMBO", route: "079", supplyStatus: "A" },
    { area: " A ", locality: "001 - VILLA ESPERANZA", route: "001", supplyStatus: "I" },
    { area: "", locality: "", route: "", supplyStatus: undefined },
  ] as DebtorRecord[];

  it("builds options from all records, normalizes duplicates, and exposes missing data", () => {
    expect(getAdminFilterOptions(records, "")).toEqual({
      areas: [{ value: "A", label: "A" }, { value: "B", label: "BETANZOS" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
      localities: [{ value: "001 - VILLA ESPERANZA", label: "001 - VILLA ESPERANZA" }, { value: "078 - COA COA", label: "078 - COA COA" }, { value: "079 - MAYU TAMBO", label: "079 - MAYU TAMBO" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
      routes: [{ value: "001", label: "001" }, { value: "079", label: "079" }, { value: "078", label: "COA COA" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
      statuses: [{ value: "A", label: "A" }, { value: "I", label: "I" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }],
    });
  });

  it("limits localities by selected area while keeping routes global", () => {
    const options = getAdminFilterOptions(records, "B");

    expect(options.localities).toEqual([{ value: "078 - COA COA", label: "078 - COA COA" }, { value: "079 - MAYU TAMBO", label: "079 - MAYU TAMBO" }]);
    expect(options.routes).toEqual([{ value: "001", label: "001" }, { value: "079", label: "079" }, { value: "078", label: "COA COA" }, { value: NO_DATA_FILTER_VALUE, label: "Sin dato" }]);
  });

  it("groups case and whitespace variants without changing first display value", () => {
    expect(filterOptions(["Betanzos", " BETANZOS ", "Betanzos"], "")).toEqual(["Betanzos"]);
  });
});
