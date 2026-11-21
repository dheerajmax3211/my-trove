# family-treasury handoff

Files created or changed OUTSIDE `family-treasury/`:

| Path | What |
|---|---|
| `sql-jooq/src/main/resources/db/migration/treasury/V1__init.sql` | replaced the placeholder: all treasury tables (jOOQ-parseable SQL) |
| `sql-jooq/src/main/resources/db/migration/treasury_ext/V100__ledger_invariants.sql` | NEW folder: plpgsql functions, deferred constraint triggers, append-only triggers, balance-side and account-identity triggers |
| `sql-jooq/src/test/java/com/personalplatform/sql/TreasurySchemaTest.java` | NEW: Testcontainers test of the generated classes and every DB-level invariant (15 tests) |

`sql-jooq/pom.xml` was NOT changed: the existing `generate-treasury` block already reads only `db/migration/treasury/*.sql`
(the sibling `treasury_ext` folder is not matched by that glob).

Assumptions the integrator must know:

* `spring.flyway.locations` of this service lists BOTH `classpath:db/migration/treasury` and `classpath:db/migration/treasury_ext`;
  they share one `flyway_schema_history` in schema `treasury`. Parseable-table migrations must stay below version 100, otherwise
  Flyway reports an out-of-order migration on databases that already applied V100.
* The service owns `treasury.household_members` (roles OWNER/APPROVER/MEMBER/KID) for this slice. Replace it with a lookup into
  shared-service when that integration exists; all membership access goes through `HouseholdService.requireMember/requireRole`.
* Caller identity is the Firebase uid (`jwt.getSubject()`), stored as `varchar(128)`; no uid is validated against auth-service.
* Tests need Docker (Testcontainers, image `postgres:16`). The scheduler is disabled in tests via `treasury.scheduler.enabled=false`.
* No changes were made to the root pom (the `family-treasury` module was already listed) or to any other service.
* The application role should NOT own the treasury tables in production (owners can disable the invariant triggers).
