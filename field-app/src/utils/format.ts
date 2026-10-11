/**
 * Formato de valores para mostrar: fechas, montos, identificadores, coordenadas y textos largos.
 * Un dato ausente se muestra como ausente; nunca se reemplaza por cero ni por otro valor.
 */
import type { ActivityEntry } from "../state/store";
import { activityDetail, activityException, activityLabel } from "./labels";

export function displayValue(value?: string | number): string | number {
  return value === undefined || value === "" ? "Dato no disponible" : value;
}

export function formatDebt(cents?: number): string | undefined {
  return cents === undefined ? undefined : `Bs ${(cents / 100).toFixed(2)}`;
}

export function formatDate(value?: string): string {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin datos"
    : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatActivityTime(value?: string): string {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin datos"
    : new Intl.DateTimeFormat("es-BO", { timeStyle: "short" }).format(date);
}

export function formatLastUpdate(value?: string, nowMs = Date.now()): { relative: string; exact: string } {
  if (!value) return { relative: "Sin datos", exact: "" };
  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return { relative: "Sin datos", exact: "" };

  const exact = new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);

  const diffSec = Math.floor(Math.max(0, nowMs - time) / 1000);
  if (diffSec < 45) return { relative: "hace instantes", exact };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { relative: `Hace ${diffMin} min`, exact };
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return { relative: `Hace ${diffHours} h`, exact };
  const dateStr = new Intl.DateTimeFormat("es-BO", { dateStyle: "short" }).format(date);
  return { relative: dateStr, exact };
}

export function shortHash(hash?: string): string {
  return hash ? `${hash.slice(0, 10)}…` : "disponible";
}

export function shortTechnicalId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-4)}`;
}

export function splitReviewText(value: string, maxLength = 120): string[] {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt <= 0) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining || chunks.length === 0) chunks.push(remaining);
  return chunks;
}

export function orderActivityReviewPages(entries: readonly ActivityEntry[]): Array<{ title: string; text: string }> {
  return entries.flatMap((entry) => {
    const pages: Array<{ title: string; text: string }> = [];
    const appendText = (title: string, text: string) => {
      const chunks = splitReviewText(text);
      chunks.forEach((chunk, index) => pages.push({
        title: chunks.length > 1 ? `${title} · parte ${index + 1} de ${chunks.length}` : title,
        text: chunk,
      }));
    };
    const kind = activityLabel(entry.record.kind);
    appendText(kind, `${formatDate(entry.record.recordedAt)} · ${activityDetail(entry.record)}`);
    const exception = activityException(entry.record);
    if (exception) appendText("Excepción", exception);
    entry.evidence.forEach((evidence, index) => {
      appendText(`Evidencia ${index + 1}`, `${evidence.mimeType} · ${evidence.width} × ${evidence.height} · Guardada localmente · SHA-256 ${evidence.contentHash}`);
    });
    return pages;
  });
}

export function formatAdminCoordinates(latitude?: number, longitude?: number): string | undefined { return latitude !== undefined && longitude !== undefined ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : undefined; }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character] ?? character));
}

export function orderPopupHtml(account: string, customer: string, meter: string, debt: string, status: string): string {
  return `
          <strong>Cuenta ${escapeHtml(account)}</strong>
          <span>${escapeHtml(customer)}</span>
          <span>Medidor ${escapeHtml(meter)}</span>
          <span>Deuda: ${escapeHtml(debt)} · <strong>${escapeHtml(status)}</strong></span>
        `;
}
