# Common rules for the backend-weight workstreams (2026-11-26)

Repo: My-Trove (Spring Boot 4.1.2 / Java 21 services, React 19 + TypeScript monorepo in `ui-common`). Read
`docs/TRACKER.md` (working agreements), `README.md`, and the README of every module you touch before changing it.

You work in your own git worktree on your own branch. Commit there (small, focused commits; message style as in
`git log`; end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Never push, never merge
into main, never delete branches, never touch other worktrees.

Tests are the bar: TDD where practical; every behaviour you add has a test that fails without it.
- Backend tests need Docker (Colima):
  `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`
  then `./mvnw -B -ntp -pl <module> -am verify` (never `install`; the reactor resolves sibling modules).
- Frontend: `cd ui-common && pnpm install --frozen-lockfile` (first time in your worktree), then for what you touch:
  `npx vitest run <path>`, and before finishing `pnpm lint && pnpm typecheck && pnpm test`.
- Other agents run Docker tests at the same time on a 4-CPU machine: run only the modules you touch, not the whole
  reactor, except once at the end if your change spans modules.

Constraints: no new frameworks or infrastructure beyond what your brief names; no paid services; no downloads beyond
what your brief names; Kafka and Temporal stay. Keep `@platform/*` and `com.personalplatform.*` naming. Do not edit
files outside your brief's scope unless a compile/test requires it (then say so in your report).

Honesty: docs and READMEs say what is verified and what is not. Do not claim a check you did not run.

Report: write your full report to the report path in your brief (what you built, files, tests added and their
results with counts, anything not done or not verified, decisions you made and why). Return only: status
(DONE / DONE_WITH_CONCERNS / BLOCKED), branch name, commit list, one-line test summary.
