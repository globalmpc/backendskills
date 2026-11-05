// Runner test with fake agents (no real agent runs): node --test bench/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bench = new URL("..", import.meta.url).pathname;

function run(agent, condition = "without", env = {}) {
  const results = mkdtempSync(join(tmpdir(), "bench-results-"));
  execFileSync(join(bench, "run.sh"), ["_smoke", condition, "2", "2"], {
    env: { ...process.env, AGENT_CMD: join(bench, "test/fake-agents", agent), RESULTS_DIR: results, SKILLS_DIR: join(bench, "test/fixture-skills"), ...env },
    stdio: "pipe",
  });
  const lines = readFileSync(join(results, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { results, lines };
}

test("a correct change passes the hidden check, and its diff is saved", () => {
  const { results, lines } = run("good.sh");
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.equal(line.task, "_smoke");
    assert.equal(line.condition, "without");
    assert.equal(line.pass, true);
    assert.match(readFileSync(join(results, line.run_id, "diff.patch"), "utf8"), /\/ping/);
  }
});

test("no change fails the hidden check", () => {
  const { lines } = run("noop.sh");
  assert.deepEqual(lines.map((l) => l.pass), [false, false]);
});

test("with-skills runs get the skills in .claude/skills, and they are not in the diff", () => {
  const { results, lines } = run("good.sh", "with");
  assert.equal(lines[0].condition, "with");
  assert.equal(lines[0].pass, true);
  assert.doesNotMatch(readFileSync(join(results, lines[0].run_id, "diff.patch"), "utf8"), /SKILL\.md/);
  // Each skill keeps its own folder (two fixture skills, so one can't overwrite the other).
  assert.equal(readFileSync(join(results, lines[0].run_id, "skills.txt"), "utf8"), "demo\nother\n");
  // The exact skill version is recorded: a copy of the skills, and the same hash on every run.
  assert.ok(existsSync(join(results, lines[0].run_id, "skills/demo/SKILL.md")));
  assert.match(lines[0].skills_hash, /^[0-9a-f]{12}$/);
  assert.equal(lines[1].skills_hash, lines[0].skills_hash);
});

test("without-skills runs have no skills hash", () => {
  const { lines } = run("good.sh");
  assert.equal(lines[0].skills_hash, null);
});

test("the overlay replaces a skill's Make it yours section, and the hash covers it", () => {
  const plain = run("good.sh", "with", { OVERLAY_DIR: join(bench, "test/no-overlay") });
  const team = run("good.sh", "with", { OVERLAY_DIR: join(bench, "test/fixture-overlay") });
  const seen = readFileSync(join(team.results, team.lines[0].run_id, "skills/demo/SKILL.md"), "utf8");
  assert.match(seen, /Nothing here\.\n\n## Make it yours\n\n- \*\*Thing:\*\* the team value\.\n$/);
  assert.doesNotMatch(seen, /not set/);
  assert.notEqual(team.lines[0].skills_hash, plain.lines[0].skills_hash);
});

function runAll(agent, results, runs = "2") {
  try {
    execFileSync(join(bench, "run-all.sh"), [runs, "2"], {
      env: { ...process.env, AGENT_CMD: join(bench, "test/fake-agents", agent), RESULTS_DIR: results, MODELS: "m1", TASKS: "_smoke",
        SKILLS_DIR: join(bench, "test/fixture-skills") },
      stdio: "pipe",
    });
    return 0;
  } catch (err) {
    return err.status;
  }
}
const lines = (results) => readFileSync(join(results, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("run-all resumes: finished runs are kept, only the missing ones run", () => {
  const results = mkdtempSync(join(tmpdir(), "bench-results-"));
  assert.equal(runAll("good.sh", results), 0);
  assert.equal(lines(results).length, 4); // 2 without + 2 with
  assert.ok(lines(results).every((l) => l.model === "m1" && l.fake_agent === "good.sh"));
  assert.equal(runAll("good.sh", results), 0);
  assert.equal(lines(results).length, 4);
  assert.equal(runAll("good.sh", results, "3"), 0);
  assert.equal(lines(results).length, 6);
});

test("run-all stops at the usage limit and carries on when run again", () => {
  const results = mkdtempSync(join(tmpdir(), "bench-results-"));
  assert.equal(runAll("limit.sh", results), 3);
  assert.ok(existsSync(join(results, "STOP")));
  assert.ok(lines(results).length <= 2, "kept starting runs after the limit");
  assert.equal(runAll("good.sh", results), 0);
  assert.equal(lines(results).filter((l) => !l.agent_error).length, 4);
});
