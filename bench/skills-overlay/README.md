# Skills overlay for the benchmark

The shipped skills leave team choices "not set". The sample app (`bench/app`) has its own conventions:
a Postman collection, the `{ "error": { "code", "message" } }` format, down migrations in
`migrations/down/`. The three team-convention tasks check for them.

For each skill, `run.sh` swaps the `## Make it yours` section of the copied `SKILL.md` for
`<skill>/make-it-yours.md` from this folder. It's the same thing a team does when it forks the skills.
`skills_hash` and the saved copy in each run's results are taken after the swap, so they show exactly
what the agent saw.

Nothing here may mention the benchmark: the agent reads it.
