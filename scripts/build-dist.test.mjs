// dist/ must match skills/: node --test scripts/
import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("dist/ is built from the current skills", () => {
  execFileSync("node", [new URL("build-dist.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" });
});
