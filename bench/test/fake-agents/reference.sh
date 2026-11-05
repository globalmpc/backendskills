#!/usr/bin/env bash
# Fake agent: applies tasks/<task>/reference/$REF (naive|safe). $1 is the task's prompt.md.
# A reference can hold migrations (*.sql), a route added before the error handler (route.ts), and/or apply.sh
# for anything else (run in the app folder).
set -euo pipefail
ref="$(dirname "$1")/reference/${REF:?naive or safe}"
for f in "$ref"/*.sql; do [[ -e $f ]] && cp "$f" migrations/; done
if [[ -e $ref/route.ts ]]; then
  grep -q 'from "./payments.ts"' src/app.ts || perl -0pi -e 's|^|import { payments } from "./payments.ts";\n|' src/app.ts
  ROUTE="$(cat "$ref/route.ts")" perl -0pi -e 's|(  app\.use\(\(err: Error)|$ENV{ROUTE}\n\n$1|' src/app.ts
fi
if [[ -e $ref/apply.sh ]]; then bash "$ref/apply.sh"; fi
echo '{"result":"reference","total_cost_usd":0,"num_turns":1,"duration_ms":1}'
