import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as } from "./harness.ts";

const app = await start();
after(app.close);
const balance = async (id: number) => (await app.pool.query("select balance_cents from wallets where user_id = $1", [id])).rows[0].balance_cents;
const transfer = (token: string, toUserId: number, amountCents: number) =>
  fetch(`${app.base}/transfers`, { method: "POST", headers: as(token), body: JSON.stringify({ toUserId, amountCents }) });

test("a transfer moves the money", async () => {
  const res = await transfer("alice-token", 2, 100);
  assert.ok(res.ok, `status ${res.status}`);
  assert.equal(await balance(1), 9900);
  assert.equal(await balance(2), 600);
});

test("10 transfers at once never overdraw or create money", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => transfer("alice-token", 2, 2000)));
  const alice = await balance(1);
  const bob = await balance(2);
  assert.ok(alice >= 0, `alice balance ${alice}`);
  assert.equal(alice + bob, 10500, "total money");
  assert.equal(results.filter((r) => r.ok).length, 4, "transfers that went through");
});

test("a negative amount is rejected and nothing moves", async () => {
  const [alice, bob] = [await balance(1), await balance(2)];
  const res = await transfer("bob-token", 1, -1000);
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
  assert.deepEqual([await balance(1), await balance(2)], [alice, bob]);
});

test("transfers both ways at once all go through (no deadlock)", async () => {
  const [alice, bob] = [await balance(1), await balance(2)];
  for (let round = 0; round < 3; round++) {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? transfer("alice-token", 2, 10) : transfer("bob-token", 1, 10))));
    assert.deepEqual(results.map((r) => r.status).filter((s) => s >= 300), [], "failed transfers");
  }
  assert.deepEqual([await balance(1), await balance(2)], [alice, bob]);
});

test("a transfer to a user who doesn't exist, or of a fractional amount, is rejected and nothing moves", async () => {
  const [alice, bob] = [await balance(1), await balance(2)];
  for (const [to, amount] of [[999, 100], [2, 10.5]]) {
    const res = await transfer("alice-token", to, amount);
    assert.ok(res.status >= 400 && res.status < 500, `to ${to}, amount ${amount}: status ${res.status}`);
  }
  assert.deepEqual([await balance(1), await balance(2)], [alice, bob]);
});
