import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start, as } from "./harness.ts";

const app = await start();
after(app.close);
const user = async (id: number) => (await app.pool.query("select name, role from users where id = $1", [id])).rows[0];
const patch = (token: string, id: number, body: object) =>
  fetch(`${app.base}/users/${id}`, { method: "PATCH", headers: as(token), body: JSON.stringify(body) });

test("users can update their own name", async () => {
  const res = await patch("alice-token", 1, { name: "Alice C" });
  assert.ok(res.ok, `status ${res.status}`);
  assert.equal((await user(1)).name, "Alice C");
});

test("users can't edit someone else's profile", async () => {
  const res = await patch("bob-token", 1, { name: "Hacked" });
  assert.ok(res.status === 403 || res.status === 404, `status ${res.status}`);
  assert.equal((await user(1)).name, "Alice C");
});

test("users can't make themselves admin", async () => {
  await patch("alice-token", 1, { name: "Alice D", role: "admin" });
  assert.equal((await user(1)).role, "user");
});

test("taking an email another user already has gets a 4xx, not a server error", async () => {
  const res = await patch("alice-token", 1, { email: "bob@example.com" });
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
  const { rows } = await app.pool.query("select email from users where id = 1");
  assert.equal(rows[0].email, "alice@example.com");
});

test("users can't change their own login token", async () => {
  await patch("alice-token", 1, { name: "Alice E", api_token: "chosen-token" });
  const res = await fetch(`${app.base}/me`, { headers: as("alice-token") });
  assert.equal(res.status, 200, "old token stopped working");
});
