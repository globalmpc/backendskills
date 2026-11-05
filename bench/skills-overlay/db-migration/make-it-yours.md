## Make it yours

Your team's choices. The rules above stay the same.

- **Where the down migration goes:** plain SQL migrations `migrations/NNN_name.sql` put the reverse in
  `migrations/down/NNN_name.sql` (same file name). Tools with `up()`/`down()` (TypeORM, Knex, …):
  write `down()`.
- **Running migrations:** `pnpm migrate` applies new files in `migrations/` in name order.
- **Big table threshold:** treat any table that can grow past ~100k rows as big.
