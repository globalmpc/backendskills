# Bench

**Tasks** (in [`tasks/`](tasks), each with its prompt, hidden check and naive/safe reference solutions):

| Area | Tasks |
| --- | --- |
| Access control | `get-order`, `update-profile`, `login-rate-limit` |
| Money and concurrency | `checkout`, `transfer`, `refund`, `payment-webhook` |
| Queries | `orders-pagination`, `orders-with-items` |
| Schema changes | `orders-index`, `rename-column`, `orders-check-constraint` |
| Team conventions | `product-discount`, `product-reviews`, `wallet-adjustments` |

A run fails when any hidden check fails. A **critical mistake** is a failed check on safety: data
leaks, unlimited password guessing, overselling, double charges, deadlocks, migrations that break a
live database. Missed team conventions (no down migration, endpoint not in the Postman collection) are
counted separately. Runs where the agent itself errors (API error, usage limit, timeout) are left out.

Every raw run is in [`results/`](results): the agent's diff, its output, the check
output, the model, the Claude Code version, and the exact skill files the run used (`skills_hash`).

## Rerun it yourself

You need Docker, Node 24, pnpm, jq and the `claude` CLI.

```sh
cd bench
docker compose up -d                       # Postgres on port 5433
(cd app && pnpm install)
cp .env.example .env                       # your API key, or a LiteLLM/gateway URL and token
./run-all.sh 5                              # every task × with/without × every model, 5 runs each
```

- **One task:** `./run.sh <task> <with|without> <runs> [parallel]`.
- **Fewer models:** `MODELS="claude-sonnet-5-5" ./run-all.sh 5`.
- **Summary table:** `node summarize.mjs results/<date>/runs.jsonl`.

Each run starts from a fresh copy of the sample app (`app`) and its own database. Claude Code
runs with an empty config folder, so no personal settings, skills or memory leak in. The runs cost
real API money: with 5 runs per task, a full run of all 15 tasks is about $95, mostly Opus. The
runner refuses to start without a key in `.env`, so it never uses up your personal Claude plan.

