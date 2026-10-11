/**
 * SHA-256 de un valor JSON; se usa para comparar peticiones repetidas.
 */
import { createHash } from "node:crypto";

export function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
