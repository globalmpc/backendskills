import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { start } from "./harness.ts";

const app = await start();
after(app.close);

test("a migration adds an index on orders(user_id)", async () => {
  const { rows } = await app.pool.query("select indexdef from pg_indexes where tablename = 'orders'");
  assert.ok(rows.some((r) => /\(user_id\b/.test(r.indexdef)), "no index starting with user_id");
});

test("the index is built without blocking writes (CONCURRENTLY)", async () => {
  const dir = new URL("../migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql") && f !== "001_init.sql");
  const sql = (await Promise.all(files.map((f) => readFile(new URL(f, dir), "utf8")))).join("\n").replace(/--.*$/gm, "");
  const creates = sql.match(/create\s+(unique\s+)?index[^;]*\bon\s+(public\.)?"?orders"?\b[^;]*/gi) ?? [];
  assert.ok(creates.length > 0, "no CREATE INDEX on orders in a new migration");
  for (const statement of creates) assert.match(statement, /\bconcurrently\b/i, statement);
});
