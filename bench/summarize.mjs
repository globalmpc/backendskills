// Turns a runs.jsonl into the Markdown results table for the README.
//
//   node bench/summarize.mjs bench/results/<date>/runs.jsonl
//
// A run has a critical mistake when any hidden check fails that isn't a team convention (check names
// starting "convention:" are counted separately). Runs where the agent itself errored (API error, usage
// limit, timeout) say nothing about the skills, so they are left out and counted at the bottom.
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node bench/summarize.mjs <runs.jsonl>");
  process.exit(2);
}
const all = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const runs = all.filter((r) => !r.agent_error && r.task !== "_smoke");
const errored = all.length - all.filter((r) => r.task === "_smoke").length - runs.length;

const critical = (r) => !r.pass && (r.failed.length === 0 || r.failed.some((f) => !f.startsWith("convention:")));
const convention = (r) => r.failed.some((f) => f.startsWith("convention:"));

const models = [...new Set(runs.map((r) => r.model))].sort();
const tasks = [...new Set(runs.map((r) => r.task))].sort();
const cell = (rs, bad) => (rs.length ? `${rs.filter(bad).length}/${rs.length}` : "–");
const pick = (task, model, condition) =>
  runs.filter((r) => (!task || r.task === task) && (!model || r.model === model) && r.condition === condition);
const short = (m) => m.replace(/^claude-/, "");

const lines = [];
lines.push("Runs with a critical mistake, without → with the skills (lower is better):", "");
lines.push(`| Task | ${models.map(short).join(" | ")} |`);
lines.push(`| --- | ${models.map(() => "---").join(" | ")} |`);
for (const task of tasks) {
  lines.push(`| \`${task}\` | ${models.map((m) => `${cell(pick(task, m, "without"), critical)} → ${cell(pick(task, m, "with"), critical)}`).join(" | ")} |`);
}
lines.push(`| **All** | ${models.map((m) => `**${cell(pick(null, m, "without"), critical)} → ${cell(pick(null, m, "with"), critical)}**`).join(" | ")} |`);

const total = (condition) => {
  const rs = pick(null, null, condition);
  return { bad: rs.filter(critical).length, n: rs.length };
};
const [w, s] = [total("without"), total("with")];
const pct = (x) => (x.n ? Math.round((100 * x.bad) / x.n) : 0);
lines.push("");
lines.push(`Overall: ${w.bad}/${w.n} runs (${pct(w)}%) had a critical mistake without the skills, ${s.bad}/${s.n} (${pct(s)}%) with them.`);
const conv = [pick(null, null, "without"), pick(null, null, "with")].map((rs) => rs.filter(convention).length);
if (conv[0] + conv[1] > 0) lines.push(`Team-convention misses (not counted above): ${conv[0]} without, ${conv[1]} with.`);
if (errored) lines.push(`Left out: ${errored} runs where the agent errored (API error, usage limit or timeout).`);

const hashes = [...new Set(pick(null, null, "with").map((r) => r.skills_hash).filter(Boolean))];
const versions = [...new Set(runs.map((r) => r.claude_code))];
lines.push(`Skills version: ${hashes.join(", ") || "not recorded"}. ${versions.join(", ")}.`);
console.log(lines.join("\n"));
