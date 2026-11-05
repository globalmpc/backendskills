#!/usr/bin/env bash
# Before/after test runner.
#
#   bench/run.sh <task> <with|without> <runs> [parallel=1]
#
# Each run: fresh copy of bench/app in a temp folder and its own database → (with: skills copied into
# .claude/skills) → Claude Code does the task from tasks/<task>/prompt.md → the agent's diff is saved →
# the hidden check (tasks/<task>/check.test.ts, never visible to the agent) runs on a freshly reset
# database → one JSON line in results/runs.jsonl, plus results/<run_id>/ with diff, agent output, check output.
#
# Claude Code runs with a clean config folder (bench/.claude-clean), so no personal CLAUDE.md, skills,
# plugins or memory leak in. Auth comes from bench/.env: ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or a LiteLLM
# (or other gateway) proxy with ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN. See bench/.env.example.
# The agent edits only its temp folder and runs only the commands in ALLOWED_TOOLS.
set -euo pipefail

BENCH="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="${RESULTS_DIR:-$BENCH/results}"
SKILLS_DIR="${SKILLS_DIR:-$BENCH/../skills}"
OVERLAY_DIR="${OVERLAY_DIR:-$BENCH/skills-overlay}"
MODEL="${MODEL:-claude-opus-5-5}"
PG="${PG:-postgres://postgres:postgres@localhost:5433}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-20m}"
# The agent may edit files in its temp folder (acceptEdits) and run only these commands; anything else is denied.
ALLOWED_TOOLS="Read,Edit,Write,Glob,Grep,Bash(pnpm *),Bash(node *),Bash(npx tsx *),Bash(ls *),Bash(cat *),Bash(git status*),Bash(git diff*),Bash(curl http://localhost*),Bash(mkdir *),Bash(psql *),Bash(pg_isready*)"

one() {
  local task=$1 condition=$2 n=$3
  # A run hit the usage limit: start no more runs (run-all.sh resumes after the reset).
  [[ -e $RESULTS_DIR/STOP ]] && return 0
  local run_id="${task}-${condition}-${n}-$(date +%Y%m%d%H%M%S)-$RANDOM"
  local skills_hash=""
  local db="run_$(echo "$run_id" | tr -c 'a-z0-9\n' '_' | tail -c 50)"
  local work; work="$(mktemp -d "${TMPDIR:-/tmp}/bench-XXXXXX")/app"
  local out="$RESULTS_DIR/$run_id"
  mkdir -p "$out"
  export DATABASE_URL="$PG/$db"

  cp -R "$BENCH/app" "$work"
  if [[ $condition == with ]]; then
    mkdir -p "$work/.claude/skills"
    # One folder per skill. No trailing slash on the source: BSD cp would copy the folder's contents instead.
    for skill in "$SKILLS_DIR"/*/; do cp -R "${skill%/}" "$work/.claude/skills/"; done
    # The sample app's team conventions replace each skill's "## Make it yours" section (see skills-overlay/README.md).
    for overlay in "$OVERLAY_DIR"/*/make-it-yours.md; do
      [[ -e $overlay ]] || continue
      local target="$work/.claude/skills/$(basename "$(dirname "$overlay")")/SKILL.md"
      [[ -f $target ]] || continue
      OVERLAY="$(cat "$overlay")" perl -0pi -e 's/^## Make it yours\n.*\z/$ENV{OVERLAY}\n/ms or die "no Make it yours section\n"' "$target"
    done
    (cd "$work/.claude/skills" && ls) > "$out/skills.txt"
    # Exactly what the agent saw: a copy of the skills, and a hash of them (paths + contents) for runs.jsonl,
    # so results stay tied to a skill version even when the skills were edited but not committed.
    cp -R "$work/.claude/skills" "$out/skills"
    skills_hash=$(cd "$work/.claude/skills" && find . -type f ! -name .DS_Store | LC_ALL=C sort |
      while IFS= read -r f; do printf '%s\n' "$f"; shasum -a 256 < "$f"; done | shasum -a 256 | cut -c1-12)
  fi
  (cd "$work" && echo node_modules > .gitignore && git init -q && git add -A && git -c user.name=bench -c user.email=bench@localhost commit -qm base)
  (cd "$work" && pnpm -s db:reset >/dev/null)

  local started; started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [[ -n ${AGENT_CMD:-} ]]; then
    (cd "$work" && "$AGENT_CMD" "$BENCH/tasks/$task/prompt.md") > "$out/agent.json" 2>&1 || true
  else
    (cd "$work" && env -u CLAUDECODE CLAUDE_CONFIG_DIR="$BENCH/.claude-clean" \
      timeout "$AGENT_TIMEOUT" claude -p "$(cat "$BENCH/tasks/$task/prompt.md")" \
        --model "$MODEL" --permission-mode acceptEdits --allowedTools "$ALLOWED_TOOLS" --setting-sources project,local \
        --no-session-persistence --output-format json) > "$out/agent.json" 2>&1 || true
  fi
  if jq -e '.is_error and ((.result // "") | test("hit your .*limit|usage limit|rate limit"; "i"))' "$out/agent.json" >/dev/null 2>&1; then
    jq -r .result "$out/agent.json" > "$RESULTS_DIR/STOP"
  fi

  (cd "$work" && git add -A && git diff --cached HEAD -- . ':!.claude' > "$out/diff.patch")

  mkdir -p "$work/hidden-check"
  cp "$BENCH/checks/harness.ts" "$BENCH/tasks/$task/check.test.ts" "$work/hidden-check/"
  local pass=false
  if (cd "$work" && pnpm -s db:reset >/dev/null 2>&1 && env -u NODE_TEST_CONTEXT timeout 5m node --import tsx --test --test-timeout=60000 hidden-check/check.test.ts) > "$out/check.txt" 2>&1; then
    pass=true
  fi

  local failed
  failed=$({ grep -E "^✖ " "$out/check.txt" || true; } | { grep -v -e "hidden-check/" -e "^✖ failing tests:" || true; } | sed -E "s/ \([0-9.]+m?s\)$//; s/^✖ //" | sort -u | jq -Rsc 'split("\n") | map(select(length > 0))')

  psql "$PG/postgres" -qc "drop database if exists \"$db\" with (force)" >/dev/null 2>&1 || true
  rm -rf "$(dirname "$work")"

  jq -nc --arg run_id "$run_id" --arg task "$task" --arg condition "$condition" --argjson run "$n" \
    --argjson pass $pass --argjson failed "$failed" --arg model "$MODEL" --arg fake "${AGENT_CMD:+$(basename "${AGENT_CMD:-}")}" \
    --arg claude "$(claude --version 2>/dev/null | head -1)" --arg started "$started" --arg skills_hash "$skills_hash" \
    --slurpfile agent <(jq -c '{total_cost_usd, num_turns, duration_ms, agent_error: (.is_error // false)}' "$out/agent.json" 2>/dev/null || echo '{}') \
    '{run_id: $run_id, task: $task, condition: $condition, run: $run, pass: $pass, failed: $failed, model: $model,
      claude_code: $claude, started_at: $started,
      skills_hash: (if $skills_hash == "" then null else $skills_hash end)}
      + (if $fake == "" then {} else {fake_agent: $fake} end) + ($agent[0] // {})' >> "$RESULTS_DIR/runs.jsonl"
  echo "$run_id pass=$pass"
}

