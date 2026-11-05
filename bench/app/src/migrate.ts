// `pnpm migrate` applies new files in migrations/ in name order, each once.
// `pnpm db:reset` recreates the database, applies all migrations and loads db/seed.sql.
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { databaseUrl, pool } from "./db.ts";

const root = new URL("..", import.meta.url);

export async function migrate() {
  await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await pool.query("select name from schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(new URL("migrations/", root))).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => !done.has(f))) {
    await pool.query(await readFile(new URL(`migrations/${file}`, root), "utf8"));
    await pool.query("insert into schema_migrations (name) values ($1)", [file]);
    console.log(`applied ${file}`);
  }
}

export async function resetDatabase() {
  const url = new URL(databaseUrl);
  const name = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();
  await migrate();
  await pool.query(await readFile(new URL("db/seed.sql", root), "utf8"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await (process.argv.includes("--reset") ? resetDatabase() : migrate());
  await pool.end();
}
