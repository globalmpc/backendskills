import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as } from "./harness.ts";

const app = await start();
after(app.close);
// 45 more orders for Bob, all created in the same transaction (same created_at).
await app.pool.query("insert into orders (user_id, status, total_cents) select 2, 'paid', g from generate_series(1, 45) g");
const page = async (cursor?: string) =>
  (await fetch(`${app.base}/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: as("bob-token") })).json();
const bobOrders = async () => (await app.pool.query("select id from orders where user_id = 2 order by id")).rows.map((r) => r.id);
const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

test("paging walks through every order exactly once", async () => {
  const ids: number[] = [];
  let p = await page();
  assert.equal(p.orders.length, 20, "first page size");
  for (let i = 0; i < 10; i++) {
    ids.push(...p.orders.map((o: { id: number }) => o.id));
    if (!p.nextCursor) break;
    p = await page(p.nextCursor);
  }
  assert.deepEqual(sorted(ids), await bobOrders());
});

test("orders placed while paging don't cause duplicates or skipped orders", async () => {
  const before = await bobOrders();
  let p = await page();
  const ids: number[] = p.orders.map((o: { id: number }) => o.id);
  await app.pool.query("insert into orders (user_id, status, total_cents) select 2, 'paid', 1 from generate_series(1, 5)");
  for (let i = 0; i < 10 && p.nextCursor; i++) {
    p = await page(p.nextCursor);
    ids.push(...p.orders.map((o: { id: number }) => o.id));
  }
  assert.equal(new Set(ids).size, ids.length, "duplicate orders");
  assert.deepEqual(before.filter((id) => !ids.includes(id)), [], "skipped orders");
});

test("a bad cursor gets a 4xx, not a server error", async () => {
  const res = await fetch(`${app.base}/orders?cursor=not-a-cursor`, { headers: as("bob-token") });
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
});
