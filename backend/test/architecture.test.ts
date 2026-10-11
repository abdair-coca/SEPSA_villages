import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Reglas de dependencias del backend (ver `.dev/PLAN.md` → "Estructura objetivo — backend"):
// controllers → services → repositories → db. Se verifican leyendo el código fuente.
const srcDirectory = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(directory: string): string[] {
  const path = join(srcDirectory, directory);
  return readdirSync(path).filter((name) => name.endsWith(".ts")).map((name) => join(path, name));
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
}

test("ningún controlador ejecuta SQL", () => {
  const offenders = sourceFiles("controllers").filter((file) => /\.query\s*\(/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("los repositorios no conocen HTTP ni errores de negocio", () => {
  for (const file of sourceFiles("repositories")) {
    const source = readFileSync(file, "utf8");
    assert.ok(!importsOf(file).some((specifier) => specifier === "node:http" || specifier.includes("/http/") || specifier.includes("/controllers/") || specifier.includes("/services/")), `${file} importa una capa superior`);
    assert.ok(!/\bHttpError\b/.test(source), `${file} usa HttpError`);
  }
});

test("los servicios no dependen de HTTP ni de los controladores", () => {
  for (const file of sourceFiles("services")) {
    const imports = importsOf(file);
    assert.ok(!imports.includes("node:http"), `${file} importa node:http`);
    assert.ok(!imports.some((specifier) => specifier.includes("/controllers/")), `${file} importa un controlador`);
    // `http/responses.js` solo para lanzar HttpError con el código de negocio; el resto de `http/` es de transporte.
    assert.ok(!imports.some((specifier) => specifier.includes("/http/") && !specifier.endsWith("/http/responses.js")), `${file} importa transporte HTTP`);
  }
});

test("el directorio src/application ya no existe", () => {
  assert.equal(existsSync(join(srcDirectory, "application")), false);
});
