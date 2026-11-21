# shared-service

Port **8082**, Postgres schema **`shared`**. The platform capabilities every product reuses so products stay thin:

1. **Households and membership**: roles OWNER/MEMBER, single-use expiring invite codes, last-owner protection, and one reusable "is caller a member (with role Y)?" check.
2. **Reminder and notification engine**: personal or household reminders with DAILY/WEEKLY/MONTHLY recurrence, a multi-instance-safe scheduler, a transactional outbox and a pluggable `NotificationSender`, with retries, backoff and a dead-letter state.
3. **File metadata service**: metadata in Postgres, bytes behind a `BlobStore` (local filesystem implementation), HMAC-signed expiring download links.
4. **Audit log**: append-only `audit_events`, immutability enforced by a Postgres trigger, paged read API.

## Architecture

```
                    Firebase ID token (platform-security, stateless)
                                   |
   REST /v1  --->  Controllers  ->  Services (@Transactional, jOOQ)  ->  Postgres schema `shared`
                                        |   \
                       HouseholdAccess  |    AuditService.record()  (same tx as the action)
                       (membership rule)|
                                        v
   scheduler (@Scheduled, any number of instances)
     ReminderEngine.fireDue():  tx { SELECT .. FOR UPDATE SKIP LOCKED  -> INSERT notifications (outbox)
                                       -> advance due_at | mark COMPLETED }            (one commit)
     NotificationRelay.dispatchDue(): per row tx { claim PENDING (SKIP LOCKED) -> NotificationSender.send()
                                       -> SENT | retry with backoff | DEAD }
                                                       |
                                          NotificationSender (interface)
                                           +- LoggingNotificationSender (default)
                                           +- your FCM / email sender (bean)
   files:  FileService -> BlobStore (interface) -> LocalFsBlobStore ; DownloadTokenService (HMAC-SHA256)
```

Packages: `household`, `reminder`, `file`, `audit`, `common` (errors, security chain, clock).

## Heavy-tech pieces and why they are justified

| Piece | Why |
|---|---|
| `SELECT ... FOR UPDATE SKIP LOCKED` claiming | Several service instances poll the same table. Locks make a claim exclusive, and SKIP LOCKED means an instance takes other rows instead of waiting. No external lock service or leader election is needed. |
| Transactional outbox (`notifications`) | "Fire the reminder" and "advance the schedule" must be atomic with "a notification exists". Sending to FCM or email inside that transaction would couple DB locks to a network call and could double-send on rollback. Delivery is therefore a separate, retryable step reading durable rows. |
| Unique `(reminder_id, occurrence_at, recipient_uid)` | Second line of defence: even a bug cannot create two notifications for one occurrence. |
| Retry with exponential backoff + DEAD state | Providers fail transiently. Dead-lettering stops a poison notification from retrying forever and leaves it inspectable (`last_error`, `attempts`). |
| DB trigger for audit immutability | An application-level "we never update it" is not a guarantee. The trigger rejects UPDATE, DELETE and TRUNCATE for every client, including future services and ad-hoc SQL. It lives in `db/migration/shared_ext` because the jOOQ generator cannot parse plpgsql. |
| HMAC-signed expiring download tokens | Lets a client or `<img>` tag fetch a file without a bearer header, with no per-download DB write, no cloud SDK, and tamper/expiry rejected statelessly. |
| `BlobStore` interface | Keeps S3/GCS a drop-in later. Only the local implementation exists. |

## Authorization model

* Every query is scoped to the caller's Firebase uid (`jwt.getSubject()`) or to a household the caller belongs to.
* **Non-member or unknown id -> 404** (existence is not leaked). **Member without enough role -> 403.**
* `HouseholdAccess.requireMember(uid, householdId)` / `requireRole(uid, householdId, Role.OWNER)` is the single check. **Other services should mirror it** in one of two ways:
  * same Postgres: `select role from shared.household_members where household_id = ? and member_uid = ?` (present = member; OWNER > MEMBER);
  * over HTTP: call `GET /v1/households/{id}/membership` with the caller's own token (200 `{householdId, uid, role}` or 404).
