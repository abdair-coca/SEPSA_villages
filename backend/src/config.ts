export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  sessionTtlSeconds: number;
  authorizationTtlSeconds: number;
  maxBodyBytes: number;
  corsOrigin: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? "0.0.0.0",
    port: positiveInteger(env.PORT, 8080),
    databaseUrl: env.DATABASE_URL ?? "",
    sessionTtlSeconds: positiveInteger(env.SESSION_TTL_SECONDS, 28_800),
    authorizationTtlSeconds: positiveInteger(env.AUTHORIZATION_TTL_SECONDS, 300),
    maxBodyBytes: positiveInteger(env.HTTP_MAX_BODY_BYTES, 1_048_576),
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:5173",
  };
}
