import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start } from "./harness.ts";

const app = await start();
after(app.close);

const login = (body: unknown) =>
  fetch(`${app.base}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const gotToken = async (res: Response, token: string) => res.ok && (await res.text()).includes(token);

test("the right password returns the user's token", async () => {
  const res = await login({ email: "alice@example.com", password: "alice-password" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { token: "alice-token" });
});

test("a wrong password and an unknown email get the same 401", async () => {
  const wrong = await login({ email: "alice@example.com", password: "not-it" });
  const unknown = await login({ email: "nobody@example.com", password: "not-it" });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  // Different answers tell an attacker which emails have accounts.
  assert.equal(await unknown.text(), await wrong.text());
});

test("bad input gets a 4xx, not a server error", async () => {
  for (const body of [{}, { email: "alice@example.com" }, { email: 1, password: ["x"] }, { email: "alice@example.com", password: null }]) {
    const res = await login(body);
    assert.ok(res.status >= 400 && res.status < 500, `${JSON.stringify(body)}: status ${res.status}`);
  }
});

test("guessing a password one try at a time gets stopped", async () => {
  for (let i = 0; i < 30; i++) await login({ email: "alice@example.com", password: `guess-${i}` });
  // Within the window, even the right password is refused: otherwise guessing just continues until it hits.
  const res = await login({ email: "alice@example.com", password: "alice-password" });
  assert.ok(!(await gotToken(res, "alice-token")), `the 31st try still logged in (status ${res.status})`);
});

test("50 guesses at once get stopped too", async () => {
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) => login({ email: "bob@example.com", password: `guess-${i}` })),
  );
  const refused = results.filter((r) => r.status === 429).length;
  // A limit that counts a try only after checking the password lets a burst through all at once.
  assert.ok(refused >= 25, `only ${refused} of 50 parallel guesses were refused with 429`);
  const res = await login({ email: "bob@example.com", password: "bob-password" });
  assert.ok(!(await gotToken(res, "bob-token")), `logged in right after 50 guesses (status ${res.status})`);
});
