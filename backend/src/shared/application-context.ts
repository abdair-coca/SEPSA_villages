/**
 * Dependencias compartidas por todas las capas: pool de base de datos, configuración y log de seguridad.
 * Vive en `shared/` (y no en `http/`) porque lo importan también servicios, repositorios y mapeadores.
 * `PROVISIONAL_SOURCE` marca todo dato del piloto para no confundirlo con datos oficiales.
 */
import type { Pool } from "pg";
import type { Config } from "../config.js";
import type { SecurityEvent } from "../logging/security-logger.js";

export const PROVISIONAL_SOURCE = "PILOT_PROVISIONAL";

export interface ApplicationContext {
  pool: Pool;
  config: Config;
  logEvent(event: SecurityEvent["event"], fields: Omit<SecurityEvent, "event">): void;
}
