# family-treasury (port 8088, Postgres schema `treasury`)

A shared household money pool (family fund, trip pot, kids' allowances) with real accounting guarantees: approvals for
big spends, scheduled allowances, and a ledger that cannot silently go wrong.

**This is NOT a payments product.** It records money the family already holds or moves somewhere else. There is no card,
bank or payment-provider integration and no real money ever moves. It is a bookkeeping service; "spend" means "record that
we spent".

## Architecture

```
 REST /v1 (Firebase JWT, household membership checks)            background jobs (scheduler.enabled)
        |                                                          allowances / approval expiry / reconciliation
        v                                                                   |
  Controllers --> TreasuryOps / ApprovalService / AllowanceService / HouseholdService
                     |  each operation = ONE DB transaction:
                     |   1. IdempotencyService   claim (scope, Idempotency-Key) -> replay / 409 / proceed
                     |   2. membership + role checks
                     |   3. LedgerEngine.post    ORDER BY id FOR UPDATE on account_balances rows, overdraft check,
                     |                           insert journal_entries + postings, update account_balances
                     v
  Postgres  accounts | journal_entries | postings (append-only) | account_balances (projection)
            idempotency_records | approval_requests | allowance_schedules/_runs | households/household_members
            + triggers: balanced entries (deferred), append-only, balance side, account identity
  Read side: StatementService (window-function running balance, CSV)   ReconciliationService (projection vs SUM(postings))
```

## The heavy-tech pieces and why

* **Double-entry ledger with DB-enforced invariants.** Signed `BIGINT` minor units (positive = debit, negative = credit),
  never floating point. In `treasury_ext/V100` a *deferred constraint trigger* fires at COMMIT and rejects any entry that
  has fewer than 2 postings, a different number of postings than it declared (`line_count`), or a non-zero sum **per
  currency** (so +5 USD / -5 EUR is rejected). Postings and entries are append-only (UPDATE/DELETE/TRUNCATE rejected by
  triggers). A posting's currency and household must match its account's through composite foreign keys, so a posting can
  never name another household's account. Why: a family ledger is only worth anything if no bug, script or future service
  can quietly unbalance it.
* **Reversal entries instead of edits.** A reversal is a new entry with every amount negated and `reverses_entry_id` set
  (UNIQUE in the DB). An entry can be reversed once; a reversal cannot be reversed; concurrent reversals are serialised by a
  row lock on the original entry.
* **Idempotency keys.** Every POST needs an `Idempotency-Key`. The record `(scope, key, request_hash, status, response)` is
  inserted in the same transaction as the operation, so it exists iff the operation committed. Replay returns the original
  status and body (`Idempotent-Replayed: true`); same key + different body (or a different operation) is `409`; concurrent
  duplicates collide on the primary key and the loser waits then replays. Failed operations are not recorded, so a
  `422` can be retried with the same key. The ledger additionally has `UNIQUE (household_id, idempotency_key)` as a backstop.
* **CQRS read model with row-locked projection.** `account_balances` is updated **in the same transaction** as the postings
  insert (chosen over an outbox/projector because it gives read-your-writes and makes overdraft checks possible; the cost
  is that postings to one account serialise on its row lock). The engine locks all touched balance rows with one
  `SELECT ... ORDER BY account_id FOR UPDATE` (deterministic order, no deadlocks), reads the balance after locking, then
  checks it. A trigger on `account_balances` repeats the "non-negative account" rule as a backstop.
* **Reconciliation.** `GET /v1/households/{id}/reconciliation` (OWNER/APPROVER) compares every `account_balances.balance`
  with `SUM(postings.amount)` and checks each currency of the household ledger sums to zero, in one REPEATABLE READ
  snapshot. Drift is reported per account (including a missing projection row), never silently "fixed". A scheduled job runs
  it for all households and logs at ERROR on drift.
* **Allowances with `FOR UPDATE SKIP LOCKED`.** A runner claims one due schedule at a time (own transaction each), so
  concurrent runners/instances skip each other's rows. Exactly-once per (schedule, period) by three guards: the row lock,
  `allowance_runs` primary key `(schedule_id, period_start)`, and the deterministic ledger key `allowance:<schedule>:<period>`.
* **Approval workflow.** A `spend` strictly above the household threshold returns `202 PENDING_APPROVAL` and writes **no
  ledger entry**. A different OWNER/APPROVER approves; approval posts the entry and flips the status in one transaction
  under a row lock. Reject, withdraw (by the requester) and expiry close it.
* **Money value type.** `Money(long minor, currency)` with overflow-checked arithmetic and largest-remainder allocation
  (BigInteger, deterministic tie-break by index) that always sums exactly; used for split expenses.

## Rules worth knowing

* Sign convention and natural balances: ASSET/EXPENSE are debit-normal, LIABILITY/EQUITY/INCOME credit-normal. API
  `balanceMinor` is on the natural side (healthy = positive); `rawBalanceMinor` is the signed sum of postings.
* Accounts with `allowNegative=false` can never end on the wrong side of zero (spend, transfer, split, reversal, allowance).
* Roles: OWNER (everything incl. members, settings, schedules), APPROVER (approve, reverse, create accounts, move money out
  of household-level accounts), MEMBER (deposit, spend subject to threshold, move money out of own pot), KID (only their own pot;
  no deposits, entries or reports). OWNER and APPROVER can both approve; nobody can approve their own request. A split may only
  draw on member pots (never the pool) and a transfer out of a household-level account needs OWNER/APPROVER, so the approval
  threshold cannot be bypassed by hopping money through a pot with MEMBER rights.
* Outsiders get `404` for every household resource (existence is not leaked); a too-weak role gets `403`; resource ids from
  another household resolve as `404`.
* **Missed allowance periods policy:** if several periods are due, only the *latest* is paid and each earlier one is recorded
  `SKIPPED` (never back-paid). A period that cannot be funded is recorded `FAILED` and not retried. Schedules cannot start in the
  past. Periods are evaluated in UTC against the injected `Clock`; monthly periods stay anchored to the original day (Jan 31 ->
  Feb 28 -> Mar 31).
* Approval expiry: a request whose `expires_at <= now` is reported and treated as `EXPIRED` immediately; a sweep persists the status.
* Membership lives in `household_members`, a table **owned by this service** for this slice. A later integration should source
  membership from shared-service.

## Endpoints (all under `/v1`, Bearer Firebase ID token)

| Method & path | Notes |
|---|---|
| `POST /households` | idempotent; creates household, caller = OWNER, accounts `POOL`, `INCOME:DEPOSITS`, `EXPENSE:GENERAL`, `POT:<uid>` |
| `GET /households`, `GET /households/{h}` | mine / detail with members and balances |
| `PUT /households/{h}/settings` | OWNER: approval threshold (null = off) and expiry hours |
| `GET/POST /households/{h}/members`, `PUT .../members/{uid}/role` | OWNER manages; adding a member creates their pot |
| `GET/POST /households/{h}/accounts`, `GET .../accounts/{a}` | OWNER/APPROVER create (categories, extra pots) |
| `POST /households/{h}/deposits` `/spends` `/transfers` `/splits` | **require `Idempotency-Key`**; spend returns 201 or 202 |
| `POST /households/{h}/entries/{e}/reverse` | OWNER/APPROVER, requires key |
| `GET /households/{h}/entries[/{e}]` | journal entries with postings (not for KIDs) |
| `GET /households/{h}/approvals[?status=]`, `GET .../approvals/{a}`, `POST .../approvals/{a}/approve` `/reject` | approve/reject require key |
| `POST/GET /households/{h}/allowance-schedules`, `GET .../{s}/runs`, `DELETE .../{s}` | OWNER manages |
| `GET /households/{h}/accounts/{a}/statement?from&to&page&size` | paged, running balance (window function); `from` inclusive, `to` exclusive |
| `GET /households/{h}/accounts/{a}/statement.csv` | CSV export (formula-injection neutralised) |
| `GET /households/{h}/reconciliation` | projection vs ledger |

Errors are RFC 9457 `ProblemDetail` with a stable `code` (e.g. `INSUFFICIENT_FUNDS`, `IDEMPOTENCY_KEY_REUSED`, `SELF_APPROVAL`,
`ALREADY_REVERSED`).

## Run locally

```
docker compose up -d postgres            # root docker-compose.yml, Postgres on 5433 (or point DB_URL elsewhere)
FIREBASE_PROJECT_ID=<your-project> ./mvnw -pl family-treasury -am spring-boot:run
./mvnw -pl family-treasury -am verify    # tests need Docker (Testcontainers)
```

Config (env vars): `DB_URL`, `DB_USER`, `DB_PASSWORD`, `FIREBASE_PROJECT_ID`, `TREASURY_SCHEDULER_ENABLED` (default true),
`TREASURY_ALLOWANCE_DELAY`, `TREASURY_EXPIRY_DELAY`, `TREASURY_RECONCILIATION_DELAY` (ISO-8601 durations).
Flyway runs two locations that share one history table: `db/migration/treasury` (tables, read by the jOOQ generator) and
`db/migration/treasury_ext` (plpgsql invariants, versions >= 100).

## Honest limitations and next steps

* No money movement of any kind; multi-currency households are supported only in that accounts have a currency and every
  entry is single-currency (no FX, no cross-currency transfers).
* The invariants are only as strong as the database role: an owner/superuser can `ALTER TABLE ... DISABLE TRIGGER`. Run the
  service with a role that does not own the tables, and rely on reconciliation as the detector.
* Postings to the same account serialise on one row lock (correct, and fine for household scale, not for high-volume ledgers).
* Statement pages order by `(posted_at, seq)`; sequence values are assigned at insert, so under heavy concurrency a lower `seq`
  can commit after a higher one and a page read in between may not show it yet (later reads are correct).
* Reconciliation reports drift but has no repair/rebuild command; a rebuild-projection admin action is a next step.
* Allowance timing uses UTC dates, not a per-household time zone. Approval thresholds apply to `spend` only (not deposits,
  transfers, splits). Approval expiry is lazily derived plus a 5-minute sweep.
* Membership is a local table (see above); authorisation of the Firebase uid -> member mapping is not yet shared with other services.
* Entry listing is offset-paged; no search/export of entries; no notifications on pending approvals.
* The reconciliation job and allowance scheduler have been tested by calling the services directly, not by waiting for the
  `@Scheduled` triggers.
