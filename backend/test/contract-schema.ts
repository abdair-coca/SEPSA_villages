import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const openapi = JSON.parse(await readFile(new URL("../openapi/pilot-provisional.openapi.json", import.meta.url), "utf8")) as SchemaObject;

export function assertSchema(name: string, value: unknown): void {
  const schemas = (openapi.components as SchemaObject).schemas as Record<string, SchemaObject>;
  const schema = schemas[name];
  assert.ok(schema, `OpenAPI schema ${name} exists`);
  validate(schema, value, `#/components/schemas/${name}`);
}

interface SchemaObject { [key: string]: unknown; }
function validate(schema: SchemaObject, value: unknown, path: string): void {
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) validate(child as SchemaObject, value, path);
  if (schema.if && schema.then && matches(schema.if as SchemaObject, value, path)) validate(schema.then as SchemaObject, value, path);
  if (schema.$ref) {
    const ref = String(schema.$ref).replace(/^#\//, "").split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    let target: unknown = openapi;
    for (const part of ref) target = (target as Record<string, unknown>)[part];
    validate(target as SchemaObject, value, path);
    return;
  }
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some((type) => isType(value, String(type)))) throw new Error(`${path}: expected type ${types.join(" | ")}`);
  if ("const" in schema && value !== schema.const) throw new Error(`${path}: expected const ${String(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error(`${path}: value outside enum`);
  if (isObject(value)) {
    for (const key of (schema.required as string[] | undefined) ?? []) if (!(key in value)) throw new Error(`${path}: missing ${key}`);
    const properties = (schema.properties as Record<string, SchemaObject> | undefined) ?? {};
    for (const [key, child] of Object.entries(properties)) if (key in value) validate(child, value[key], `${path}/${key}`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in properties)) throw new Error(`${path}: unexpected ${key}`);
  }
  if (Array.isArray(value) && schema.items) for (const item of value) validate(schema.items as SchemaObject, item, `${path}[]`);
  if (typeof value === "string" && typeof schema.minLength === "number" && value.length < schema.minLength) throw new Error(`${path}: string too short`);
  if (Array.isArray(value) && typeof schema.minItems === "number" && value.length < schema.minItems) throw new Error(`${path}: array too short`);
  if (Array.isArray(value) && typeof schema.maxItems === "number" && value.length > schema.maxItems) throw new Error(`${path}: array too long`);
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) throw new Error(`${path}: number too small`);
}
function matches(schema: SchemaObject, value: unknown, path: string): boolean {
  try { validate(schema, value, path); return true; } catch { return false; }
}
function isType(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return typeof value === type;
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
