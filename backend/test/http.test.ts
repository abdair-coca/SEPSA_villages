import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { HttpError, parseBearerToken, parseJsonBody } from "../src/http.js";

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
