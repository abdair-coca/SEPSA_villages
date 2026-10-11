/**
 * Dependencias compartidas por todos los módulos: pool de base de datos, configuración y log de seguridad.
 * `PROVISIONAL_SOURCE` marca todo dato del piloto para no confundirlo con datos oficiales.
 */
import type { Pool } from "pg";
import type { Config } from "../config.js";
import type { SecurityEvent } from "../security-logger.js";

export const PROVISIONAL_SOURCE = "PILOT_PROVISIONAL";

export interface ApplicationContext {
  pool: Pool;
  config: Config;
  logEvent(event: SecurityEvent["event"], fields: Omit<SecurityEvent, "event">): void;
}
