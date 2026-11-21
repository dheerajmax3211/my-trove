# ask-your-life: hand-off

## Files created/changed OUTSIDE `ask-your-life/`

All inside `sql-jooq/`:

- `sql-jooq/src/main/resources/db/migration/ask_life/V1__init.sql` (placeholder V1 replaced): `documents`, `chunks`, `ingestion_jobs` in plain, jOOQ-parseable SQL.
- `sql-jooq/src/main/resources/db/migration/ask_life_ext/` (new folder, versions >= 100, not read by the jOOQ generator):
  - `V100__vector_extension.sql` (`create extension vector with schema public`)
  - `V101__chunk_search_columns.sql` (`chunks.embedding vector(384)`, generated `chunks.tsv`)
  - `V102__search_indexes.sql` (GIN on `tsv`, HNSW cosine on `embedding`)
  - `V103__app_role_and_rls.sql` (role `ask_life_app`, grants, ENABLE + FORCE RLS, policies)
- `sql-jooq/src/test/java/com/personalplatform/sql/AskLifeSchemaTest.java` (new; Testcontainers `pgvector/pgvector:0.8.0-pg16`, applies both locations).

**`sql-jooq/pom.xml` was NOT changed**: the `generate-ask_life` block needs no forcedTypes because the vector/tsvector columns live only in the ext
migrations and are addressed in code via `DSL.field` (`ChunkRepository.EMBEDDING`, raw SQL for `tsv`).

## Things the integrator must know

- `spring.flyway.locations` must list both `classpath:db/migration/ask_life` and `classpath:db/migration/ask_life_ext` (done in this module's `application.properties`); both share `ask_life.flyway_schema_history`.
- The shared dev/prod Postgres must run an image/build that has **pgvector >= 0.8.0** (uses `hnsw.iterative_scan`). Local docker-compose Postgres (`docker-compose.yml`, not edited by me) needs e.g. `pgvector/pgvector:0.8.0-pg16`.
- The Flyway/connection user needs permission to `CREATE EXTENSION vector` and `CREATE ROLE` (superuser locally). Otherwise pre-create the extension and role `ask_life_app` (NOLOGIN, no superuser, no BYPASSRLS) and grant the role to the application login (V103 skips creation if it exists).
- The service switches role per transaction (`SET LOCAL ROLE ask_life_app`, property `app.rls.role`). If the app's datasource logs in as a non-superuser that is a member of the role, this works as is. RLS is bypassed if the connection is a superuser/BYPASSRLS role *and* `app.rls.role` is blank.
- Roles are cluster-wide: `ask_life_app` is shared by every database in the cluster; a second database would re-use it.
- Security uses platform-security's default chain and Firebase `JwtDecoder` unchanged (no custom `SecurityFilterChain` declared).
- Tests use a settable `Clock` and a stub `JwtDecoder` (token = base64url of the uid); background poller disabled via `app.ingest.scheduler-enabled=false` in tests.
- Embedding dimension is fixed to 384 by the schema; changing it needs a new ext migration and a re-index.
