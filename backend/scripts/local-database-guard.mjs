/**
 * Guarda de los scripts y pruebas que escriben datos sintéticos: solo aceptan una base PostgreSQL local, para que
 * una `DATABASE_URL` de Neon (producción) nunca reciba usuarios, órdenes ni migraciones de prueba.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Devuelve la URL si apunta a un host local; si falta o no es local, lanza un error antes de conectar. */
export function requireLocalDatabaseUrl(databaseUrl, purpose) {
  if (!databaseUrl?.trim()) throw new Error(`DATABASE_URL is required for ${purpose}. Use an isolated local PostgreSQL.`);
  let host;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL; refusing to run ${purpose}.`);
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error(`Refusing to run ${purpose} against non-local database host "${host}". Use an isolated local PostgreSQL.`);
  return databaseUrl;
}
