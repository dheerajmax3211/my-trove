# waiting-on

Port **8083**, Postgres schema `waiting_on`.

## Purpose

Todo apps track what *you* must do. **Waiting-On** tracks what you are *waiting for from other people*: refunds, insurance
claims, expense reimbursements, approvals, deliveries, replies. Each tracked item carries an escalation plan, and a
durable workflow follows up for weeks without you remembering: a friendly nudge, then a firm escalation letter with
consumer-rights style wording, optionally a final notice, and finally it marks the item expired if nobody ever answered.
Replies from the counterparty come back by email, are classified, and steer the workflow (paid -> done, refused ->
escalate now, "send us the invoice" -> pause chasing).

## Architecture

```
                     Firebase ID token                        shared secret header
 client app  ───────────────────────────►  /v1/items/**      email provider ──► POST /v1/webhooks/inbound-email
                                                │                                     │ (plus-address -> item)
                                          ItemController                     InboundEmailService
                                                │                          ReplyClassifier (rules | LLM ext. point)
                                           ItemService  ◄───── owner_uid scoping ──────┤
                                          │         │                                  │
                          ItemRepository / EventRepository (jOOQ)          FollowUpScheduler (port)
                                          │                                  │                  │
                                   Postgres schema waiting_on        Temporal impl         Noop impl
                              items + item_events (append-only)          │             (app.temporal.enabled=false)
                                          ▲                       Temporal server (gRPC)
                                          │                              │  timers, signals, queries
                          FollowUpActivitiesImpl  ◄── activities ── FollowUpWorkflowImpl  (in-process worker)
                          │          │        │
              NotificationPort   LetterTemplateEngine   (pure)
              (logging impl)     EscalationPlan (pure)
```

Source of truth: **Postgres** holds item state and the timeline. **Temporal** holds only the schedule (what is due when).
User actions (resolve, cancel) are committed to Postgres first and then signalled; if a signal is lost the workflow
notices at its next activity, because every activity first reads the item and stops when it is already closed.

### Packages (`com.personalplatform.waitingon`)

| package | content |
|---|---|
| `item` | domain (`WaitingItem`, statuses, categories), jOOQ repositories, `ItemService`, REST controller |
| `escalation` | pure code: `EscalationPlan` (stage offsets and defaults per category), `LetterTemplateEngine` (templates by category and tone) |
| `reply` | `ReplyClassifier` interface, `RuleBasedReplyClassifier`, `ReplyOutcome` |
| `workflow` | `FollowUpWorkflow` (+Impl), `FollowUpActivities` (+Impl), `FollowUpScheduler` port |
| `temporal` | client/worker wiring, `TemporalFollowUpScheduler`, `NoopFollowUpScheduler`, startup failure analyzer |
| `inbound` | webhook controller, shared-secret filter, plus-address parsing |
| `notify` | `NotificationPort` + logging implementation |

## The heavy-tech piece: Temporal, and why it is justified

A follow-up runs for **days to months** (a claim can be chased for 90 days) and must survive deploys, crashes and
restarts without losing or duplicating a step. A `@Scheduled` poller over a `next_action_at` column would work for one
timer, but this needs: several dependent timers that can be pushed back (snooze, "needs info" hold), cancellation of
pending timers the instant the user resolves, retries with backoff when the mail provider is down, queryable
"what happens next and when", and tests that run weeks of schedule in milliseconds. Temporal gives all of that with
workflow code that reads like the plan. Worker state lives in the Temporal server, not in this JVM.

* **One workflow per item**, id `follow-up-<itemId>` (`FollowUpWorkflow.workflowIdFor`).
* **Timers**: each wait is a single `Workflow.await(remaining, condition)`. A signal that satisfies the condition cancels
  the timer (verified in tests against the history: `TIMER_CANCELED`). A snooze just re-evaluates the due time.
* **Signals**: `resolve(outcome)`, `replyReceived(classification)`, `snooze(days)`, `cancel()`. First terminal signal wins.
  Snooze outside 1..90 days is ignored.
* **Query**: `state()` returns stage, next action and its time, total snoozed days.
* **Activities** (all idempotent): `sendNudge`, `draftEscalation`, `sendFinalNotice`, `closeItem`. Retried with
  exponential backoff (8 attempts); if one still fails the workflow logs and carries on rather than wedging for weeks.
