import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as, providerDown } from "./harness.ts";

const app = await start();
after(app.close);
const stock = async (id: number) => (await app.pool.query("select stock from products where id = $1", [id])).rows[0].stock;
const charges = async () => (await app.pool.query("select count(*)::int as n from payment_calls where kind = 'charge' and created_at > now() - interval '10 minutes'")).rows[0].n;
const order = (token: string, productId: number, quantity: number) =>
  fetch(`${app.base}/orders`, { method: "POST", headers: as(token), body: JSON.stringify({ items: [{ productId, quantity }] }) });

test("an order for an item in stock works", async () => {
  const res = await order("alice-token", 1, 2);
  assert.ok(res.ok, `status ${res.status}`);
  assert.equal(await stock(1), 98);
  assert.equal(await charges(), 1);
});

test("20 buyers at once for 5 sneakers: 5 orders, 5 charges, stock never below 0", async () => {
  const before = await charges();
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => order(i % 2 ? "bob-token" : "alice-token", 3, 1)));
  const sold = results.filter((r) => r.ok).length;
  assert.equal(await stock(3), 0, "stock left");
  assert.equal(sold, 5, "orders placed");
  assert.equal((await charges()) - before, 5, "charges at the provider");
});

test("a negative quantity is rejected and nothing changes", async () => {
  const before = await charges();
  const res = await order("bob-token", 2, -3);
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
  assert.equal(await stock(2), 40);
  assert.equal(await charges(), before);
});

test("orders for the same two products in opposite order, at once, all go through (no deadlock)", async () => {
  const [a, b] = [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }];
  const send = (items: object[]) => fetch(`${app.base}/orders`, { method: "POST", headers: as("alice-token"), body: JSON.stringify({ items }) });
  for (let round = 0; round < 3; round++) {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => send(i % 2 ? [a, b] : [b, a])));
    assert.deepEqual(results.map((r) => r.status).filter((s) => s >= 300), [], "failed orders");
  }
});

test("the same product twice in one order is handled, not a server error", async () => {
  const before = await stock(1);
  const res = await fetch(`${app.base}/orders`, {
    method: "POST", headers: as("bob-token"),
    body: JSON.stringify({ items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 1 }] }),
  });
  assert.ok(res.status < 500, `status ${res.status}`);
  assert.equal(await stock(1), res.ok ? before - 2 : before, "stock");
});

test("if the payment provider is down, the order fails and the stock comes back", async () => {
  const before = await stock(1);
  const paid = async () => (await app.pool.query("select count(*)::int as n from orders where status = 'paid'")).rows[0].n;
  const paidBefore = await paid();
  await providerDown(true, app.pool);
  const res = await order("bob-token", 1, 3).finally(() => providerDown(false, app.pool));
  assert.ok(!res.ok, `status ${res.status}`);
  assert.equal(await stock(1), before, "stock");
  assert.equal(await paid(), paidBefore, "paid orders");
});
