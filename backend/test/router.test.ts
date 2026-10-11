import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { Application } from "../src/http/application.js";
import type { Config } from "../src/config.js";

const config: Config = { host: "127.0.0.1", port: 0, databaseUrl: "", sessionTtlSeconds: 3600, authorizationTtlSeconds: 300, maxBodyBytes: 1024, corsOrigin: "http://localhost:5173" };
const openapi = JSON.parse(await readFile(new URL("../openapi/pilot-provisional.openapi.json", import.meta.url), "utf8")) as {
  paths: Record<string, Record<string, { security?: unknown[] }>>;
};

// La tabla no necesita base de datos para construirse: el pool nunca se usa aquí.
const application = new Application({} as Pool, config);
const routes = application.router.routes;

const key = (method: string, pattern: string) => `${method.toUpperCase()} ${pattern}`;
const openapiOperations = Object.entries(openapi.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ id: key(method, path.replace(/\{([^}]+)\}/g, ":$1")), secured: Boolean(operation.security?.length) })));

test("la tabla de rutas y el OpenAPI listan exactamente los mismos endpoints (método + ruta)", () => {
  const table = routes.map((route) => key(route.method, route.pattern)).sort();
  const documented = openapiOperations.map((operation) => operation.id).sort();
  assert.deepEqual(table, documented);
  assert.equal(new Set(table).size, table.length, "no hay rutas duplicadas en la tabla");
});

test("las rutas públicas de la tabla son las que el OpenAPI no protege, salvo logout", () => {
  const publicInTable = routes.filter((route) => route.access === "public").map((route) => key(route.method, route.pattern)).sort();
  // `POST /v1/auth/logout` figura como pública en la tabla porque su controlador exige y valida la sesión por sí mismo
  // (ver `AuthHandlers.logout`); en el OpenAPI sí declara seguridad.
  const documentedPublic = openapiOperations.filter((operation) => !operation.secured).map((operation) => operation.id);
  assert.deepEqual(publicInTable, [...documentedPublic, "POST /v1/auth/logout"].sort());
});

test("el router resuelve parámetros de ruta y no mezcla accesos ni métodos", () => {
  const assignment = application.router.match("POST", "/v1/orders/abc-123/assignment", "session");
  assert.equal(assignment?.route.pattern, "/v1/orders/:order_id/assignment");
  assert.deepEqual(assignment?.params, { order_id: "abc-123" });
  assert.equal(application.router.match("POST", "/v1/orders/batch", "session")?.route.pattern, "/v1/orders/batch");
  assert.equal(application.router.match("GET", "/v1/auth/login", "public"), undefined);
  assert.equal(application.router.match("POST", "/v1/auth/login", "session"), undefined);
  assert.equal(application.router.match("GET", "/v1/orders/abc/assignment/extra", "session"), undefined);
  assert.equal(application.router.match("GET", "/v1/unknown", "session"), undefined);
});