* **Determinism**: the workflow uses only `Workflow.currentTimeMillis()` / `Workflow.await`, no clocks, randomness,
  I/O or threads; all side effects are activities. Changing the stage order for running executions needs
  `Workflow.getVersion` (noted in the class Javadoc).

Schedule (days after tracking starts; defaults are anchored on `expected_by`, see `EscalationPlan.defaultFor`):

```
 day N1            day N2               day N3 (optional)      day N4
 nudge  ───────►  escalation letter ──► final notice  ───────► EXPIRED
 (OPEN->NUDGED)   (->ESCALATED)         (letter stored)        (never resolved)
   any time: resolve | cancel -> timers cancelled;  snooze(d) -> every remaining stage +d days
   reply PAID -> resolved; REJECTED -> skip to escalation now; NEEDS_INFO -> hold 7 days; UNKNOWN -> only logged
```

### Decision: plain Temporal SDK, not the Spring Boot starter

`io.temporal:temporal-sdk` 1.41.1 is wired by hand (`TemporalClientAutoConfiguration`, `TemporalWorkerConfig`).
The official `temporal-spring-boot-starter` 1.41.1 is built against Spring Boot **2.7.18**'s BOM (checked in its
published POM). I did not try it on Boot 4.1.2 and did not need to. Verified instead, on Boot 4.1.2 / Java 21:

* the plain SDK works with Boot 4's dependency management. Temporal brings Jackson **2.x**
  (`com.fasterxml.jackson`, used only for workflow payloads) next to Boot 4's Jackson **3** (`tools.jackson`, used by
  MVC); the two do not clash because the packages differ. Workflow/activity arguments are records, enums and UUIDs and
  serialize fine;
* it works against the in-process time-skipping test server (default build) **and** against a real
  `temporalio/temporal` dev server (opt-in test `RealTemporalServerTest`, `REAL_TEMPORAL=true`; also booted the
  packaged app against a real dev server and Postgres and checked `/actuator/health`).

Other pieces of Boot 4 / Temporal wiring worth knowing: the client beans live in an `@AutoConfiguration` so
`@ConditionalOnMissingBean` is evaluated after test beans (tests inject a client backed by `TestWorkflowEnvironment`
and the production worker/scheduler code runs unchanged on top of it).

## REST API

All `/v1/items/**` calls need `Authorization: Bearer <Firebase ID token>`; everything is scoped to the caller's uid.
Another user's item looks exactly like a missing one (404).

| method + path | description |
|---|---|
| `POST /v1/items` | create. Body: `title`, `counterparty`, `counterpartyEmail?`, `category` (`REFUND CLAIM REIMBURSEMENT APPROVAL DELIVERY OTHER`), `amount?`+`currency` (ISO 4217, required with amount), `expectedBy`, `plan?` (`nudgeAfterDays`, `escalateAfterDays`, `finalNoticeAfterDays` (0 = none), `expireAfterDays`). 201 + `replyAddress` (the plus-address to put in Reply-To) |
| `GET /v1/items?status=OPEN&status=NUDGED&limit=50&offset=0` | list (ordered by `expectedBy`); each item carries `followUp` and `nextStep` like the detail. Active items' workflows are queried in parallel; if the first query fails (Temporal unreachable) the whole page falls back to plan-based steps |
| `GET /v1/items/{id}` | item + live `followUp` (`stage`, `nextAction`, `nextActionAt`, `snoozedDays`) queried from the workflow, and `nextStep` (`action`, `at`, `source`): `source` is `WORKFLOW` when the workflow answered (snoozes, reply holds and refusals included) and `PLAN` when it did not (read off the stored plan from `createdAt`; ignores snoozes). `nextStep` is null once the item is closed. Every item response (create, list, resolve, snooze, cancel) carries both fields |
| `POST /v1/items/{id}/resolve` | body `{"outcome": "..."}` optional. 409 if already closed |
| `POST /v1/items/{id}/snooze` | `{"days": 1..90}`; shifts every remaining stage |
| `POST /v1/items/{id}/cancel` | stop tracking |
| `GET /v1/items/{id}/timeline` | append-only event list, oldest first (`CREATED NUDGE_SENT ESCALATION_DRAFTED FINAL_NOTICE_DRAFTED REPLY_RECEIVED SNOOZED RESOLVED EXPIRED CANCELLED`; drafted letters are in `detail`) |
| `GET /v1/items/{id}/draft?tone=ESCALATION\|FINAL_NOTICE\|NUDGE` | preview the letter as of today; stores and sends nothing |
| `POST /v1/webhooks/inbound-email` | see below. **Not** Firebase-authenticated |
| `GET /actuator/health` | public |

