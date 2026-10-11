/**
 * Datos del entorno de ejecución que `App.tsx` necesita para arrancar: URL del backend piloto (define el modo
 * simulado o conectado) e identificador estable del dispositivo. No crea adaptadores ni toca el estado.
 */

/** Identificador estable de este dispositivo, generado una vez y guardado en `localStorage`. */
export function getStableDeviceId(): string {
  const storageKey = "sepsa.simulated.device-id";
  if (typeof localStorage === "undefined") throw new Error("No se pudo identificar este dispositivo.");
  const existing = localStorage.getItem(storageKey)?.trim();
  if (existing) return existing;
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (!randomUuid) throw new Error("No se pudo generar una identidad segura para este dispositivo.");
  const deviceId = `device-${randomUuid}`;
  localStorage.setItem(storageKey, deviceId);
  return deviceId;
}

/**
 * URL del backend piloto: `VITE_PILOT_BACKEND_URL` si está definida; en producción (fuera de localhost),
 * el mismo origen de la página. En desarrollo sin variable, modo simulado.
 */
export function resolvePilotBackendUrl(): string | undefined {
  const configured = import.meta.env.VITE_PILOT_BACKEND_URL?.trim();
  if (configured) return configured;
  if (!import.meta.env.PROD || typeof window === "undefined") return undefined;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return undefined;
  return window.location.origin;
}
