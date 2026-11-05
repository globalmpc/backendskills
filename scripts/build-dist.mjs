// Builds the skills for agents that don't read SKILL.md folders, from skills/*/SKILL.md:
//   dist/AGENTS.md          all skills in one file (Codex, and any agent that reads AGENTS.md)
//   dist/cursor/<name>.mdc  one Cursor rule per skill, applied when the agent finds it relevant
//
//   node scripts/build-dist.mjs           write dist/
//   node scripts/build-dist.mjs --check   exit 1 if dist/ is out of date (for CI and tests)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const check = process.argv.includes("--check");

function parse(name) {
  const text = readFileSync(join(root, "skills", name, "SKILL.md"), "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`skills/${name}/SKILL.md: no frontmatter`);
  const description = m[1].match(/^description:\s*(.+)$/m)?.[1].trim();
  if (!description) throw new Error(`skills/${name}/SKILL.md: no description`);
  return { name, description, body: m[2].trim() + "\n" };
}

// One heading level down (# → ##), outside code fences, so each skill nests under its own heading.
function demote(body) {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) fenced = !fenced;
      return !fenced && /^#{1,5} /.test(line) ? "#" + line : line;
    })
    .join("\n");
}

const skills = readdirSync(join(root, "skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, "skills", d.name, "SKILL.md")))
  .map((d) => parse(d.name))
  .sort((a, b) => a.name.localeCompare(b.name));

const header = "<!-- Generated from skills/*/SKILL.md by scripts/build-dist.mjs. Edit the skills, not this file. -->\n";
const files = {
  "AGENTS.md":
    header +
    "\n# Backend rules\n\n" +
    "Follow the section below that matches the change you're making. Each rule has a why and a bad/good example.\n\n" +
    skills.map((s) => `- **${s.name}**: ${s.description}`).join("\n") +
    "\n\n" +
    skills.map((s) => demote(s.body).replace(/^## .*$/m, `## ${s.name}\n\n_${s.description}_`)).join("\n"),
  ...Object.fromEntries(
    skills.map((s) => [
      `cursor/${s.name}.mdc`,
      `---\ndescription: ${s.description}\nglobs:\nalwaysApply: false\n---\n${header}\n${s.body}`,
    ]),
  ),
};

let stale = [];
for (const [path, content] of Object.entries(files)) {
  const full = join(root, "dist", path);
  if (check) {
    if (!existsSync(full) || readFileSync(full, "utf8") !== content) stale.push(`dist/${path}`);
  } else {
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
}
if (check && stale.length) {
  console.error(`out of date (run node scripts/build-dist.mjs): ${stale.join(", ")}`);
  process.exit(1);
}
if (!check) console.log(`wrote ${Object.keys(files).map((p) => `dist/${p}`).join(", ")}`);