Errors are RFC 9457 `ProblemDetail`: 400 validation / bad plan, 401, 404, 409 (wrong state), 503 (Temporal unreachable
for operations that need it: create, snooze).

### Inbound email webhook

```
POST /v1/webhooks/inbound-email
X-Webhook-Secret: <app.inbound.secret>
{"from":"support@shop.example","to":"waiting+<token>@reply.example.com","subject":"Re: ...","text":"...","messageId":"<id>"}
```

* Auth: constant-time compare of `X-Webhook-Secret`; a **blank configured secret rejects everything** (fail closed).
  A Firebase token does not open this endpoint and the secret does not open the user API (separate security chain).
* Mapping: the item is found by the unguessable 80-bit token in the plus-address (`waiting+<token>@<domain>`),
  taken from the first matching recipient in `to`.
* Always `202` with `{matched, applied, itemId, classification}` (even for unknown addresses, so provider retries do not
  pile up). `messageId` makes provider retries idempotent (`applied:false` the second time).
* The reply is recorded on the timeline, the owner is notified, and the workflow is signalled with the classification.
* Provider payloads differ (Postmark, SendGrid, SES...): map them to the JSON above with a thin adapter, or add a second
  controller. Not shipped.

### Reply classification

`ReplyClassifier` is an interface; the default `RuleBasedReplyClassifier` is deterministic and offline: ordered regex
rules (pending -> refusal/negation -> needs-info -> future-tense promise -> completed payment), quoted history ignored.
First match wins; table-driven tests pin the behaviour. **Extension point for an LLM**: declare your own
`ReplyClassifier` bean and the default backs off. Recommended: constrain the model's answer to the four `ReplyOutcome`
values, set a timeout, and fall back to the rule-based result when the model errors or answers UNKNOWN (details in the
interface Javadoc). Not implemented here.

## Data model (`sql-jooq/.../db/migration/waiting_on*/`)

* `items`: owner_uid, title, counterparty, category, amount/currency, expected_by, status, outcome, `reply_token` (unique),
  `workflow_id` (unique), the four plan offsets, timestamps.
* `item_events`: append-only timeline, `seq` identity for ordering, `dedupe_key` unique per item so retried activities and
  provider retries cannot double-write.
* **Append-only is enforced by the database**: migration `waiting_on_ext/V2` adds triggers that reject `UPDATE`,
  `DELETE` and `TRUNCATE` on `item_events` (tested against real Postgres). It lives in a second Flyway location because the
  jOOQ DDL parser used for code generation does not read plpgsql.

## Running locally

1. Postgres (the platform one, port 5433): see the root `docker-compose.yml`.
2. A Temporal dev server (this service adds **nothing** to the root compose file):

   ```
   temporal server start-dev            # Temporal CLI: gRPC on 7233, Web UI on http://localhost:8233
   # or with Docker, no CLI install:
   docker run --rm -p 7233:7233 -p 8233:8233 temporalio/temporal:latest server start-dev --ip 0.0.0.0
   ```
3. Run the service:

   ```
   export FIREBASE_PROJECT_ID=<your firebase project id>
   export INBOUND_WEBHOOK_SECRET=$(openssl rand -hex 24)
   ./mvnw -pl waiting-on -am spring-boot:run
   ```
   Without a reachable Temporal server the app **refuses to start** with a short message telling you to start one or to
   set `TEMPORAL_ENABLED=false`. With `TEMPORAL_ENABLED=false` the API runs normally but nothing is followed up.
4. Tests: `./mvnw -pl waiting-on -am verify` (needs Docker for Postgres; needs **no** Temporal server). Optional real-server
   check: `REAL_TEMPORAL=true ./mvnw -pl waiting-on -am verify -Dtest=RealTemporalServerTest -Dsurefire.failIfNoSpecifiedTests=false`
   (pulls `temporalio/temporal`).

## Configuration

