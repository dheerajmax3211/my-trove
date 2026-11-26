# 88: API contract tests and a per-persona browser suite (spec 5.D)

Read `80-common.md` first (it applies, with the exceptions in your dispatch). Report:
`docs/superpowers/briefs/88-report.md`.

## A. Contract tests that keep the demo mocks honest

The workspace's demo mode (`?demo=1`) answers from each product's in-memory mock API (`ui-common/apps/*/src/mock/`),
and the live mode talks to the real services. Nothing checks that the two return the same shapes, so they can drift.

Do: a `contracts/` folder at the repo root holding one JSON Schema (draft 2020-12) per response the workspace uses, for
the endpoints the products' UIs actually call (find them from each module's API client calls; start with the ones the
Today page and each product's home page use, then the rest). Both sides validate against the same files:
- Backend: in each owning service, a test that calls the endpoint (the service's existing MockMvc/WebTestClient test
  setup with Testcontainers) and validates the JSON body against the schema. Use a JSON Schema validator already on the
  backend classpath if there is one; otherwise add one small, well-known library (`com.networknt:json-schema-validator`,
  pin the exact version) to the test scope only.
- Frontend: one Vitest suite that calls each module's mock API for the same requests and validates against the same
  schemas. Use a validator already in `ui-common/node_modules` if present; adding a dependency requires a lockfile
  change and an install, which you may NOT do, so if none is present write a minimal validator in a test helper that
  supports the schema keywords you use (type, required, properties, items, enum, format date-time as a string, nullable
  via type arrays) and say so.
- Where a mock and the service disagree today, fix the side that is wrong (usually the mock) and list each fix.

## B. A per-persona browser suite

`dev/qa/persona-walk.mjs` visits routes; turn the persona checks into a real suite: `dev/e2e-personas-browser.mjs`
using the same `dev/qa/lib.mjs` (playwright-core via PLAYWRIGHT_CORE), one section per persona (owner, admin,
developer, member, auditor) with the tasks that persona actually does end to end (member: add a Waiting On item and
see it on Today; developer: create an app and an API key; admin: change a role and see it refused for OWNER targets;
auditor: read the audit log and be refused writes; owner: see platform usage), asserting what each must NOT see too.
Run it against the live stack (gateway :8080, dev IdP :9100, workspace :5190 are running; personas are seeded by
`dev/seed-personas.sh`). Add a CI job that runs the contract suites (both halves are ordinary backend and Vitest tests,
so they run in the existing jobs; just confirm) and document the browser suite in `dev/README.md` as a manual/live
check (CI has no live stack).
