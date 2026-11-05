import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { start, as } from "./harness.ts";

const app = await start();
after(app.close);
const list = async (token: string) => (await fetch(`${app.base}/orders`, { headers: as(token) })).json();

// Counts the queries the app sends to Postgres while fn runs.
async function countQueries(fn: () => Promise<unknown>) {
  const original = pg.Client.prototype.query;
  let n = 0;
  pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
    n++;
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof original;
  try {
    await fn();
  } finally {
    pg.Client.prototype.query = original;
  }
  return n;
}

test("each order comes with its items and product names", async () => {
  const orders = await list("alice-token");
  const first = orders.find((o: { id: number }) => o.id === 1);
  assert.ok(Array.isArray(first?.items), "order 1 has no items array");
  assert.match(JSON.stringify(first.items), /T-shirt/);
  assert.match(JSON.stringify(orders.find((o: { id: number }) => o.id === 2).items), /Limited sneaker/);
});

test("the number of queries doesn't grow with the number of orders (no N+1)", async () => {
  await app.pool.query(`with o as (insert into orders (user_id, status, total_cents) select 2, 'paid', 1200 from generate_series(1, 30) returning id)
                        insert into order_items select id, 2, 1, 1200 from o`);
  let orders: { items: unknown[] }[] = [];
  const queries = await countQueries(async () => (orders = await list("bob-token")));
  assert.equal(orders.length, 31);
  assert.ok(orders.every((o) => o.items.length === 1), "every order has its item");
  assert.ok(queries <= 5, `${queries} queries for 31 orders`);
});
