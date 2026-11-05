import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as } from "./harness.ts";

const app = await start();
after(app.close);

test("the owner gets the order", async () => {
  const res = await fetch(`${app.base}/orders/2`, { headers: as("alice-token") });
  assert.equal(res.status, 200);
  assert.match(JSON.stringify(await res.json()), /"id":2\b/);
});

test("another user can't read it", async () => {
  const res = await fetch(`${app.base}/orders/2`, { headers: as("bob-token") });
  assert.ok(res.status === 403 || res.status === 404, `status ${res.status}`);
  assert.doesNotMatch(await res.text(), /15000/);
});

test("an unknown or malformed id gets a 4xx, not a server error", async () => {
  for (const id of ["999", "abc", "1.5", "99999999999"]) {
    const res = await fetch(`${app.base}/orders/${id}`, { headers: as("alice-token") });
    assert.ok(res.status >= 400 && res.status < 500, `/orders/${id}: status ${res.status}`);
  }
});