* Visibility: personal items (reminders, files) are visible only to their owner. Household items are visible to all members. Changing or deleting someone else's household reminder or file needs household OWNER.

## Endpoints (all under `/v1`, bearer Firebase token unless noted)

| Method and path | Notes |
|---|---|
| `POST /households` `{name}` | creator becomes OWNER |
| `GET /households`, `GET /households/{id}` | mine / detail with members |
| `DELETE /households/{id}` | OWNER; cascades reminders, files (blobs removed), invites. Audit rows remain. |
| `GET /households/{id}/membership` | the reusable membership check |
| `POST /households/{id}/invites` `{role?, ttlHours?}` | OWNER. Returns the plaintext `code` once (only its SHA-256 is stored). Default TTL 7 days, max 30. |
| `GET /households/{id}/invites`, `DELETE /households/{id}/invites/{inviteId}` | OWNER: list pending / revoke |
| `POST /invites/accept` `{code}` | single-use, expiring; 410 if invalid/used/expired; 409 if already a member (code is not consumed) |
| `POST /households/{id}/leave` | 409 if you are the last OWNER |
| `DELETE /households/{id}/members/{uid}` | OWNER; cannot remove the last OWNER |
| `PUT /households/{id}/members/{uid}/role` `{role}` | OWNER; cannot demote the last OWNER |
| `POST /reminders` `{title, dueAt, recurrence?{unit,interval}, householdId?}` | `unit` is DAILY, WEEKLY or MONTHLY |
| `GET /reminders?householdId=&status=`, `GET /reminders/{id}` | no `householdId` = personal + all my households |
| `PUT /reminders/{id}`, `POST /reminders/{id}/cancel` | creator or household OWNER |
| `GET /notifications?status=` | my notification inbox (outbox rows addressed to me) |
| `POST /files` multipart `file`, optional `householdId` | stores bytes, computes size and SHA-256 |
| `GET /files?householdId=`, `GET /files/{id}`, `DELETE /files/{id}` | |
| `POST /files/{id}/download-link` `{ttlSeconds?}` | returns `{token, url, expiresAt}` (default 10 min, max 1 h) |
| `GET /files/download?token=` | **no bearer needed**; the token is the capability. Tampered, malformed and expired all give the same 403. |
| `GET /audit?householdId=&action=&page=&size=` | household feed (any member) or, without `householdId`, my personal events. Newest first. |
| `GET /actuator/health` | public |

Errors are RFC 9457 `ProblemDetail` JSON.

## Behaviour worth knowing

* **Recurrence** is computed in UTC from a fixed anchor (`anchor_at` = the due time when set), so monthly on the 31st gives Jan 31, Feb 28, Mar 31 with no drift. After downtime, missed occurrences are skipped: one notification is fired for the overdue occurrence and the next occurrence is the first anchor-aligned time strictly after "now". Editing a reminder re-anchors it.
* **Household reminders** fan out one notification per member at fire time. Reminders themselves are not deleted when a member leaves.
* **Delivery is at-least-once.** If the process dies after `send()` but before the status commit, the row is sent again. `NotificationSender.Message.id()` is stable for de-duplication.
* **Audit** rows are written in the same transaction as the action (rolled back together). Actions logged: household create/delete, invite create/revoke, member join/leave/remove/role change, reminder create/update/cancel, file upload/delete/download-link issued.

## Run locally

```
docker compose up -d postgres          # repo root: Postgres on :5433
export FIREBASE_PROJECT_ID=<your-firebase-project>
export FILE_TOKEN_SECRET=$(openssl rand -hex 32)   # >= 32 chars; stable across instances
./mvnw -pl shared-service -am spring-boot:run
```

Tests need Docker (Testcontainers, `postgres:16`). With Colima:

```
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
./mvnw -pl shared-service -am verify
```

