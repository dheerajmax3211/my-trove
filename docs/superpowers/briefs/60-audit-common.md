# Audit and fix brief: common rules (read first)

## What the owner needs (acceptance, in the owner's words)
- A real sign-in on `http://localhost:5190/` that never silently drops into demo data. Demo is only what you get with `?demo=1` / "Try the demo".
- Real personas that work: OWNER (`dev@example.test`), ADMIN (`admin@example.test`), DEVELOPER (`developer@example.test`), MEMBER (`member@example.test`), AUDITOR (`auditor@example.test`). Each sees the navigation, pages and actions their role allows, and gets a clear "not part of your role" page otherwise.
- Every product has a clear purpose a new user understands in 30 seconds, and its main flow works end to end against the REAL backend, for the right persona (for example: add a waiting item, see its follow-up; a consent request arrives and can be approved; add a note and find it by search; add an appliance and understand where its data comes from; create a household, invite someone, add a reminder; create a vault, check in, add a trustee).
- Nothing is pretend. If a feature cannot work yet, say so plainly in the UI and point at the next real step. No fake data presented as real. No decorative cards that do nothing.

## How to verify (mandatory)
- The dev stack is running. Check `curl -s localhost:8080/actuator/health` (gateway) and `dev/.state/logs/`. If something is down, `dev/up.sh`, `dev/web.sh`.
- Personas exist: `dev/seed-personas.sh`. Sign in as a persona with the dev identity provider. In the workspace, "Continue with Google" signs in as `dev@example.test`; "Email me a sign-in link" with any address signs in as that address (no password).
- Verify in a REAL browser against the LIVE stack, logged in as the persona, not in demo mode. Use your own Playwright script (playwright-core is available from the local npx cache, or any headless Chrome). Do NOT use the shared Playwright MCP browser: other agents use it.
- Read every screenshot you take with the Read tool. Keep screenshots out of git (write them under the scratchpad directory).
- Write each flow as a scripted check (a Playwright script or a shell e2e) and commit it, so the proof can be rerun.

## Rules
- Only edit your scope (below). If a fix needs another scope, say so in your report rather than editing it.
- No new dependencies. Lockfile is frozen. macOS: use the Edit tool or `sed -i ''`.
- Commit after every working step on your branch. Do not push. Run `pnpm exec prettier --write` on what you touch, then from `ui-common`: `pnpm lint && pnpm typecheck && pnpm test && pnpm -r build` before the final report. Backend: `./mvnw -q -pl <modules> -am test` with Docker env (`export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`).
- After a backend change, restart that service: `dev/down.sh` is too broad, so kill its pid from `dev/.state/pids/<name>.pid` and run `dev/up.sh <name>` (rebuild its jar first with `./mvnw -q -pl <name> -am -DskipTests package`).
- FINAL REPORT (plain text, concise): branch and commits; for each workflow: what you tested, as which persona, the result, and what you fixed; the scripts you added; what is still broken or not built, honestly.
