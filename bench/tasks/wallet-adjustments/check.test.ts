import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as, inPostman, downMigrations } from "./harness.ts";

const app = await start();
after(app.close);
const balance = async (id: number) => (await app.pool.query("select balance_cents from wallets where user_id = $1", [id])).rows[0].balance_cents;
const adjust = (token: string, userId: number, body: object) =>
  fetch(`${app.base}/wallets/${userId}/adjustments`, { method: "POST", headers: as(token), body: JSON.stringify(body) });

test("an admin adjusts a balance and it is recorded", async () => {
  const res = await adjust("admin-token", 2, { amountCents: 300, reason: "goodwill" });
  assert.ok(res.ok, `status ${res.status}`);
  assert.equal(await balance(2), 800);
  const { rows } = await app.pool.query("select user_id, admin_id, amount_cents, reason from wallet_adjustments");
  assert.deepEqual(rows, [{ user_id: 2, admin_id: 3, amount_cents: 300, reason: "goodwill" }]);
});

test("other users can't adjust, and a balance can't go below 0", async () => {
  const user = await adjust("alice-token", 1, { amountCents: 1000, reason: "me" });
  assert.ok(user.status === 403 || user.status === 404, `user: status ${user.status}`);
  const overdraw = await adjust("admin-token", 2, { amountCents: -900, reason: "too much" });
  assert.ok(overdraw.status >= 400 && overdraw.status < 500, `overdraw: status ${overdraw.status}`);
  assert.deepEqual([await balance(1), await balance(2)], [10000, 800]);
});

test("convention: recorded adjustments can't be edited or deleted, even directly in the database", async () => {
  const rows = async () => (await app.pool.query("select * from wallet_adjustments order by 1")).rows;
  const before = await rows();
  await app.pool.query("update wallet_adjustments set amount_cents = 1, reason = 'edited'").catch(() => {});
  await app.pool.query("delete from wallet_adjustments").catch(() => {});
  assert.deepEqual(await rows(), before);
});

test("convention: the new endpoint is in the Postman collection", async () => {
  assert.ok(await inPostman("POST", /wallets\/[^/]+\/adjustments$/), "no POST /wallets/:userId/adjustments request");
});

test("convention: every migration has a down migration that exactly reverses it", async () => {
  const { missing, base, after } = await downMigrations(app.pool);
  assert.deepEqual(missing, [], "migrations without migrations/down/<name>");
  assert.deepEqual(after, base);
});
