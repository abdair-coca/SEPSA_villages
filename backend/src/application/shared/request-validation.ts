/**
 * Validaciones comunes de la petición: rol requerido, UUID y enteros no negativos.
 */
import { HttpError } from "../../http.js";
import type { Role, SessionUser } from "../../types.js";

export function requireRole(user: SessionUser, role: Role): void {
  if (user.role !== role) throw new HttpError(403, "FORBIDDEN", `Role ${role} is required.`);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseNonNegativeInteger(value: string, name: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new HttpError(400, "INVALID_REQUEST", `${name} must be a non-negative integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HttpError(400, "INVALID_REQUEST", `${name} must be a safe integer.`);
  return parsed;
}
