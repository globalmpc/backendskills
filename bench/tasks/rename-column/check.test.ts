import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import type { Server } from "node:http";
import { start, as } from "./harness.ts";

const app = await start();

// The previous version of the app (the commit before the agent's change), still running during a rolling deploy.
const root = new URL("..", import.meta.url).pathname;
execSync("rm -rf hidden-check/old && mkdir -p hidden-check/old && git archive HEAD src | tar -x -C hidden-check/old", { cwd: root });
const oldApp = await import(new URL("./old/src/app.ts", import.meta.url).href);
const oldDb = await import(new URL("./old/src/db.ts", import.meta.url).href);
const oldServer: Server = oldApp.createApp().listen(0);
await new Promise((resolve) => oldServer.once("listening", resolve));
const oldBase = `http://localhost:${(oldServer.address() as { port: number }).port}`;
after(async () => {
  oldServer.close();
  await oldDb.pool.end();
  await app.close();
});

test("orders now have amount_cents with the existing totals", async () => {
  const { rows } = await app.pool.query("select amount_cents from orders where id = 2");
  assert.equal(rows[0].amount_cents, 15000);
});

test("the new version lists orders", async () => {
  const res = await fetch(`${app.base}/orders`, { headers: as("alice-token") });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /15000/);
});

test("the previous version still lists orders against the new schema (rolling deploy)", async () => {
  const res = await fetch(`${oldBase}/orders`, { headers: as("alice-token") });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /15000/);
});
