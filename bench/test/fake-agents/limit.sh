#!/usr/bin/env bash
# Fake agent that hits the usage limit, like claude -p does.
echo '{"is_error":true,"result":"You'"'"'ve hit your 5-hour limit · resets 6:10pm","total_cost_usd":0}'
