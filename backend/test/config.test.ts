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

test("cookie security and in-process login limit have explicit configurable defaults", () => {
  assert.equal(loadConfig({}).cookieSecure, false);
  assert.equal(loadConfig({ COOKIE_SECURE: "true" }).cookieSecure, true);
  assert.equal(loadConfig({ NODE_ENV: "production", COOKIE_SECURE: "false" }).cookieSecure, true);
  assert.equal(loadConfig({}).loginRateLimitMax, 5);
  assert.equal(loadConfig({ LOGIN_RATE_LIMIT_MAX: "8", LOGIN_RATE_LIMIT_WINDOW_SECONDS: "90", LOGIN_RATE_LIMIT_MAX_ENTRIES: "200" }).loginRateLimitMax, 8);
  assert.equal(loadConfig({ LOGIN_RATE_LIMIT_WINDOW_SECONDS: "90" }).loginRateLimitWindowSeconds, 90);
  assert.equal(loadConfig({ LOGIN_RATE_LIMIT_MAX_ENTRIES: "200" }).loginRateLimitMaxEntries, 200);
});
