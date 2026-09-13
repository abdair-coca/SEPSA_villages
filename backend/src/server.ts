import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { Application } from "./application.js";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const application = new Application(pool, config);

export function createHttpServer(app: Application = application) {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void app.handle(request, response);
  });
}

if (process.argv[1]?.endsWith("server.js")) {
  if (!config.databaseUrl) {
    console.error("DATABASE_URL is required for PILOT_PROVISIONAL_BACKEND.");
    process.exitCode = 1;
  } else {
    const server = createHttpServer();
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
