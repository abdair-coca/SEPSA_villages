/**
 * Límite de intentos de login en memoria por IP y usuario. Es por proceso: con varias instancias del
 * backend hace falta un límite distribuido (pendiente de definir para despliegue).
 */
import type { IncomingMessage } from "node:http";
import type { Config } from "../config.js";
import { HttpError } from "../http/responses.js";

interface LoginAttempt {
  startedAt: number;
  count: number;
}

export interface LoginRateLimiter {
  enforce(request: IncomingMessage, username: string): void;
}

export function createLoginRateLimiter(config: Pick<Config, "loginRateLimitMax" | "loginRateLimitWindowSeconds" | "loginRateLimitMaxEntries">): LoginRateLimiter {
  const attempts = new Map<string, LoginAttempt>();
  const windowMs = (config.loginRateLimitWindowSeconds ?? 60) * 1000;
  const maxAttempts = config.loginRateLimitMax ?? 5;
  const maxEntries = config.loginRateLimitMaxEntries ?? 10_000;

  function enforce(request: IncomingMessage, username: string): void {
    const now = Date.now();
    const key = `${request.socket.remoteAddress ?? "unknown"}\u0000${username.trim().toLocaleLowerCase("en-US")}`;
    let attempt = attempts.get(key);
    if (attempt && now - attempt.startedAt >= windowMs) attempt = undefined;

    if (!attempt) {
      if (attempts.size >= maxEntries) {
        evictExpiredAttempts(now);
        if (attempts.size >= maxEntries) attempts.delete(attempts.keys().next().value as string);
      }
      attempt = { startedAt: now, count: 0 };
      attempts.set(key, attempt);
    }

    attempt.count += 1;
    if (attempt.count > maxAttempts) throw new HttpError(429, "LOGIN_RATE_LIMITED", "Demasiados intentos de inicio de sesión. Intente más tarde.");
  }

  function evictExpiredAttempts(now: number): void {
    for (const [key, attempt] of attempts) {
      if (now - attempt.startedAt >= windowMs) attempts.delete(key);
    }
  }

  return { enforce };
}
