// Each hidden check must fail the naive reference (the typical mistake) on exactly the expected
// sub-checks, and pass the safe reference. No real agent runs: node --test bench/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bench = new URL("..", import.meta.url).pathname;

const naiveFails = {
  refund: ["the same refund sent twice at once is refunded once"],
  checkout: [
    "20 buyers at once for 5 sneakers: 5 orders, 5 charges, stock never below 0",
    "a negative quantity is rejected and nothing changes",
    "the same product twice in one order is handled, not a server error",
  ],
  "get-order": ["another user can't read it", "an unknown or malformed id gets a 4xx, not a server error"],
  "update-profile": [
    "users can't edit someone else's profile",
    "users can't make themselves admin",
    "taking an email another user already has gets a 4xx, not a server error",
    "users can't change their own login token",
  ],
  "orders-index": ["the index is built without blocking writes (CONCURRENTLY)"],
  transfer: [
    "10 transfers at once never overdraw or create money",
    "a negative amount is rejected and nothing moves",
    "a transfer to a user who doesn't exist, or of a fractional amount, is rejected and nothing moves",
    "transfers both ways at once all go through (no deadlock)",
  ],
  "orders-with-items": ["the number of queries doesn't grow with the number of orders (no N+1)"],
  "rename-column": ["the previous version still lists orders against the new schema (rolling deploy)"],
  "payment-webhook": [
    "a signed charge.succeeded marks the order paid",
    "a charge.succeeded that arrives after the refund doesn't undo the refund",
  ],
  "orders-pagination": ["orders placed while paging don't cause duplicates or skipped orders"],
  "login-rate-limit": [
    "a wrong password and an unknown email get the same 401",
    "bad input gets a 4xx, not a server error",
    "guessing a password one try at a time gets stopped",
    "50 guesses at once get stopped too",
  ],
  "orders-check-constraint": ["adding it doesn't block writes to the big table (NOT VALID, then VALIDATE in a separate migration)"],
  "product-discount": [
    "convention: the database itself refuses a discount over 100",
    "convention: every migration has a down migration that exactly reverses it",
    "convention: the new endpoint is in the Postman collection",
  ],
  "wallet-adjustments": [
    "convention: recorded adjustments can't be edited or deleted, even directly in the database",
    "convention: every migration has a down migration that exactly reverses it",
    "convention: the new endpoint is in the Postman collection",
  ],
  "product-reviews": [
    "convention: the database itself refuses a rating outside 1-5 and a second review",
    "convention: every migration has a down migration that exactly reverses it",
    "convention: the new endpoints are in the Postman collection",
  ],
};

function run(task, ref) {
  const results = mkdtempSync(join(tmpdir(), "bench-results-"));
  execFileSync(join(bench, "run.sh"), [task, "without", "1"], {
    env: { ...process.env, AGENT_CMD: join(bench, "test/fake-agents/reference.sh"), REF: ref, RESULTS_DIR: results },
    stdio: "pipe",
  });
  return JSON.parse(readFileSync(join(results, "runs.jsonl"), "utf8"));
}

for (const [task, expected] of Object.entries(naiveFails)) {
  test(`${task}: naive fails on the mistake, safe passes`, () => {
    const naive = run(task, "naive");
    assert.equal(naive.pass, false);
    assert.deepEqual(naive.failed, [...expected].sort());
    const safe = run(task, "safe");
    assert.deepEqual(safe.failed, []);
    assert.equal(safe.pass, true);
  });
}
