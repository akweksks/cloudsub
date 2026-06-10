import assert from "node:assert/strict";
import { createRequestCache } from "../src/lib/requestCache.js";

let calls = 0;
const cache = createRequestCache({ now: () => 1000 });

const first = await cache.get("admin:node-pool", async () => {
  calls += 1;
  return { value: "snapshot" };
});
const second = await cache.get("admin:node-pool", async () => {
  calls += 1;
  return { value: "next" };
});

assert.deepEqual(first, { value: "snapshot" });
assert.deepEqual(second, { value: "snapshot" });
assert.equal(calls, 1);

const forced = await cache.get("admin:node-pool", async () => {
  calls += 1;
  return { value: "forced" };
}, { force: true });

assert.deepEqual(forced, { value: "forced" });
assert.equal(calls, 2);

cache.invalidate("admin:node-pool");
const afterInvalidate = await cache.get("admin:node-pool", async () => {
  calls += 1;
  return { value: "fresh" };
});

assert.deepEqual(afterInvalidate, { value: "fresh" });
assert.equal(calls, 3);
