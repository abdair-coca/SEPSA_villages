import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, createOpaqueToken, hashToken } from "../src/auth.js";

test("scrypt password hashes verify without storing the password", async () => {
  const encoded = await hashPassword("PILOT_PROVISIONAL_TEST_PASSWORD");
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword("PILOT_PROVISIONAL_TEST_PASSWORD", encoded), true);
  assert.equal(await verifyPassword("wrong", encoded), false);
  assert.equal(encoded.includes("PILOT_PROVISIONAL_TEST_PASSWORD"), false);
});

test("opaque tokens are random and only their digest is persisted", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.match(hashToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashToken(first), first);
});
