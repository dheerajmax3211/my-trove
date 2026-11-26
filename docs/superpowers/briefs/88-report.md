# 88 report: API contract tests and a per-persona browser suite

Status: **DONE_WITH_CONCERNS**. Part A is done and verified on both sides. Part B's suite is written, but it is not green
against the live stack. The running services had their jars rewritten under them (details under Concerns), so 12 of 21
checks failed on 5xx answers. Worked in the main checkout on `main`, as the dispatch said. Nothing pushed.

## A. Contract tests

**What:** `contracts/` at the repo root holds 62 JSON Schemas (draft 2020-12) for 7 services: waiting-on 4,
consent 14, home-pulse 7, ask-your-life 4, digital-legacy 8, family-treasury 15, shared (Household) 10. Each file names
the record it mirrors and its endpoints. The set covers the Today feed and each home page first, then the detail pages
and the main writes. Objects are closed (`additionalProperties: false`) and every field the service always sends is
required, so a missing or extra field fails on either side. `contracts/README.md` explains the rules.

**Service half:** each service has a `*ContractTest` that drives the real endpoints through MockMvc on the existing
Testcontainers setup and validates the JSON body. It covers populated and empty or null variants (for example a closed
item, a vault that does not exist yet, a PENDING spend with `entry: null`).
- The validator is `com.networknt:json-schema-validator` **3.0.6**. Its scope is test-only and its version is pinned
  in the root `pom.xml` dependencyManagement. mcp-server already resolves this version through the MCP SDK, so nothing
  new was downloaded.
- Format assertions are on.
- Schemas load through a fixed base IRI so that relative `$ref`s resolve. File URIs failed on the space in the repo path.
- One helper class `ContractSchemas` is copied into each service's test sources. A shared test module would have
  touched the root reactor.
- An empty JSON array fails the check, because it would prove nothing about the element shape.

I proved the negative case once: a deliberately broken waiting-on schema (wrong format plus an extra required field)
failed with both violations named.

**Demo half:** `ui-common/apps/workspace/src/contracts/contracts.test.ts` calls each module's `createDemoFetch()` the
way the workspace does (`${apiBase}/${service}/v1/...`) and validates against the same files.
- `ui-common` declares no schema validator, so `validate.ts` is a minimal one. It supports `type` (including type
  arrays for nullable fields), `required`, `properties`, `additionalProperties`, `items`, `enum`, `const`, `format`
  (date-time, date), `$ref` (local `$defs` or a sibling file) and `anyOf`.
- It **throws on any other keyword**, so no schema passes because a keyword was ignored.
- `validate.test.ts` covers it (5 tests).
- For Digital Legacy, the armed-vault case reuses the product's own `armedScenario` test helper, which does the real
  client-side crypto. The new package export `./testing/scenario` makes it reachable.

**Mock fixes (where demo and service disagreed):**
1. Home Pulse: seed alerts left out `simulated`, but the service always sends it. The mock now always sends it, and
   `AlertDto` declares `simulated: boolean`; one test fixture was updated to match. After workstream 87 merged, the
   alert contract also allows the optional `decidedBy` (`MAD` | `ML` | null). The Home Pulse contract passes on both
   sides after that merge.
2. Ask Your Life: the service omits null fields (`default-property-inclusion=non_null`), but the mock sent `externalId`,
   `ingestedAt` and `debug` as `null`. The mock's JSON writer now omits null properties the same way.
3. Digital Legacy: with no vault, the service sends `metadata: {}` (`OwnerDtos.absent()`), but the mock sent `null`.
   The mock now sends `{}`. The wire types say `VaultMetadata | NoMetadata`, and a dead `metadata === null` guard in
   `vaultService.ts` was removed.

No service was wrong, so no service code changed.

Gaps I noted but did not change:
- The Household mock has no `GET /v1/reminders/{id}` or `GET /v1/files/{id}`. The UI does not call them, so they are
  not in the demo suite; the service side covers them.
- Ask Your Life's TS types say `externalId: string | null` where the service omits the field. The UI handles both.

**CI:** both halves run in the existing jobs: `./mvnw verify` in the backend job and `pnpm test` in the frontend job,
which both use the whole checkout. No new job was needed, and `ci.yml` is unchanged.

## B. Per-persona browser suite

`dev/e2e-personas-browser.mjs` uses `dev/qa/lib.mjs` (playwright-core through `PLAYWRIGHT_CORE`). It has one section
per persona, each with the persona's real task and what it must not see:
- **Member:** adds a Waiting On item through the form, finds it on Today ("Due in 1 day") and opens it. Must see no
  Admin or Developer link, and `/app/admin/usage` and `/developer` must show their forbidden pages.
- **Developer:** registers an app (the secret is shown once) and issues a key (the list shows only its prefix). The
  gateway accepts the key in scope and refuses it outside. Must not reach the Admin console.