## Configuration (env vars, safe local defaults)

| Env var | Property | Default |
|---|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | `spring.datasource.*` | `jdbc:postgresql://localhost:5433/platform`, `platform`, `platform` |
| `FIREBASE_PROJECT_ID` | `app.firebase.project-id` | empty (required at runtime) |
| `FILE_TOKEN_SECRET` | `app.files.token-secret` | empty = random per process with a warning (links die on restart and do not work across instances) |
| `FILES_ROOT` | `app.files.local-root` | `./data/blobs` |
| `FILE_TOKEN_TTL` | `app.files.default-token-ttl` | `PT10M` (max `PT1H`) |
| `MAX_UPLOAD_SIZE` | `spring.servlet.multipart.max-*` | `10MB` |
| `SCHEDULER_ENABLED` | `app.scheduler.enabled` | `true` |
| `SCHEDULER_POLL_INTERVAL` | `app.scheduler.poll-interval` | `PT5S` |
| `SCHEDULER_BATCH_SIZE` | `app.scheduler.batch-size` | `50` |
| `NOTIFICATION_MAX_ATTEMPTS` | `app.scheduler.max-attempts` | `5` |
| `NOTIFICATION_BASE_BACKOFF`, `NOTIFICATION_MAX_BACKOFF` | `app.scheduler.*-backoff` | `PT30S`, `PT1H` |
| `NOTIFICATION_SENDER` | `app.notifications.sender` | `logging`. Set to anything else when you supply your own `NotificationSender` bean. |

## Adding an FCM or email sender

Implement `NotificationSender` (`void send(Message m) throws Exception`), expose it as a `@Component`, and set `NOTIFICATION_SENDER=fcm` so the logging sender backs off. Throw to signal failure; the relay handles retries and dead-lettering. Device-token or email lookup is not part of this slice.

## Migrations

`sql-jooq/src/main/resources/db/migration/shared/V1__init.sql` is parsed by the jOOQ generator (no plpgsql there). `.../shared_ext/V100__audit_events_immutable.sql` holds the trigger. Flyway runs both locations (`spring.flyway.locations`). Keep numbering: `V1..V99` in `shared/`, `V100+` in `shared_ext/`, so history stays ordered.

## Limitations and next steps (honest list)

* The audit trigger blocks every ordinary client, but a Postgres superuser or table owner can still `ALTER TABLE ... DISABLE TRIGGER`. For stronger guarantees, run the app as a role that is not the table owner and revoke `UPDATE, DELETE, TRUNCATE` on `shared.audit_events`; no hash-chaining or external anchoring is implemented.
* The relay holds a row lock on one notification while calling `send()`. A very slow sender delays only that row, but a sender hang beyond the DB's lock/connection timeouts is not guarded; add a sender timeout when plugging a real provider.
* No device/email registry, no push payload templating, no user notification preferences or quiet hours.
* Recurrence is UTC only (no per-user time zone / DST awareness) and only DAILY/WEEKLY/MONTHLY with an interval. No end date, count or "completed" tracking per occurrence.
* `LocalFsBlobStore` is single-node disk: multiple instances need a shared volume, or an S3/GCS `BlobStore`. No virus scanning, no content-type sniffing (downloads are forced to `attachment` with `nosniff`), no resumable or chunked upload, no quota. The SHA-256 is recorded at upload but not re-verified on download.
* Download tokens are bearer capabilities: anyone holding an unexpired link can download, and they cannot be revoked individually before expiry (deleting the file does invalidate them). Keep TTLs short.
* The audit read API pages with offset/limit (fine for a household-sized log; use keyset pagination for very large logs). Any household member can read the household audit feed.
* Household deletion removes files' blobs best-effort (a failed blob delete is logged, not retried).
* Invite codes have 144 bits of entropy but there is no redemption rate limiting on `POST /invites/accept`.
* Not verified: behaviour against a real Firebase token (tests use a stub decoder), multi-node deployment, and load or performance.
