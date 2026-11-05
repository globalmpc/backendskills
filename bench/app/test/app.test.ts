import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { resetDatabase } from "../src/migrate.ts";
import { createApp } from "../src/app.ts";
import { pool } from "../src/db.ts";
import { payments } from "../src/payments.ts";

let server: Server;
let base: string;

before(async () => {
  await resetDatabase();
  server = createApp().listen(0);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  base = `http://localhost:${address.port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

const as = (token: string) => ({ authorization: `Bearer ${token}` });

test("health is open", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
});

test("requests without a valid token get 401 in the standard error format", async () => {
  const res = await fetch(`${base}/orders`, { headers: as("nope") });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: { code: "unauthorized", message: "Missing or invalid token" } });
});

test("/me returns the caller", async () => {
  const res = await fetch(`${base}/me`, { headers: as("alice-token") });
  assert.equal(res.status, 200);
  const me = await res.json();
  assert.equal(me.email, "alice@example.com");
  assert.equal(me.api_token, undefined);
});

test("/orders lists only the caller's orders", async () => {
  const alice = await (await fetch(`${base}/orders`, { headers: as("alice-token") })).json();
  const bob = await (await fetch(`${base}/orders`, { headers: as("bob-token") })).json();
  assert.equal(alice.length, 2);
  assert.equal(bob.length, 1);
});

test("/products lists products with stock", async () => {
  const products = await (await fetch(`${base}/products`, { headers: as("alice-token") })).json();
  assert.equal(products.length, 3);
  assert.equal(products.find((p: { name: string }) => p.name === "Limited sneaker").stock, 5);
});

test("payments client records every call; the same idempotency key is charged once", async () => {
  const first = await payments.charge({ amountCents: 500, idempotencyKey: "k1" });
  const again = await payments.charge({ amountCents: 500, idempotencyKey: "k1" });
  await payments.refund({ paymentId: first.paymentId, amountCents: 500 });
  assert.equal(again.paymentId, first.paymentId);
  const { rows } = await pool.query("select kind, count(*)::int as n from payment_calls where created_at > now() - interval '1 minute' group by kind order by kind");
  assert.deepEqual(rows, [{ kind: "charge", n: 1 }, { kind: "refund", n: 1 }]);
});
