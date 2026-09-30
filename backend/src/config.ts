export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  sessionTtlSeconds: number;
  authorizationTtlSeconds: number;
  paymentAuthorityTimeoutMs: number;
  maxBodyBytes: number;
  corsOrigin: string;
  cookieSecure?: boolean;
  loginRateLimitMax?: number;
  loginRateLimitWindowSeconds?: number;
  loginRateLimitMaxEntries?: number;
}

export const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? "0.0.0.0",
    port: positiveInteger(env.PORT, 8080),
    databaseUrl: env.DATABASE_URL ?? "",
    sessionTtlSeconds: positiveInteger(env.SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS),
    authorizationTtlSeconds: positiveInteger(env.AUTHORIZATION_TTL_SECONDS, 300),
    paymentAuthorityTimeoutMs: positiveInteger(env.PAYMENT_AUTHORITY_TIMEOUT_MS, 3000),
    maxBodyBytes: positiveInteger(env.HTTP_MAX_BODY_BYTES, 12_000_000),
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:5173",
    cookieSecure: env.NODE_ENV === "production" || env.COOKIE_SECURE === "true",
    loginRateLimitMax: positiveInteger(env.LOGIN_RATE_LIMIT_MAX, 5),
    loginRateLimitWindowSeconds: positiveInteger(env.LOGIN_RATE_LIMIT_WINDOW_SECONDS, 60),
    loginRateLimitMaxEntries: positiveInteger(env.LOGIN_RATE_LIMIT_MAX_ENTRIES, 10_000),
  };
}
