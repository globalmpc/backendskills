#!/usr/bin/env bash
# The whole before/after test in one command: every task, with and without the skills, on every model.
#
#   bench/run-all.sh [runs=5] [parallel=5]
#
#   MODELS="claude-haiku-5-5 claude-sonnet-5-5 claude-opus-5-5"   models to test, one after another
#   TASKS="checkout refund ..."                                     tasks (default: every task except _smoke)
#   RESULTS_DIR=bench/results/<date>                                where runs.jsonl and the raw runs go
#
# Resumable: runs that already finished (agent didn't error) in RESULTS_DIR are counted, and only the
# missing ones run. If a run hits the usage limit, no new runs start (RESULTS_DIR/STOP); run the same
# command again after the limit resets and it carries on.
#
# Then: node bench/summarize.mjs <RESULTS_DIR>/runs.jsonl
set -euo pipefail

BENCH="$(cd "$(dirname "$0")" && pwd)"
runs=${1:-5}; parallel=${2:-5}
MODELS="${MODELS:-claude-haiku-5-5 claude-sonnet-5-5 claude-opus-5-5}"
TASKS="${TASKS:-$(cd "$BENCH/tasks" && ls -d */ | tr -d / | grep -v '^_')}"
export RESULTS_DIR="${RESULTS_DIR:-$BENCH/results/$(date +%Y-%m-%d)}"
mkdir -p "$RESULTS_DIR"
rm -f "$RESULTS_DIR/STOP"
echo "results: $RESULTS_DIR"

done_runs() { # model task condition → finished runs so far
  [[ -f $RESULTS_DIR/runs.jsonl ]] || { echo 0; return; }
  jq -s --arg m "$1" --arg t "$2" --arg c "$3" \
    '[.[] | select(.model == $m and .task == $t and .condition == $c and ((.agent_error // false) | not))] | length' \
    "$RESULTS_DIR/runs.jsonl"
}

for model in $MODELS; do
  for task in $TASKS; do
    for condition in without with; do
      if [[ -e $RESULTS_DIR/STOP ]]; then
        echo "stopped: $(cat "$RESULTS_DIR/STOP")"
        echo "run the same command again after the limit resets; finished runs are kept."
        exit 3
      fi
      missing=$((runs - $(done_runs "$model" "$task" "$condition")))
      (( missing > 0 )) || continue
      echo "$(date +%H:%M) $model $task $condition: $missing runs"
      MODEL=$model "$BENCH/run.sh" "$task" "$condition" "$missing" "$parallel" >> "$RESULTS_DIR/progress.log" 2>&1
    done
  done
done
[[ -e $RESULTS_DIR/STOP ]] && { echo "stopped: $(cat "$RESULTS_DIR/STOP")"; exit 3; }
node "$BENCH/summarize.mjs" "$RESULTS_DIR/runs.jsonl"
