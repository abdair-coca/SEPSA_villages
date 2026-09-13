import type { ServerResponse } from "node:http";

export interface HttpErrorShape {
  status: number;
  code: string;
  message: string;
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function parseBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(header);
  return match?.[1];
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(serialized);
}

export function sendNoContent(response: ServerResponse): void {
  response.writeHead(204, { "cache-control": "no-store" });
  response.end();
}

export async function parseJsonBody(request: AsyncIterable<Uint8Array | string>, maxBytes: number): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new HttpError(400, "INVALID_JSON", "Request body must be JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!isRecord(parsed)) throw new HttpError(400, "INVALID_JSON", "Request body must be a JSON object.");
  return parsed;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new HttpError(400, "INVALID_REQUEST", `${field} is required.`);
  return value.trim();
}

export function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new HttpError(400, "INVALID_REQUEST", `${field} must be an integer.`);
  return value;
}

export function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value === undefined ? undefined : isRecord(value) ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorBody(error: unknown): HttpErrorShape {
  if (error instanceof HttpError) return { status: error.status, code: error.code, message: error.message };
  if (error && typeof error === "object" && "code" in error && error.code === "23505") return { status: 409, code: "IDEMPOTENCY_CONFLICT", message: "A provisional unique operation already exists." };
  return { status: 500, code: "INTERNAL_ERROR", message: "Unexpected provisional backend error." };
}
