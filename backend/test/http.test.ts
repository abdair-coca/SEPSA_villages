import test from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { HttpError, parseBearerToken, parseJsonBody, sendJson, sendNoContent } from "../src/http.js";

test("JSON parser accepts object and enforces byte limit", async () => {
  const request = Readable.from([Buffer.from('{"operation_id":"PILOT_PROVISIONAL-1"}')]);
  assert.deepEqual(await parseJsonBody(request, 100), { operation_id: "PILOT_PROVISIONAL-1" });
  const tooLarge = Readable.from([Buffer.from("123456789")]);
  await assert.rejects(parseJsonBody(tooLarge, 4), (error: unknown) => error instanceof HttpError && error.code === "PAYLOAD_TOO_LARGE");
});

test("bearer parser rejects malformed or short credentials", () => {
  assert.equal(parseBearerToken(undefined), undefined);
  assert.equal(parseBearerToken("Basic abc"), undefined);
  assert.equal(parseBearerToken("Bearer too-short"), undefined);
  assert.equal(parseBearerToken(`Bearer ${"PILOT_PROVISIONAL_TOKEN_123456"}`), "PILOT_PROVISIONAL_TOKEN_123456");
});

test("API responses explicitly prevent proxy and CDN caching", () => {
  const json = createResponse();
  sendJson(json.response, 200, { ok: true });
  const noContent = createResponse();
  sendNoContent(noContent.response);

  for (const response of [json, noContent]) {
    assert.equal(response.status, response === noContent ? 204 : 200);
    assert.equal(response.headers["cache-control"], "no-store, no-cache, max-age=0, must-revalidate");
    assert.equal(response.headers["cdn-cache-control"], "no-store");
    assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
  }
});

function createResponse() {
  const captured = { status: 0, headers: {} as Record<string, string> };
  const response = {
    writeHead(status: number, headers: Record<string, string>) {
      captured.status = status;
      captured.headers = headers;
      return response;
    },
    end() {
      return response;
    },
  } as unknown as ServerResponse;
  return { response, get status() { return captured.status; }, get headers() { return captured.headers; } };
}
