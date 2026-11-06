<!-- Generated from skills/*/SKILL.md by scripts/build-dist.mjs. Edit the skills, not this file. -->

# Backend rules

Follow the section below that matches the change you're making. Each rule has a why and a bad/good example.

- **api-endpoint**: Rules for HTTP API endpoints. Use when adding or changing any endpoint (route, request or response shape, status codes), especially login and ones that read or change other users' data.
- **data-integrity**: Rules for code that writes to the database where two requests, retries or jobs can run at once. Use for anything that changes money, stock, balances, counters or statuses, creates rows that must be unique, or calls a payment provider, email or other outside service. Applies in endpoints, webhooks and background jobs.
- **db-migration**: Rules for database schema changes. Use for any new table, column, index, constraint, enum or trigger, any data backfill, and any migration file.

## api-endpoint

_Rules for HTTP API endpoints. Use when adding or changing any endpoint (route, request or response shape, status codes), especially login and ones that read or change other users' data._

Examples are TypeScript with `pg`. The rules apply to any stack.

Anything that changes money, stock or balances, or calls a payment provider or email: also follow the
`data-integrity` skill (transactions, locks, idempotency).

### 1. Check who may call it, not just that they're logged in

Why: a logged-in user who changes the id in the URL reads or edits someone else's data (IDOR).

```ts
// Bad: any logged-in user can read any invoice
const { rows } = await pool.query("select * from invoices where id = $1", [id]);

// Good: scope the query to the caller; someone else's invoice looks the same as a missing one
const { rows } = await pool.query(
  "select id, number, total_cents, status from invoices where id = $1 and account_id = $2", [id, user.accountId]);
if (rows.length === 0) return sendError(res, 404, "not_found", "Invoice not found");
```

Admins or other roles get access through an explicit role check, never by skipping the filter.

Webhooks have no logged-in user, so the signature is the check: verify it on the raw request body with a
constant-time compare (`crypto.timingSafeEqual`, after checking both are the same length, or it throws)
before you parse or trust anything in it. Unsigned or wrongly signed: 401, and nothing changes.

### 2. Bad input is a 4xx, never a 500

Why: a 500 on bad input hides real errors in the noise. Bad values that slip through (negative amounts,
fractions) corrupt data.

- Validate the body and path params at the edge: types, integers where money and quantities are counted,
  ranges (`quantity >= 1`, `amountCents > 0`), required fields, ids that aren't numbers.
- Handle what a request can legally contain but your code doesn't expect, like the same item listed
  twice. Merge the duplicates or reject them with a 400, but don't let the request crash into a 500.
- Map expected database errors: unique violation (`23505`) → 409, foreign key violation (`23503`) → 404 or 400.

### 3. Limit how often anyone can try: login, codes, anything that sends or costs

Why: without a limit, a script guesses passwords or one-time codes until one works, or sends thousands of
emails and SMS on your bill.

```ts
// Bad: counts a failure only after checking it; 50 parallel guesses all see "0 failures so far"
if (failures.get(email) >= 10) return sendError(res, 429, ...);
if (!(await verifyPassword(password, hash))) failures.set(email, failures.get(email) + 1);

// Good: count the try first, in one atomic statement, in storage every server shares.
// The count starts over 15 minutes after the first try, and a successful login clears it.
const key = `login:${email.toLowerCase()}`;
const { rows: [c] } = await pool.query(
  `insert into attempts (key, n, since) values ($1, 1, now())
   on conflict (key) do update set
     n     = case when attempts.since < now() - interval '15 minutes' then 1 else attempts.n + 1 end,
     since = case when attempts.since < now() - interval '15 minutes' then now() else attempts.since end
   returning n`, [key]);
if (c.n > 10) return sendError(res, 429, "too_many_attempts", "Try again later");
if (!(await verifyPassword(password, hash))) return sendError(res, 401, "invalid_credentials", "Wrong email or password");
await pool.query("delete from attempts where key = $1", [key]);
```

- Key the limit on the account (and on the IP, with a looser limit).
- Once the limit is hit, refuse even the right password until the window ends.
- Keep the window short and clear it on success. A counter that never resets locks real users out for
  good, and lets anyone who knows an email lock that account.
- An unknown account and a wrong password get the same response, so nobody can find out which accounts exist.
- In-memory counters only work with one server. Use the database or Redis.

### 4. Take only the fields you allow, send back only the fields you mean to

Why: a request body copied straight into an update lets a user set `role`, `account_id` or their own
token. A `select *` sent back leaks password hashes and tokens.

```ts
// Bad: every key in the body becomes a column; the response is the whole row
await updateUser(user.id, req.body);
res.json((await pool.query("select * from users where id = $1", [user.id])).rows[0]);

// Good: pick the fields the caller may change by name, and name the columns you return
const { name, email } = req.body; // validated as in rule 2
const { rows: [u] } = await pool.query(
  `update users set name = coalesce($2, name), email = coalesce($3, email)
   where id = $1 returning id, name, email`, [user.id, name, email]);
res.json(u);
```

Lists get a maximum page size (say 100), whatever `limit` the client sends.

### 5. Use what the repo already has, and test it

Why: a second auth check, error format or DB helper drifts from the first, and reviewers have to catch it.

- Use the repo's auth, error format and database access. Errors never return a bare string or a stack trace.
- Add tests with the repo's test setup: the happy path, someone else's resource, and bad input.

### Make it yours

Your team's choices. A line that says "not set" means: follow what the repo already does.

- **API docs or collection:** not set.
- **Error format:** not set.
- **Someone else's resource:** 404, so nobody learns it exists.

## data-integrity

_Rules for code that writes to the database where two requests, retries or jobs can run at once. Use for anything that changes money, stock, balances, counters or statuses, creates rows that must be unique, or calls a payment provider, email or other outside service. Applies in endpoints, webhooks and background jobs._

Examples are TypeScript with `pg`. The rules apply to any stack. Assume every write can run twice at the
same time: two clicks, a client retry, two servers picking up the same job.

### 1. Read-then-write is one conditional statement, or one transaction with a lock

Why: two requests at once both read "1 seat left", both book it. Counts go negative and money gets created.

```ts
// Bad: check and write are separate; a concurrent request slips in between
const { rows: [e] } = await pool.query("select seats_left from events where id = $1", [id]);
if (e.seats_left < seats) return sendError(res, 409, "sold_out", "Not enough seats");
await pool.query("update events set seats_left = seats_left - $1 where id = $2", [seats, id]);

// Good: the check is part of the write
const { rowCount } = await client.query(
  "update events set seats_left = seats_left - $1 where id = $2 and seats_left >= $1", [seats, id]);
if (rowCount === 0) throw new HttpError(409, "sold_out", "Not enough seats");
```

When several rows must change together (every line of a booking, both accounts in a payment), do it in one
transaction. Put a database CHECK behind it (`seats_left >= 0`, `balance_cents >= 0`) as the last line of
defence.

### 2. Uniqueness is a UNIQUE constraint, not a check before the insert

Why: two requests both find "no row yet" and both insert. You get two accounts per email or two reviews
per user.

```ts
// Bad: a concurrent request inserts between the select and the insert
const { rows } = await pool.query("select 1 from memberships where team_id = $1 and user_id = $2", [team, user]);
if (rows.length) return sendError(res, 409, "already_member", "Already a member");
await pool.query("insert into memberships (team_id, user_id) values ($1, $2)", [team, user]);

// Good: unique (team_id, user_id) in the schema; the database decides who was first
const { rowCount } = await pool.query(
  "insert into memberships (team_id, user_id) values ($1, $2) on conflict do nothing", [team, user]);
if (rowCount === 0) return sendError(res, 409, "already_member", "Already a member");
```

### 3. Lock rows in a fixed order

Why: request A locks row 1 then row 2 while request B locks 2 then 1, and Postgres kills one of them with a
deadlock. Two payments between the same two accounts, in opposite directions, are enough to cause it.

```ts
// Bad: lock order follows the request (payer first, lines in the order given)
for (const id of [payerId, payeeId]) await client.query("select ... where id = $1 for update", [id]);

// Good: always lowest id first, in one statement
await client.query("select id, balance_cents from accounts where id = any($1) order by id for update",
  [[payerId, payeeId]]);
```

### 4. Never call an outside service inside a transaction

Why: the payment provider, HTTP, email all take tens of milliseconds to seconds. During that wait the
transaction holds its row locks and a pool connection. Under load every connection is held and the app
hangs. This is worse still if the client library uses the same pool.

```ts
// Bad: charge while the seat rows are locked
await client.query("begin");
await holdSeats(client, seats);
const { paymentId } = await payments.charge({ amountCents: total });
await client.query("commit");

// Good: short write, call, short write
const bookingId = await tx(async (c) => { await holdSeats(c, seats); return createBooking(c, "pending"); });
let paymentId: string;
try {
  ({ paymentId } = await payments.charge({ amountCents: total, idempotencyKey: `booking-${bookingId}` }));
} catch (err) {
  // No confirmed charge: give the seats back. If it went through after all (a timeout), the provider's
  // charge.succeeded webhook finds a failed booking and refunds it (rule 5).
  await tx(async (c) => { await releaseSeats(c, seats); await markBooking(c, bookingId, "failed"); });
  return sendError(res, 502, "payment_failed", "Payment failed");
}
// Outside the try: the customer has paid, so a database error here must never release the seats.
// The booking stays pending and the webhook marks it paid.
await pool.query("update bookings set status = 'paid', payment_id = $2 where id = $1 and status = 'pending'",
  [bookingId, paymentId]);
```

### 5. Anything that charges, refunds or sends gets an idempotency key

Why: a retry (by the client, a proxy, or your own code after a timeout) charges the customer twice.

- Pass a key derived from your own record (`booking-<id>`, `refund-<bookingId>`), not a random one per attempt.
- Change state only from the state you expect (`update bookings set status = 'cancelled' where id = $1 and
  status = 'paid'`), and act only if a row changed. Two cancellations at once must not both refund.
- Events can arrive twice or out of order (webhooks, queue messages). Handling one must not move a record
  back to an earlier state. A `charge.succeeded` for a booking you already marked failed means a refund,
  not a revived booking.

### 6. Test it with requests at once

Why: every bug above passes a test that sends one request at a time.

Send the same write 10–20 times in parallel (`Promise.all`) and check the end state: counts never below 0,
money neither created nor lost, one charge per order, no deadlock errors.

### Make it yours

Your team's choices. Until you change a line, it's the default.

- **Transactions:** `pool.connect()` + `begin`/`commit`/`rollback`, or the repo's transaction helper if it has one.
- **Payment and email clients:** take an `idempotencyKey` argument; check the client in the repo for its name.

## db-migration

_Rules for database schema changes. Use for any new table, column, index, constraint, enum or trigger, any data backfill, and any migration file._

Examples are Postgres. Assume the table is large and the app is live: deploys are rolling, so the previous
version of the app keeps running against the new schema for a few minutes.

### 1. Expand, then contract: never rename or drop in the same deploy

Why: the version still running during the deploy queries the old name and fails until the deploy finishes.

```sql
-- Bad: the running version breaks the moment this migration lands
alter table customers rename column name to full_name;

-- Good, deploy 1: add the new column and fill it. Keep it in sync until every server runs the new code
-- (write both in the app, or use a trigger).
alter table customers add column full_name text;
update customers set full_name = name where full_name is null;  -- batch it on big tables (rule 4)
-- Deploy 2, once nothing reads the old column: drop name.
```

The same applies to dropping a table or column, and to narrowing a type. Adding is safe. Removing waits
for a later deploy.

### 2. Indexes on big tables are built concurrently

Why: a plain `create index` blocks every write to the table until it finishes, which can take minutes.

```sql
-- Bad
create index invoices_customer_id_idx on invoices (customer_id);

-- Good: its own migration file, nothing else in it
create index concurrently invoices_customer_id_idx on invoices (customer_id);
```

`concurrently` can't run inside a transaction. Many runners wrap each migration, or a multi-statement
file, in one transaction, so keep the statement alone in its file (or use the runner's no-transaction
option). The same goes for `drop index concurrently`.

If the build fails (a deadlock, a duplicate in a unique index), Postgres keeps a broken INVALID index
under that name. Don't add `if not exists`: the retry would skip it and leave it broken. Drop it with
`drop index concurrently` and build again. Find leftovers with
`select indexrelid::regclass from pg_index where not indisvalid`.

### 3. Don't hold a lock while waiting for one

Why: `alter table` waits behind a long-running query, and every other query on the table queues behind
the `alter table`. A one-millisecond change takes the API down.

```sql
-- Good: give up quickly and retry the deploy rather than block the table
set local lock_timeout = '5s';  -- "local": only until this migration's transaction ends
alter table invoices add column note text;
```

A plain `set` stays on the connection after the migration, so the next query that reuses it gives up
after 5 seconds too. If your runner doesn't run the migration in a transaction, `set local` does nothing:
use `set`, then `reset lock_timeout` at the end.

- New column that is nullable, or has a constant default (Postgres 11+; older versions rewrite the whole
  table for a default): fine. NOT NULL without a default on a table with rows: fails.
- New foreign key or CHECK on a big table: add it `not valid`, then `validate constraint` in a later
  migration. Validation doesn't block writes.

### 4. Backfill in batches

Why: one `update` over millions of rows holds row locks for its whole run and bloats the table.

```sql
-- Bad: one statement, every row locked until it ends
update customers set full_name = name;

-- Good: walk the table by id in small batches (a script or job, outside the schema migration).
-- $1 starts at 0, then is the highest id the previous batch returned. Stop when a batch returns no rows.
update customers set full_name = name
where id in (select id from customers where id > $1 order by id limit 5000)
returning id;
```

Move forward by id, not by "rows still empty". A row whose source is NULL stays empty after the update,
so `where full_name is null` picks it again forever.

### 5. Rules live in the database

Why: app validation gives nice error messages, but only the database guarantees them. That covers
another service, a script, or a race between two requests.

Use NOT NULL, foreign keys, UNIQUE (this is what stops duplicate rows when two requests arrive at once), and
CHECK for ranges and allowed values (`check (seats between 1 and 10)`, `check (balance_cents >= 0)`).

Rows that must never change once written (audit logs, ledgers, history) get a trigger that rejects
UPDATE, DELETE and TRUNCATE:

```sql
create function audit_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
-- "for each statement": TRUNCATE never fires row triggers
create trigger audit_log_append_only before update or delete or truncate on audit_log
  for each statement execute function audit_log_append_only();
```

### 6. Every migration can be undone, and is checked

Why: a migration that can't be rolled back turns a bad deploy into an outage.

- Write the reverse next to it, undoing exactly what the migration did: drop what you created (tables,
  columns, indexes, constraints, triggers, functions, types) in reverse order.
- Never edit a migration that has been merged: other databases already ran it. Write a new one.
- Before calling it done, run the round trip: migrate up, run the down, migrate up again.

### Make it yours

Your team's choices. A line that says "not set" means: follow what the repo already does.

- **Where the down migration goes:** not set. Tools with `up()`/`down()` (TypeORM, Knex, …): write `down()`.
  Plain SQL files: put it where the repo keeps its down migrations, or ask.
- **Running migrations:** not set; use the repo's script.
- **Big table threshold:** treat any table that can grow past ~100k rows as big.
