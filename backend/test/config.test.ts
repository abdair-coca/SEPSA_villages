import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SESSION_TTL_SECONDS, loadConfig } from "../src/config.js";

test("sessions default to seven days", () => {
  assert.equal(DEFAULT_SESSION_TTL_SECONDS, 604800);
  assert.equal(loadConfig({}).sessionTtlSeconds, 604800);
});

test("session TTL remains configurable for deployment policy", () => {
  assert.equal(loadConfig({ SESSION_TTL_SECONDS: "3600" }).sessionTtlSeconds, 3600);
});
