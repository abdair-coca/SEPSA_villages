/**
 * Políticas HTTP de seguridad:
 * - Cabeceras defensivas en todas las respuestas (nosniff, sin iframes, sin referrer; HSTS si hay HTTPS).
 * - CORS solo para el origen configurado, con credenciales.
 * - Protección CSRF en POST: el origen debe ser el permitido; con cookie de sesión el origen es obligatorio;
 *   se rechaza `sec-fetch-site: cross-site`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, parseBearerToken } from "./responses.js";

export function setSecurityHeaders(response: ServerResponse, requestId: string, secure?: boolean): void {
  response.setHeader("x-request-id", requestId);
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (secure) response.setHeader("strict-transport-security", "max-age=31536000");
}

export function setCorsHeaders(response: ServerResponse, allowedOrigin: string): void {
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("access-control-allow-headers", "authorization, content-type");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("vary", "Origin");
}

export function validateOrigin(request: IncomingMessage, allowedOrigin: string): void {
  if (request.method !== "POST") return;
  const origin = request.headers.origin;
  const usesCookieAuthentication = !parseBearerToken(request.headers.authorization);
  const hasUnexpectedOrigin = origin !== undefined && origin !== allowedOrigin;
  // Con cookie el navegador la envía sola; sin cabecera Origin no se puede descartar una petición CSRF.
  const missingCookieOrigin = !origin && usesCookieAuthentication;

  if (hasUnexpectedOrigin || missingCookieOrigin) {
    throw new HttpError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed.");
  }
  if (request.headers["sec-fetch-site"] === "cross-site") {
    throw new HttpError(403, "CSRF_FETCH_METADATA_REJECTED", "Cross-site request is not allowed.");
  }
}

export function validRequestId(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : undefined;
}
