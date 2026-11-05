#!/usr/bin/env bash
# The daily numbers message for the team channel (spec: "one message a day from Nov 5").
#
#   scripts/daily-numbers.sh [owner/repo]        (default: the repo's origin remote)
#
# GitHub numbers come from `gh api`. "External" leaves out members of the repo's organization, and
# anyone listed in TEAM (space-separated logins) for team accounts outside the org.
# Channel numbers (Reddit, video, X, LinkedIn, Dev.to) have no API we can use here; paste them in.
set -euo pipefail

repo=${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
owner=${repo%%/*}

team=$( { gh api --paginate "orgs/$owner/members" -q '.[].login' 2>/dev/null || true; tr ' ' '\n' <<<"${TEAM:-}"; } | grep . | sort -u)
is_external() { ! grep -qxF "$1" <<<"$team"; }

stars=$(gh api --paginate "repos/$repo/stargazers" -q '.[].login')
external_stars=0; while IFS= read -r login; do [[ -n $login ]] && is_external "$login" && external_stars=$((external_stars + 1)); done <<<"$stars"
total_stars=$(grep -c . <<<"$stars" || true)

# Issues and PRs opened by people outside the team ("outside mistake reports or contributions", target 5 in 60 days).
external_reports=0
while IFS= read -r login; do [[ -n $login ]] && is_external "$login" && external_reports=$((external_reports + 1)); done \
  < <(gh api --paginate "repos/$repo/issues?state=all&per_page=100" -q '.[].user.login')
info=$(gh api "repos/$repo" -q '"\(.forks_count) \(.subscribers_count)"')

cat <<MSG
*backendskills, $(date +%Y-%m-%d)*

GitHub ($repo)
- Stars: $total_stars total, *$external_stars external* (target 100 in 14 days)
- Forks: ${info%% *} · Watchers: ${info##* }
- External issues and PRs: $external_reports (target 5 in 60 days)

Channels (views / likes / shares), fill in:
- Reddit: _ / _ / _   (target 6,000 views)
- Short video: _ / _ / _   (target 2,500)
- X: _ / _ / _   (target 1,000)
- LinkedIn: _ / _ / _   (target 1,000)
- Dev.to: _ / _ / _   (target 500)
- Total views: _ of 11,000 (bar 10,000)
MSG
