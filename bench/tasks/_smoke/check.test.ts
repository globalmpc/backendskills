// Runner smoke task: proves the runner wires agent → hidden check → result. Not part of the results.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { start } from "./harness.ts";

const app = await start();
after(app.close);

test("GET /ping works without a token", async () => {
  const res = await fetch(`${app.base}/ping`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { pong: true });
});
