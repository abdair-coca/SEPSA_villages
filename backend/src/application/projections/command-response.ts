import { isRecord } from "../../http.js";

export function projectContext(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const fields = ["debtor_id", "account_id", "supply_id", "customer_name", "address", "references", "meter_id",
    "area", "area_name", "locality", "route", "route_name", "debt_cents", "months_pending", "updated_at", "source",
    "circuit", "customer_ci", "contact_phone", "tariff", "supply_status", "enabling_title", "route_order",
    "cadastral_latitude", "cadastral_longitude", "meter_brand", "meter_index", "meter_multiplier", "claims",
    "suspension_date", "reconnection_manual", "reconnection_date", "reconnection_technician"];
  const context: Record<string, unknown> = Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, value[key]]));
  if (Array.isArray(value.kardex)) {
    const invoiceFields = ["entry_id", "entryId", "period", "amount_cents", "amountCents", "billing_date", "billingDate", "invoice_origin", "invoiceOrigin", "days_late", "daysLate"];
    context.kardex = value.kardex.map((invoice) => isRecord(invoice)
      ? Object.fromEntries(invoiceFields.filter((key) => key in invoice).map((key) => [key, invoice[key]]))
      : invoice);
  }
  return context;
}

export function projectCommandResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (Array.isArray(value.created)) return { ...value, created: value.created.map(projectCommandResponse) };
  return "context" in value ? { ...value, context: projectContext(value.context) } : value;
}