| property | env | default |
|---|---|---|
| `app.temporal.enabled` | `TEMPORAL_ENABLED` | `true` (false: no client/worker/workflows; `NoopFollowUpScheduler`) |
| `app.temporal.target` | `TEMPORAL_TARGET` | `127.0.0.1:7233` |
| `app.temporal.namespace` | `TEMPORAL_NAMESPACE` | `default` |
| `app.temporal.task-queue` | `TEMPORAL_TASK_QUEUE` | `waiting-on-follow-up` |
| `app.temporal.tls` | `TEMPORAL_TLS` | `false` (set true for Temporal Cloud; API keys / mTLS are not wired) |
| `app.temporal.connect-timeout` | `TEMPORAL_CONNECT_TIMEOUT` | `10s` |
| `app.inbound.secret` | `INBOUND_WEBHOOK_SECRET` | blank = webhook disabled |
| `app.inbound.reply-domain` | `REPLY_DOMAIN` | `reply.waiting-on.local` |
| `spring.datasource.*` | `DB_URL`, `DB_USER`, `DB_PASSWORD` | local platform Postgres |
| `app.firebase.project-id` | `FIREBASE_PROJECT_ID` | required at runtime |

## Tests

* `FollowUpWorkflowTest` (19): real workflow code on Temporal's time-skipping test server: nudge/escalate/final/expire at
  the planned days, optional final stage, query, resolve mid-wait cancels the timer and stores the outcome, cancel,
  snooze shifts the schedule (also after the nudge, accumulating, out-of-range ignored), each reply classification,
  item closed elsewhere, permanently failing notification.
* `RuleBasedReplyClassifierTest` (32, table-driven), `LetterTemplateEngineTest` (22, per category), `EscalationPlanTest`.
* `WaitingOnApiTest` (19): HTTP -> Postgres -> workflow end to end (lifecycle through nudge, escalation, expiry; resolve;
  snooze; cancel; webhook with bad/missing secret, user token on the webhook, PAID/REJECTED/NEEDS_INFO/UNKNOWN replies,
  duplicate message id; **cross-user isolation** on every endpoint; validation).
* `WaitingOnSchemaTest` (in `sql-jooq`): migrations on real Postgres, generated classes match, **UPDATE/DELETE/TRUNCATE on
  the timeline are rejected**, dedupe key, FK and check constraints.
* `TemporalWiringTest` (unreachable server gives a clear startup failure; disabled property skips the connection),
  `WaitingOnTemporalDisabledTest`, `WaitingOnReplyAddressesTest`, `RealTemporalServerTest` (opt-in, skipped by default).

## Honest limitations and next steps

* **Nothing is actually emailed.** `NotificationPort` has only a logging implementation (subjects only). A real one needs
  an email provider (outbound with the plus-address as Reply-To, plus owner push/email) and consistent behaviour for
  items without a `counterpartyEmail` (today: the nudge text goes to the log/owner path).
* **Letters are templates, not legal advice.** They cite example instruments (UK Consumer Rights Act 2015, EU Directive
  2011/83/EU, Insurance Act 2015, ICOBS...) and are jurisdiction-neutral; the preview response carries a reminder. The
  sender name is a placeholder (`[Your name]`) because this service has no user profile. Escalation letters are stored
  and the owner is notified; the user sends them.
* **Inbound trust**: anyone who learns an item's reply address can post a reply to it (spoofing). For production, have the
  provider verify SPF/DKIM/DMARC and pass the verdict, and consider matching the sender against `counterpartyEmail`.
  Auto-resolving on a PAID classification is a heuristic; the timeline shows why it happened and the user can see it.
* The workflow starts inside the create transaction; if Postgres then fails to commit, an orphan workflow is left behind
  that stops itself at its first activity (item not found). A start failure rolls the create back (503).
* Signals after commit are not transactional: resolve/cancel are best-effort signalled (see architecture); snooze and
  create fail loudly instead. There is no reconciler that restarts workflows lost with a wiped Temporal namespace.
* Workflow versioning (`Workflow.getVersion`) is not used yet; add it before changing the stage structure of a
  deployed workflow.
* Temporal Cloud auth (API key / mTLS) and Temporal metrics are not wired; `app.temporal.tls` only turns TLS on.
* No pagination metadata, no item editing, no attachments, no recurring items.
* The webhook accepts a provider-agnostic JSON shape only.
