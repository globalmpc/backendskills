#!/usr/bin/env bash
# Fake agent: makes the _smoke change correctly.
perl -0pi -e 's|(  app.use\(auth\);)|  app.get("/ping", (_req, res) => {\n    res.json({ pong: true });\n  });\n\n$1|' src/app.ts
echo '{"result":"done","total_cost_usd":0,"num_turns":1,"duration_ms":1}'
