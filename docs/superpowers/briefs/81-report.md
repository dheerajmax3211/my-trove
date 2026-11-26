# 81 report: move derived logic from the browser to the services

Branch `worktree-agent-ab519d1e12124a601` (fast-forwarded to `main` at 9540b5a first, because the worktree was cut one
commit before the briefs landed). Status: **DONE_WITH_CONCERNS**. The concern: I could not run the frontend checks.
`pnpm install --frozen-lockfile` was refused twice by the permission classifier (the user's memory note says to ask
before installs), so this worktree has no `node_modules`. No vitest, lint or typecheck has run on the UI changes.
The backend changes were all verified with Docker.

## What was built

Three server-owned computations now come from the service. The browser copies are deleted.

1. **Waiting On next follow-up step** (the proven case, and the one where a disagreement looks worst: the list said
   "nudge on the 3rd" for an item snoozed to the 7th).
   - Backend: every item response (create, list, get, resolve, snooze, cancel) carries
     `nextStep: {action, at, source}`. `source` is `WORKFLOW` when the workflow's `state()` query answered, so snoozes,
     the NEEDS_INFO hold and a refusal that skipped the nudge are all included. It is `PLAN` when the workflow did not
     answer: Temporal was unreachable or disabled, or the workflow is unknown. A `PLAN` step is read off the stored
     plan from `createdAt` and ignores snoozes. `nextStep` is null for closed items, and when an answering workflow
     has nothing left to do.
   - The list now queries each active item's workflow and also returns `followUp`, as the detail does. The queries run
     in parallel on virtual threads, after one probe query. If the probe fails (Temporal down), the whole page uses
     plan steps, so a down Temporal costs one failed query instead of fifty.
   - UI: `estimateNextStep` and its tests are deleted. Item cards, the home summary (`nextFollowUp`) and the workspace
     Today feed read `item.nextStep`. A card with a `PLAN` step says "around <date> (estimated from the plan)"; a
     `WORKFLOW` step says "on <date>". When the live state is unavailable, the detail page now also shows the
     plan-based step and says it does not include snoozes.
   - Mock: `followUpOf` and `nextStepOf` are exported pure functions in `mock/backend.ts`. Every item view now carries
     `followUp` and `nextStep` (source `WORKFLOW`, computed from the mock's simulated stage and snoozes), matching the
     new contract.
2. **Consent request deadline.** The UI hard-coded a 7-day request TTL (`REQUEST_TTL_MS`, `requestExpiresAt`), but the
   gateway's TTL is a setting (`app.consent.request-ttl`). Owner and client request views now carry
   `expiresAt = createdAt + request-ttl`. It stays set while the request is pending, including after it lapses to
   EXPIRED, and is null once approved or denied. `RequestCard` and the Today feed use it; the client constant is gone.
   The mock computes the field from its own TTL.
3. **Home Pulse days to next service.** The Today feed counted days to `nextServiceDate` in the browser, while the
   server separately decided `serviceOverdue` on its own UTC day. `ApplianceResponse` and the health `service` block
   now carry `daysToNextService`. `buildTodayItems` uses only server day counts (`daysToWarrantyEnd`,
   `daysToNextService`), so its `daysUntil` helper and its `now` parameter are removed, and the hook no longer reads
   the clock. The mock returns the field.

## Commits

- `08aa401` waiting-on: every item response carries the next follow-up step, from the workflow or the stored plan
- `bd447d6` waiting-on ui: show the service's next step; delete the client-side schedule guess
- `c268942` consent-gateway: request views carry expiresAt, the server's decision deadline
- `961c4d6` consent ui: show the gateway's request deadline; drop the hard-coded 7-day TTL
- `7459004` home-pulse: appliance and health responses carry daysToNextService
- `ab892bb` home-pulse ui: Today uses the service's day counts for warranty and service
- (this report)

## Files

Backend:
- `waiting-on/src/main/java/com/personalplatform/waitingon/item/NextStep.java` (new, pure)
- `waiting-on/.../item/ItemService.java` (`ItemDetail` gains `nextStep`; `list` returns details with parallel state queries; `detailOf`)
- `waiting-on/.../item/ItemController.java` (`NextStepView`, `ItemResponse.nextStep`; every endpoint returns details; unused `ItemLetters` dependency dropped)
- `waiting-on/README.md` (REST table)
- `consent-gateway/.../consent/ConsentViews.java`, `ConsentService.java` (`expiresAt(r)`), `GatewayRequestController.java`, `OwnerConsentController.java`, `consent-gateway/README.md`
- `home-pulse/.../appliance/ApplianceResponse.java`, `health/ApplianceHealth.java`, `health/HealthService.java`

Frontend (`ui-common/apps/...`):
- waiting-on: `features/items/api/types.ts`, `logic/schedule.ts` (estimate removed), `logic/groups.ts`, `today.ts`, `components/ItemRow.tsx`, `components/FollowUpCard.tsx`, `mock/backend.ts`, `README.md`
- consent: `shared/api/types.ts`, `shared/lib/requests.ts`, `today.ts`, `features/requests/components/RequestCard.tsx`, `mock/backend.ts`
- home-pulse: `features/appliances/types.ts`, `features/today/todayItems.ts`, `features/today/useTodayItems.ts`, `features/appliances/components/ServicePanel.tsx`, `mock/mockApi.ts`

## Tests

Backend tests were run per module with Docker (`./mvnw -B -ntp -pl <module> -am verify`). All green:

| module | result | added |
|---|---|---|
| waiting-on | 152 run, 0 failures, 0 errors, 1 skipped (the opt-in `RealTemporalServerTest`) | `NextStepTest` (7): plan per status, the final-notice/expiry switch, closed items, the workflow answer wins and carries snoozes and refusals, plan fallback, finished workflow. `ItemServiceNextStepTest` (3): Temporal down means one probe and plan steps for the whole page; Temporal up queries every active item and no closed one; a workflow unknown to Temporal falls back for that item only. `WaitingOnApiTest.listAndDetailCarryTheWorkflowsNextStepIncludingASnooze` (real time-skipping Temporal: after a snooze, the list's step equals the live `nextActionAt`, comes later than the plan date, and is null for a cancelled item). `WaitingOnTemporalDisabledTest.nextStepComesFromThePlanAndSaysSo` |
| consent-gateway | 172 run, 0 failures, 0 errors | `ConsentFlowTest.requestCarriesTheServersExpiryUntilItIsDecided`: owner and client views carry createdAt + 7d; null after deny; still set once lapsed to EXPIRED |
| home-pulse | 182 run, 0 failures, 0 errors | `daysToNextService` assertions in `OwnerApiTest`: 76 on create, -5 after update, 10 in the health `service` block |

Frontend tests were written or updated but **not run**, for the install reason above:
- waiting-on: `Home.test.tsx` adds a test that the card shows the server's step, with WORKFLOW reading "on" and PLAN
  reading "around ... (estimated from the plan)". `ItemDetail.test.tsx` adds a test that a plan-based step appears
  when the live state is unavailable. `module.test.tsx` now drives the Today info entry from `nextStep`, plus a
  negative case. `api.test.tsx` expects `followUp` and `nextStep` on create. `groups.test.ts` and `module.test.tsx`
  fixtures use `nextStepOf`. The `estimateNextStep` tests in `schedule.test.ts` are deleted.
- consent: new `features/requests/components/RequestCard.test.tsx` checks that the card shows the server's deadline,
  not the 7-day assumption, and shows no line without one. `module.test.tsx` checks that Today's `dueAt` is the
  server's `expiresAt`. `mock/backend.test.ts` asserts the mock's `expiresAt`. The `approval.test.ts` fixture is
  updated.
- home-pulse: `todayItems.test.ts` drops the `now` argument and adds a test that the day count comes from the service
  and not the browser clock. `mockApi.test.ts` asserts `daysToNextService: -12` for the pump.

What still needs running: `cd ui-common && pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`.
Risks I could not rule out without it:
- Type errors in fixtures I did not find. I searched for every `Item`, `AccessRequest` and `Appliance` literal.
- A demo-seed expectation shifting now that waiting-on cards use the mock's simulated workflow (snoozes included)
  instead of the plan estimate. I traced `groups.test` and the `Home.test` "next follow-up: Today / Oak and Ash" by
  hand: the desk order is still the earliest.
- Prettier reflowing a line I formatted by hand. I kept code lines within 100 characters.

## Audit: business logic computed client-side

Legend: **server-owned** means the service is the authority, so a client copy can disagree. **client** means it is
legitimately client-side (presentation, a preview of unsaved input, or Digital Legacy's end-to-end crypto).

| file | what it computes | verdict | action |
|---|---|---|---|
| waiting-on `features/items/logic/schedule.ts` `estimateNextStep` (+ `groups.ts` `nextFollowUp`, `today.ts`, `ItemRow`) | next follow-up action and date from createdAt + plan, ignoring snoozes and reply holds | server-owned (Temporal workflow) | **Done**: `nextStep` from the service; client code and tests deleted |
| waiting-on `schedule.ts` `defaultPlan`, `validatePlan`, `buildSchedule`; `SchedulePreview`, `FirstUse`, `PlanCard` | default plan per category, plan rules, schedule preview while the form is filled in | client (preview of unsaved input; the service validates on POST) | kept. `defaultPlan` duplicates `EscalationPlan.defaultFor`; a `GET /v1/plans/default?category&expectedBy` would remove it (follow-up) |
| waiting-on `schedule.ts` `dueState`, `groups.ts` grouping and summary counts | overdue / today / upcoming against the user-entered `expectedBy`, in the viewer's calendar day | client (the viewer's own day; grouping a fetched list) | kept |
| waiting-on `StageGauge.rungs`, `PlanCard` | how many letters have been reached, for display | client (presentation of `followUp.stage`) | kept |
| consent `shared/lib/requests.ts` `requestExpiresAt` / `REQUEST_TTL_MS` | when a pending request expires (hard-coded 7 days) | server-owned (`app.consent.request-ttl`) | **Done**: `expiresAt` on request views |
| consent `features/requests/api/approval.ts` `validateApproval` | narrowing-only rules for an approval | server-owned, mirrored for form errors | kept (the server rejects too). Low risk: a mismatch shows an error, never a wrong grant |
| consent `approval.ts` `computeVisibility` (ApproveDialog, RequestCard) | which attributes an approval would release or withhold (scope coverage + sensitivity ceiling) | server-owned policy (PolicyEngine), mirrored as a preview | not done. Next candidate: a `POST /v1/owner/requests/{id}/preview` returning released/withheld keys. Medium risk: a scope-matching bug would mis-describe what is shared |
| consent `dashboard/summary.ts` `leaseElapsed`, `sensitivityCounts`, `vaultGroups`; `today.ts` grant-expiry window | progress bar, counts and groups of fetched data; "ends within 7 days" | client (presentation; `status` and `expiresAt` already come from the server) | kept |
| consent `shared/lib/scopes.ts` | scope parsing and validation of typed input | client (input validation; the gateway re-validates) | kept |
| consent `shared/lib/audit.ts` | labels and sentences for audit entries; chain-break wording | client (presentation; the chain is verified server-side) | kept |
| home-pulse `features/today/todayItems.ts` `daysUntil` | days to next service (and a warranty fallback) from the browser clock | server-owned (server decides `serviceOverdue`) | **Done**: `daysToNextService`; `daysUntil` removed |
| home-pulse `HomeVerdict.deriveVerdict`, `HomeSummaryCards` health mix | home state and counts from fetched alerts and health statuses | client (grouping fetched data; each status is server-computed) | kept |
| home-pulse `alerts/evidence.ts`, `readings/chart/series.ts` | alert wording from server evidence; chart gaps and summaries of fetched points | client (presentation) | kept |
| digital-legacy `crypto/*` (Shamir, AES-GCM, key files, share envelopes) | end-to-end encryption | client by design | kept (out of scope by the brief) |
| digital-legacy `overview/status.ts`, `today.ts` | wording, countdown targets and ladder position from the server's `StateView` (`state`, `nextDueAt`, `nextActionAt`) | client (presentation of server state) | kept |
| digital-legacy `policy/timelinePreview.ts` | timeline of a policy being edited | client (preview of unsaved input) | kept |
| family-treasury `lib/permissions.ts` | role rules (`canDebit`, `canView`, capability matrix) deciding which buttons to offer | server-owned, mirrored for UX; the server answers 403 | not done. Follow-up: per-account `capabilities` in the household response. Low risk (a hidden or extra button, never an unauthorised move) |
| family-treasury `lib/money.ts` `allocateMinor`, `previewSplit` | split of a total across weighted shares, including leftover-cent placement | server-owned money arithmetic, mirrored as a preview | not done. Follow-up: a split preview endpoint. Medium risk: the preview could show cents that differ from what posts |
| family-treasury `PotTiles.potShares`, `entryUtils.summarizeEntry` | percentage bars; total moved in an entry, from its postings | client (presentation of fetched balances and postings) | kept |
| hub `features/households/rules.ts` | last-owner and owner-only rules for disabling controls | server-owned, mirrored for UX | kept (server enforces). Low risk |
| hub `core/today.ts`, `lib/day.ts` | reminder grouping by the viewer's calendar day | client (viewer's day, grouping fetched data) | kept |
| admin-console `lib/catalogue.ts` `PLAN_TABLE` | plan limits (requests per minute and month) hard-coded | server-owned (platform plans table) | not done. Follow-up: a plans endpoint in platform-service (the file itself notes there is none) |
| admin-console `lib/range.ts`, charts, `Usage` totals | time window and sums of fetched series | client (presentation) | kept |
| ask-your-life `features/search/lib/explain.ts`, library counts | "why this result" text from the server's debug ranks and scores; counts of fetched documents | client (presentation of server debug data) | kept |

Ranking used for "do the clear cases first": (1) Waiting On next step. It was visibly wrong after any snooze or hold,
and on the most-used screen. (2) Consent deadline. It was wrong whenever the TTL setting differs from 7 days, and the
card states it as fact. (3) Home Pulse service days. The browser's day and the server's UTC day can disagree near
midnight, so "due in 1 day" could sit next to "overdue". The remaining candidates (consent visibility preview,
treasury split preview, treasury and hub permission mirrors, admin plan table) are listed above as follow-ups. Each
needs a new endpoint, and each one's current failure mode is a misleading preview or button, not wrong stored data.

## Decisions

- **The list queries Temporal per item instead of staying plan-only.** The brief asks for the workflow value when
  Temporal answers. Pages are capped at 100 items. Queries run in parallel on virtual threads, after a one-query probe,
  so an outage degrades to plan steps quickly.
- **`source` is in the response, not only in logs.** The UI marks plan-based steps as estimates.
- **The plan fallback ignores snoozes.** Deriving snoozes from timeline summaries would mean parsing text. A
  structured snooze column would need a migration, which is out of scope. This is documented in `NextStep`, the
  README and the UI copy.
- **`nextStep` is null when an answering workflow reports `NONE`.** In that case the item is about to close, and a plan
  date would be misleading.
- **Consent `expiresAt` stays set on lapsed (EXPIRED) requests**, so "expired on" can be shown. It is null only after
  a decision.
- **The home-pulse `buildTodayItems` signature changed** (its `now` argument was removed). The only caller is the
  module's own hook.

## Not done or not verified

- Frontend: lint, typecheck and vitest were not run (install refused). Nothing in the UI was driven in a browser.
- The full backend reactor was not run, only the three touched modules. They do not depend on each other, and
  `sql-jooq`, `libs` and the other `-am` modules built within each run.
- The audit's follow-up rows are not implemented.
