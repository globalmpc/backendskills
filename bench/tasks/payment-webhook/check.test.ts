import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { start } from "./harness.ts";

const app = await start();
after(app.close);
await app.pool.query(`insert into orders (user_id, status, total_cents, payment_id) values
  (1, 'pending', 500, 'pay_wh_1'), (1, 'pending', 500, 'pay_wh_2'), (1, 'pending', 500, 'pay_wh_3')`);
const status = async (paymentId: string) => (await app.pool.query("select status from orders where payment_id = $1", [paymentId])).rows[0].status;

let n = 0;
const event = (type: string, paymentId: string, created: number) => ({ id: `evt_${++n}`, type, paymentId, created });
// The body is pretty-printed, as some providers send it, so a signature over re-serialized JSON won't match.
function send(body: object, signature?: string | null) {
  const raw = JSON.stringify(body, null, 2);
  const sig = signature === undefined ? createHmac("sha256", "whsec_dev").update(raw).digest("hex") : signature;
  return fetch(`${app.base}/webhooks/payments`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(sig === null ? {} : { "provider-signature": sig }) },
    body: raw,
  });
}

test("a signed charge.succeeded marks the order paid", async () => {
  const res = await send(event("charge.succeeded", "pay_wh_1", 1000));
  assert.ok(res.ok, `status ${res.status}`);
  assert.equal(await status("pay_wh_1"), "paid");
});

test("an unsigned or wrongly signed webhook is rejected and changes nothing", async () => {
  const unsigned = await send(event("charge.succeeded", "pay_wh_2", 1000), null);
  const forged = await send(event("charge.succeeded", "pay_wh_2", 1000), "00".repeat(32));
  for (const res of [unsigned, forged]) assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
  assert.equal(await status("pay_wh_2"), "pending");
});

test("a charge.succeeded that arrives after the refund doesn't undo the refund", async () => {
  const refunded = await send(event("charge.refunded", "pay_wh_3", 2000));
  const late = await send(event("charge.succeeded", "pay_wh_3", 1000));
  assert.ok(refunded.status < 500 && late.status < 500, `status ${refunded.status}, ${late.status}`);
  assert.equal(await status("pay_wh_3"), "refunded");
});
