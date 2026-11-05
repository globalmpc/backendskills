// Copied next to each hidden check after the agent has finished. The runner has already reset the
// database (agent's migrations included), so this only starts the agent's app on a free port.
import type { Server } from "node:http";
import { createApp } from "../src/app.ts";
import { pool } from "../src/db.ts";

export async function start() {
  const server: Server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    base: `http://localhost:${address.port}`,
    pool,
    close: async () => {
      server.close();
      await pool.end();
    },
  };
}

export const as = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

// Simulates a payment provider outage: every call to the provider fails until switched back.
// Done with a trigger on payment_calls so nothing in the app's code hints at it.
export async function providerDown(down: boolean, pool: { query: (sql: string) => Promise<unknown> }) {
  await pool.query(
    down
      ? `create or replace function bench_provider_down() returns trigger language plpgsql as $$
           begin raise exception 'payment provider unavailable'; end $$;
         create or replace trigger bench_provider_down before insert on payment_calls
           for each row execute function bench_provider_down()`
      : "drop trigger if exists bench_provider_down on payment_calls",
  );
}

// Team convention: every new or changed endpoint is in the Postman collection.
export async function inPostman(method: string, path: RegExp) {
  const { readFile } = await import("node:fs/promises");
  const collection = JSON.parse(await readFile(new URL("../postman/shop-api.postman_collection.json", import.meta.url), "utf8"));
  type Item = { item?: Item[]; request?: { method?: string; url?: string | { raw?: string; path?: string[] } } };
  const urls: string[] = [];
  const walk = (items: Item[] = []) => {
    for (const i of items) {
      walk(i.item);
      const url = i.request?.url;
      if (i.request?.method?.toUpperCase() === method) urls.push(typeof url === "string" ? url : (url?.raw ?? "/" + (url?.path ?? []).join("/")));
    }
  };
  walk(collection.item);
  return urls.some((u) => path.test(u));
}

// Team convention: every migration in migrations/ has migrations/down/<same name> that exactly reverses it.
// Applies the down files (newest first) and compares the schema with a database built from 001_init.sql only.
// Leaves the database migrated down, so call it in the last test.
export async function downMigrations(db: { query: (sql: string) => Promise<{ rows: { x: string }[] }> }) {
  const { readdir, readFile } = await import("node:fs/promises");
  const pg = (await import("pg")).default;
  const { databaseUrl } = await import("../src/db.ts");
  const dir = new URL("../migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql") && f !== "001_init.sql").sort();
  const downs = await Promise.all(files.map((f) => readFile(new URL(`down/${f}`, dir), "utf8").catch(() => null)));
  const missing = files.filter((_, i) => downs[i] === null);
  if (missing.length) return { missing, base: [], after: [] };

  const snapshot = `
    select 'column ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') as x
      from information_schema.columns where table_schema = 'public' and table_name <> 'schema_migrations'
    union all select 'constraint ' || conrelid::regclass || ' ' || pg_get_constraintdef(oid) from pg_constraint
      where connamespace = 'public'::regnamespace and conrelid <> 0 and conrelid::regclass::text <> 'schema_migrations'
    union all select 'index ' || indexdef from pg_indexes where schemaname = 'public' and tablename <> 'schema_migrations'
    union all select 'trigger ' || tgrelid::regclass || ' ' || tgname from pg_trigger where not tgisinternal
    union all select 'function ' || proname from pg_proc where pronamespace = 'public'::regnamespace
    union all select 'type ' || typname from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e'
    order by 1`;
  const url = new URL(databaseUrl);
  const baseName = `${url.pathname.slice(1)}_base`;
  const admin = new pg.Client({ connectionString: Object.assign(new URL(databaseUrl), { pathname: "/postgres" }).toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${baseName}"`);
  await admin.query(`create database "${baseName}"`);
  const baseDb = new pg.Client({ connectionString: Object.assign(new URL(databaseUrl), { pathname: `/${baseName}` }).toString() });
  await baseDb.connect();
  await baseDb.query(await readFile(new URL("001_init.sql", dir), "utf8"));
  const base = (await baseDb.query(snapshot)).rows.map((r) => r.x);
  await baseDb.end();
  await admin.query(`drop database "${baseName}"`);
  await admin.end();

  for (const sql of [...downs].reverse()) await db.query(sql as string);
  const after = (await db.query(snapshot)).rows.map((r) => r.x);
  return { missing, base, after };
}