if [[ ${1:-} == --one ]]; then shift; one "$@"; exit; fi

task=${1:?task}; condition=${2:?with|without}; runs=${3:?runs}; parallel=${4:-1}
[[ $condition == with || $condition == without ]] || { echo "condition must be with or without" >&2; exit 2; }
[[ -f $BENCH/tasks/$task/prompt.md && -f $BENCH/tasks/$task/check.test.ts ]] || { echo "no task $task" >&2; exit 2; }
if [[ $condition == with ]] && ! ls "$SKILLS_DIR"/*/SKILL.md >/dev/null 2>&1; then echo "no skills in $SKILLS_DIR" >&2; exit 2; fi
if [[ -z ${AGENT_CMD:-} ]]; then
  if [[ ${ALLOW_PERSONAL_LOGIN:-} == 1 ]]; then
    # Explicit opt-in: use the claude login in the macOS keychain (your personal plan), not bench/.env.
    # A full run is far more than one 5-hour window allows: runs stop at the limit, and run-all.sh resumes.
    unset ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
  else
    [[ -f $BENCH/.env ]] && { set -a; source "$BENCH/.env"; set +a; }
    # Without its own key, claude falls back to the login in the macOS keychain: your personal plan, whose
    # usage limit the runs would then use up.
    if [[ -z ${ANTHROPIC_API_KEY:-} && -z ${CLAUDE_CODE_OAUTH_TOKEN:-} && -z ${ANTHROPIC_AUTH_TOKEN:-} ]]; then
      echo "no ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_AUTH_TOKEN (see bench/.env.example), and ALLOW_PERSONAL_LOGIN isn't 1; refusing to use your personal login" >&2; exit 2
    fi
  fi
fi
mkdir -p "$RESULTS_DIR"
export RESULTS_DIR SKILLS_DIR OVERLAY_DIR MODEL PG AGENT_TIMEOUT AGENT_CMD
seq 1 "$runs" | xargs -P "$parallel" -I{} "$0" --one "$task" "$condition" {}
