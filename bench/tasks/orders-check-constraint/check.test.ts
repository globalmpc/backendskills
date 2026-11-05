import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { start } from "./harness.ts";

const app = await start();
after(app.close);

const checks = async () =>
  (
    await app.pool.query(
      `select conname, convalidated, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = 'orders'::regclass and contype = 'c'`,
    )
  ).rows.filter((r) => /total_cents/.test(r.def));

test("the database refuses an order with a negative total", async () => {
  await assert.rejects(
    app.pool.query("insert into orders (user_id, status, total_cents) values (1, 'paid', -1)"),
    (err: { code?: string }) => err.code === "23514",
  );
  await app.pool.query("insert into orders (user_id, status, total_cents) values (1, 'paid', 0)");
});

test("the rule covers the existing orders too (the constraint is validated)", async () => {
  const rows = await checks();
  assert.ok(rows.length > 0, "no CHECK constraint on orders.total_cents");
  assert.ok(rows.every((r) => r.convalidated), `not validated: ${rows.map((r) => r.conname).join(", ")}`);
});

test("adding it doesn't block writes to the big table (NOT VALID, then VALIDATE in a separate migration)", async () => {
  const dir = new URL("../migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql") && f !== "001_init.sql").sort();
  const sql = await Promise.all(files.map(async (f) => (await readFile(new URL(f, dir), "utf8")).replace(/--.*$/gm, "")));
  const adds = sql.flatMap((s, i) =>
    (s.match(/alter\s+table[^;]*\borders\b[^;]*add\s+(constraint\s+\S+\s+)?check[^;]*/gi) ?? []).map((statement) => ({ statement, file: i })),
  );
  assert.ok(adds.length > 0, "no ALTER TABLE orders ADD ... CHECK in a new migration");
  for (const { statement, file } of adds) {
    // A plain ADD CHECK scans every row while holding a lock that blocks all writes to orders.
    assert.match(statement, /\bnot\s+valid\b/i, `added without NOT VALID: ${statement.trim()}`);
    // Each migration file runs as one transaction: validating in the same file keeps the ADD's lock for the whole scan.
    assert.doesNotMatch(sql[file], /\bvalidate\s+constraint\b/i, `${files[file]} adds and validates in the same migration`);
  }
});
