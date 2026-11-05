import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as, inPostman, downMigrations } from "./harness.ts";

const app = await start();
after(app.close);
const discount = async (id: number) => (await app.pool.query("select discount_percent from products where id = $1", [id])).rows[0].discount_percent;
const patch = (token: string, id: number, body: object) =>
  fetch(`${app.base}/products/${id}`, { method: "PATCH", headers: as(token), body: JSON.stringify(body) });

test("an admin sets a discount", async () => {
  const res = await patch("admin-token", 1, { discountPercent: 20 });
  assert.ok(res.ok, `status ${res.status}`);
  assert.equal(await discount(1), 20);
});

test("other users can't, and a discount over 100 is rejected", async () => {
  const user = await patch("alice-token", 1, { discountPercent: 90 });
  assert.ok(user.status === 403 || user.status === 404, `user: status ${user.status}`);
  const tooBig = await patch("admin-token", 1, { discountPercent: 150 });
  assert.ok(tooBig.status >= 400 && tooBig.status < 500, `150: status ${tooBig.status}`);
  assert.equal(await discount(1), 20);
});

test("convention: the database itself refuses a discount over 100", async () => {
  await app.pool.query("update products set discount_percent = 150 where id = 2").catch(() => {});
  assert.notEqual(await discount(2), 150);
});

test("convention: the new endpoint is in the Postman collection", async () => {
  assert.ok(await inPostman("PATCH", /products\/[^/]+$/), "no PATCH /products/:id request");
});

test("convention: every migration has a down migration that exactly reverses it", async () => {
  const { missing, base, after } = await downMigrations(app.pool);
  assert.deepEqual(missing, [], "migrations without migrations/down/<name>");
  assert.deepEqual(after, base);
});
