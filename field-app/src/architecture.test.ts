/**
 * Regla de dependencias entre carpetas de field-app (ver `.dev/PLAN.md`).
 *
 * Lee el código fuente (sin tests) y falla si un import relativo cruza una frontera prohibida.
 * Las excepciones conocidas están listadas abajo con su motivo; no añadir nuevas sin justificarlo.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Carpeta de primer nivel de un archivo (`components/common` cuenta como carpeta propia). */
function folderOf(file: string): string {
  const parts = file.replace(/^\.\//, "").split("/");
  if (parts.length === 1) return parts[0];
  if (parts[0] === "components" && parts[1] === "common") return "components/common";
  return parts[0];
}

function resolveRelative(from: string, specifier: string): string {
  const segments = from.replace(/^\.\//, "").split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") segments.pop();
    else if (part !== ".") segments.push(part);
  }
  return segments.join("/");
}

interface ImportEdge {
  file: string;
  target: string;
  from: string;
  to: string;
}

const edges: ImportEdge[] = Object.entries(sources).flatMap(([file, code]) =>
  [...code.matchAll(/(?:\bfrom|\bimport\()\s*["'](\.{1,2}\/[^"']+)["']/g)].map((match) => {
    const target = resolveRelative(file, match[1]);
    return { file: file.replace(/^\.\//, ""), target, from: folderOf(file), to: folderOf(target) };
  }),
);

/** Imports de adaptadores concretos fuera de los puntos de composición, pendientes de revisar. */
const KNOWN_ADAPTER_EXCEPTIONS = new Set([
  // La pantalla del técnico crea su propio monitor de conectividad del navegador.
  "screens/FieldApp.tsx => adapters/browser/connectivity",
  // Login persiste la sesión directamente en el almacenamiento del navegador.
  "screens/LoginScreen.tsx => adapters/browser/session-persistence",
]);

function violations(rule: (edge: ImportEdge) => boolean): string[] {
  return edges.filter((edge) => edge.from !== edge.to && rule(edge)).map((edge) => `${edge.file} => ${edge.target}`);
}

describe("regla de dependencias", () => {
  it("encuentra el código fuente", () => {
    expect(edges.length).toBeGreaterThan(50);
  });

  it("domain no importa nada del proyecto", () => {
    expect(violations((edge) => edge.from === "domain")).toEqual([]);
  });

  it("ports solo importa domain", () => {
    expect(violations((edge) => edge.from === "ports" && edge.to !== "domain")).toEqual([]);
  });

  it("use-cases solo importa domain y ports", () => {
    expect(violations((edge) => edge.from === "use-cases" && !["domain", "ports"].includes(edge.to))).toEqual([]);
  });

  it("components/common no conoce el dominio ni el estado", () => {
    const forbidden = ["domain", "ports", "state", "use-cases", "adapters", "bootstrap", "components", "screens"];
    expect(violations((edge) => edge.from === "components/common" && forbidden.includes(edge.to))).toEqual([]);
  });

  it("las capas internas no importan pantallas ni componentes", () => {
    const inner = ["domain", "ports", "use-cases", "adapters", "state", "bootstrap", "services", "utils"];
    expect(violations((edge) => inner.includes(edge.from) && ["screens", "components", "components/common"].includes(edge.to))).toEqual([]);
  });

  it("solo los puntos de composición conocen adaptadores concretos", () => {
    const composition = ["App.tsx", "main.tsx", "bootstrap", "adapters"];
    const found = violations((edge) => edge.to === "adapters" && !composition.includes(edge.from));
    expect(found.filter((violation) => !KNOWN_ADAPTER_EXCEPTIONS.has(violation))).toEqual([]);
  });

  it("las excepciones conocidas siguen existiendo (si se corrige una, quitarla de la lista)", () => {
    const current = new Set(edges.map((edge) => `${edge.file} => ${edge.target}`));
    expect([...KNOWN_ADAPTER_EXCEPTIONS].filter((exception) => !current.has(exception))).toEqual([]);
  });
});
