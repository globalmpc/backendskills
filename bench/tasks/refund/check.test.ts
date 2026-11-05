import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as, providerDown } from "./harness.ts";

const app = await start();
after(app.close);
const refunds = async (paymentId: string) =>
  (await app.pool.query("select count(*)::int as n from payment_calls where kind = 'refund' and payment_id = $1", [paymentId])).rows[0].n;
const status = async (id: number) => (await app.pool.query("select status from orders where id = $1", [id])).rows[0].status;

test("the same refund sent twice at once is refunded once", async () => {
  const send = () => fetch(`${app.base}/orders/1/refund`, { method: "POST", headers: as("alice-token") });
  await Promise.all([send(), send()]);
  assert.equal(await refunds("pay_seed_1"), 1, "refunds at the provider");
  assert.equal(await status(1), "refunded");
});

test("a user can't refund someone else's order", async () => {
  const res = await fetch(`${app.base}/orders/2/refund`, { method: "POST", headers: as("bob-token") });
  assert.ok(res.status === 403 || res.status === 404, `status ${res.status}`);
  assert.equal(await refunds("pay_seed_2"), 0, "refunds at the provider");
  assert.equal(await status(2), "paid");
});

test("if the payment provider is down, the refund fails and can be retried later", async () => {
  const send = () => fetch(`${app.base}/orders/2/refund`, { method: "POST", headers: as("alice-token") });
  await providerDown(true, app.pool);
  const res = await send().finally(() => providerDown(false, app.pool));
  assert.ok(!res.ok, `status ${res.status}`);
  assert.notEqual(await status(2), "refunded", "marked refunded but no money went back");
  const retry = await send();
  assert.ok(retry.ok, `retry status ${retry.status}`);
  assert.equal(await status(2), "refunded");
  assert.equal(await refunds("pay_seed_2"), 1, "refunds at the provider");
});
