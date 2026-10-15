import test from "node:test";
import assert from "node:assert/strict";
import { savedAccessCode, rememberAccessCode } from "../public/access.js";
test("access code persists across reads and can be explicitly forgotten", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  assert.equal(savedAccessCode(storage), "");
  assert.equal(rememberAccessCode(storage, "test-only-code"), true);
  assert.equal(savedAccessCode(storage), "test-only-code");
  assert.equal(rememberAccessCode(storage, ""), true);
  assert.equal(savedAccessCode(storage), "");
});
test("blocked browser storage does not prevent sign-in", () => {
  assert.equal(savedAccessCode(undefined), "");
  assert.equal(rememberAccessCode(undefined, "test-only-code"), false);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(savedAccessCode(blocked), "");
  assert.equal(rememberAccessCode(blocked, "test-only-code"), false);
});