- **Admin:** on a disposable account (`persona-suite-target@example.test`, reset to MEMBER first), grants and revokes
  DEVELOPER, checked through the API. Grant ADMIN/OWNER must be disabled, with the reason shown. A grant on the OWNER
  account must be refused, with the owner's roles unchanged. Must not reach Developer.
- **Auditor:** reads the audit log (entries present). A user's page must say "read but not change" and show no
  Grant, Revoke or Suspend buttons. The API must answer 403 to a role change, with nothing changed.
- **Owner:** sees Admin and Developer, plus platform usage: headline numbers, By service and Top users.

Each section fails on page errors and 5xx answers. It cleans up after itself: cancels the item, revokes the key and
retires the app. A setup failure counts as a failed check rather than crashing the run. `dev/README.md` documents it
as a manual live check, since CI has no stack.

**Live result:** last run **9 passed, 12 failed**.
- **Passed:** member item creation and all member forbidden checks; developer's Admin refusal; auditor's audit log and
  Developer refusal; owner's navigation and usage screen.
- **Failed, all on 5xx from the running services:**
  - waiting-on `GET /v1/items?status=…` and `/draft`, so the item never reached Today.
  - platform-service `GET /v1/developer/apps`, so the developer could not register an app.
  - auth `GET /v1/admin/users?query=` and platform-service `/v1/usage/summary` when called from Node, so the admin
    section's setup and the auditor and owner API checks failed.
- **Not verified live:** the admin role-change flow, the developer app and key flow, and Today showing the new item.

## Concerns

1. **The live stack is degraded, and my builds caused part of it.** `dev/up.sh` runs `<module>/target/*.jar`. Running
   `./mvnw … verify` in this checkout repackages those jars under the running JVMs, and later class loads then fail.
   The service logs show `ClassNotFoundException`/`NoClassDefFoundError` (`org.apache.catalina.util.RequestUtil`,
   `AcceptLanguage2`, `DeveloperIdentity`, OpenTelemetry classes) in waiting-on, platform-service and auth.
   - My `verify` runs rewrote the jars of waiting-on, consent-gateway, home-pulse, ask-your-life, digital-legacy,
     family-treasury and shared-service.
   - I never built auth or platform-service, so something else also rebuilt those in this checkout.
   - I switched to `./mvnw test`, which writes no jars, as soon as I found this, and added a warning to `dev/README.md`.
   - I did not restart shared services, per the dispatch.
   - **Needed:** restart the stack (`dev/down.sh && dev/up.sh`, after a `./mvnw -DskipTests package`), then rerun
     `node dev/e2e-personas-browser.mjs`. Some selectors on the admin and developer screens will be proven only by that
     run.
2. **A Temporal context-restart trap in waiting-on tests.** A second test class that shares `WaitingOnApiTest`'s Spring
   context fails with "attempted to start WorkerFactory while in Shutdown state", because Spring pauses and restarts
   cached contexts. `WaitingOnContractTest` therefore uses its own context. Any future class reusing that configuration
   will hit the same failure.
3. **One intermittent failure:** `LegacyApiTest.everyEndpointRequiresTheRightKindOfCredential` failed once in the full
   run (DataIntegrityViolation on a vault select). It passed on two reruns, including the full digital-legacy run. The
   test predates this work; I left it alone.

## Files outside the brief's listed scope

- `pom.xml` (root): dependencyManagement pin for the validator.
- The seven services' `pom.xml`: test-scope dependency.
- Product code, for the mock fixes only: `home-pulse/src/features/alerts/types.ts`,
  `digital-legacy/src/api/types.ts`, `digital-legacy/src/features/vault/vaultService.ts`.
- `digital-legacy/package.json`: export `./testing/scenario`. No lockfile change and no install.
- `docs/TRACKER.md`: the 5.D line.

## Tests

- **Backend** (`./mvnw -o -pl <7 services> -am test`): 956 service tests, 0 failures, 1 skipped (pre-existing). The
  breakdown is shared 83, waiting-on 185, consent 173, home-pulse 199 (after the 87 merge), ask-your-life 126,
  digital-legacy 104, family-treasury 86. It includes 8 new contract tests: one per service, two in digital-legacy.
  Libs: sql-jooq 77, security 45, notify 9.
- **Frontend:** 2,225 tests in 196 files, all passing. That includes 24 new tests: 19 in the contract suite and 5 for
  the validator. `pnpm lint` and `pnpm typecheck` are green.
- **Live browser suite:** 9/21 (see B). Not green, because of Concern 1.

## Commits

- 4c12e76 contract schemas for Waiting On, checked against the service and the demo mock
- 6a78232 Consent owner API contracts
- 405f598 Home Pulse contracts; demo alerts carry the simulated flag
- f128241 Ask Your Life contracts; mock omits null fields
- 37995fa Digital Legacy contracts; mock sends {} metadata
- 9992ae8 Family Treasury contracts (validator gains anyOf)
- 66f640d Household (shared service) contracts
- cab47da decidedBy allowed; Waiting On contract test gets its own context
- (this commit) per-persona browser suite, READMEs, tracker, this report
