import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as, inPostman, downMigrations } from "./harness.ts";

const app = await start();
after(app.close);
const review = (token: string, productId: number, body: object) =>
  fetch(`${app.base}/products/${productId}/reviews`, { method: "POST", headers: as(token), body: JSON.stringify(body) });

test("a buyer reviews a product and it is listed", async () => {
  const res = await review("alice-token", 1, { rating: 5, body: "Great shirt" });
  assert.ok(res.ok, `status ${res.status}`);
  const list = await fetch(`${app.base}/products/1/reviews`, { headers: as("bob-token") });
  assert.equal(list.status, 200);
  assert.match(await list.text(), /Great shirt/);
});

test("non-buyers, second reviews and ratings outside 1-5 are rejected", async () => {
  for (const [token, productId, body] of [
    ["bob-token", 1, { rating: 4, body: "never bought it" }],
    ["alice-token", 1, { rating: 1, body: "second review" }],
    ["alice-token", 3, { rating: 6, body: "too high" }],
  ] as const) {
    const res = await review(token, productId, body);
    assert.ok(res.status >= 400 && res.status < 500, `${body.body}: status ${res.status}`);
  }
  assert.equal((await app.pool.query("select count(*)::int as n from reviews")).rows[0].n, 1);
});

test("convention: the database itself refuses a rating outside 1-5 and a second review", async () => {
  const insert = (productId: number, userId: number, rating: number) =>
    app.pool.query("insert into reviews (product_id, user_id, rating, body) values ($1, $2, $3, 'direct')", [productId, userId, rating]).catch(() => {});
  await insert(2, 2, 5); // valid
  await insert(3, 2, 6);
  await insert(2, 2, 4);
  const { rows } = await app.pool.query("select product_id, user_id, rating from reviews where body = 'direct' order by 1, 3");
  assert.deepEqual(rows, [{ product_id: 2, user_id: 2, rating: 5 }]);
});

test("convention: the new endpoints are in the Postman collection", async () => {
  assert.ok(await inPostman("POST", /products\/[^/]+\/reviews$/), "no POST /products/:id/reviews request");
  assert.ok(await inPostman("GET", /products\/[^/]+\/reviews$/), "no GET /products/:id/reviews request");
});

test("convention: every migration has a down migration that exactly reverses it", async () => {
  const { missing, base, after } = await downMigrations(app.pool);
  assert.deepEqual(missing, [], "migrations without migrations/down/<name>");
  assert.deepEqual(after, base);
});
