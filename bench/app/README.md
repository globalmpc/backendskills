# shop-api

Small shop backend: users, products, orders, payments.

- TypeScript on Node 24, Express 5, Postgres (`pg`). Run TypeScript directly with `tsx`.
- Auth: `Authorization: Bearer <api_token>`; the current user is `res.locals.user`.
- Errors: `{ "error": { "code", "message" } }` via `sendError` in `src/app.ts`.
- Passwords are stored as scrypt hashes in `users.password_hash`; check one with `verifyPassword` from `src/passwords.ts`.
- Payments go through `src/payments.ts` (the provider client). Never call the provider any other way.
- Schema changes: add a new file in `migrations/` (`002_<name>.sql`, …); `pnpm migrate` applies it.
- Deploys are rolling: migrations run first, then servers switch to the new version a few at a time, so for a
  few minutes the previous version keeps serving requests against the new schema.

## Commands

- `pnpm db:reset`: recreate the database from `migrations/` and `db/seed.sql`
- `pnpm start`: run the API on `PORT` (default 3000)
- `pnpm test`: tests in `test/` (they reset the database)
- `pnpm typecheck`

`DATABASE_URL` defaults to `postgres://postgres:postgres@localhost:5433/shop`. Start Postgres with
`docker compose up -d` in `bench/`.

Seed tokens: `alice-token`, `bob-token`, `admin-token`.
