/**
 * Campo de dato con icono usado en las fichas del administrador (suministro y orden). Solo presenta; no formatea
 * ni decide valores: un dato ausente se muestra con el texto de "no disponible".
 */
export type SupplyDataIconKind = "client" | "address" | "account" | "circuit" | "supply" | "area" | "meter" | "status" | "route" | "tariff" | "coordinates" | "phone" | "debt";

export function AdminDataIcon({ kind }: { kind: SupplyDataIconKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="admin-data-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {kind === "client" || kind === "status" ? <><circle cx="12" cy="8" r="3" /><path d="M5 20c.8-3.2 3.1-5 7-5s6.2 1.8 7 5" /></> : null}
    {kind === "address" || kind === "coordinates" ? <><path d="M19 10c0 4.8-7 10-7 10S5 14.8 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></> : null}
    {kind === "account" ? <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16M8 14h4" /></> : null}
    {kind === "circuit" ? <><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="m8 12 8-6M8 12l8 6" /></> : null}
    {kind === "supply" ? <><path d="M9 4v6M15 4v6M7 10h10v3a5 5 0 0 1-10 0v-3ZM12 18v2" /></> : null}
    {kind === "area" ? <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></> : null}
    {kind === "meter" ? <><path d="M5 16a7 7 0 1 1 14 0" /><path d="m12 12 3-3M7 19h10" /></> : null}
    {kind === "debt" ? <><circle cx="12" cy="12" r="8" /><text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="700">$</text></> : null}
    {kind === "route" ? <><circle cx="6" cy="18" r="2" /><path d="M8 18h7a4 4 0 0 0 0-8H7" /><path d="m9 7-3 3 3 3" /></> : null}
    {kind === "tariff" ? <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></> : null}
    {kind === "phone" ? <path d="M7 4h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5v3c0 1-1 2-2 2C11.4 19.6 4.4 12.6 4 6c0-1 1-2 3-2Z" /> : null}
  </svg>;
}

export function AdminDataField({ label, value, technical = false, emphasis = false, icon, emptyValue = "Dato no disponible" }: { label: string; value?: string | number; technical?: boolean; emphasis?: boolean; icon?: SupplyDataIconKind; emptyValue?: string }) {
  const className = ["data-point", technical ? "data-point--technical" : "", emphasis ? "data-point--emphasis" : "", icon ? "data-point--with-icon" : ""].filter(Boolean).join(" ");
  return <div className={className}>{icon ? <AdminDataIcon kind={icon} /> : null}<div className="data-point__content"><span>{label}</span><strong>{value === undefined || value === "" ? emptyValue : value}</strong></div></div>;
}
