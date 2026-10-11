import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { Application } from "./application.js";

function createApplication() {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  return new Application(pool, config);
}

export function createHttpServer(app?: Application) {
  const application = app ?? createApplication();
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void application.handle(request, response);
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(resolve(entrypoint)).href === import.meta.url;
}

if (isMainModule()) {
  const config = loadConfig();
  if (!config.databaseUrl) {
    console.error("DATABASE_URL is required for PILOT_PROVISIONAL_BACKEND.");
    process.exitCode = 1;
  } else {
    const pool = createPool(config.databaseUrl);
    const server = createHttpServer(new Application(pool, config));
    server.listen(config.port, config.host, () => {
      console.log(`PILOT_PROVISIONAL_BACKEND listening on ${config.host}:${config.port}`);
    });
    const shutdown = () => {
      server.close(() => void pool.end());
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
}
