# ask-your-life

One private search box across your own notes, documents, receipts and e-mails. Every user's content is strictly
isolated. Port **8086**, Postgres schema **`ask_life`**, Spring Boot 4.1.2 / Java 21 / jOOQ / Postgres + pgvector.

## Architecture

```
                    POST /v1/documents (text/plain|markdown|html, json, multipart)
                                   |
                         DocumentService  --(one transaction)-->  documents row  +  ingestion_jobs row  (outbox)
                                                                                         |
                                  IngestionScheduler -> IngestionWorker  <---------------+  claim: UPDATE ... WHERE id =
                                    1. claim job (FOR UPDATE SKIP LOCKED, lease)             (SELECT ... FOR UPDATE SKIP LOCKED)
                                    2. read content           (owner scope)
                                    3. Chunker  -> Embedder.embedAll   (no tx, no locks held)
                                    4. ONE tx: lock doc, check hash, DELETE old chunks, INSERT new, mark job DONE
                                    on error: backoff retry (10s, 20s, 40s ... cap 15m) -> after N attempts DEAD + doc FAILED
                                                                                         |
   GET /v1/search?q=&k=&mode=hybrid|keyword|semantic                                chunks (text, tsv, embedding vector(384))
                                   |                                                     ^
                         SearchRepository: ONE statement (CTEs)                          |
                           fts  = top-N by ts_rank_cd(websearch_to_tsquery)  ------------+  GIN(tsv)
                           sem  = top-N by cosine distance to query vector   ------------+  HNSW(embedding)
                           fused = FULL OUTER JOIN, score = 1/(60+rank_fts) + 1/(60+rank_sem)   (RRF)
                           best chunk per document, ts_headline snippet, top k
   every repository call:  OwnerScope = BEGIN; SET LOCAL ROLE ask_life_app; set_config('app.owner_uid', uid, true)
                           -> Postgres RLS policies (documents, chunks) compare owner_uid to that setting
```

Package layout (`com.personalplatform.askyourlife`): `chunking` (pure `Chunker`), `embedding` (`Embedder`,
`HashingEmbedder`, `HttpEmbedder`), `extract` (`TextExtractor` plug-ins), `rls` (`OwnerScope`), `document`
(API + service + repository), `ingest` (queue, worker, chunk writes), `search`, `config`, `web` (ProblemDetail errors).

## The heavy-tech pieces and why they are justified

| Piece | Why |
|---|---|
| **pgvector + Postgres FTS, fused with RRF** | Keyword search misses paraphrase/typos; vector search misses exact identifiers ("INV-2231"). Fusing *ranks* (not scores) needs no score calibration between a `ts_rank` and a cosine similarity. Both lists, the fusion and the per-document de-duplication run in one SQL statement, so there is one round trip and the fusion is testable in SQL. |
| **Outbox / job queue with `SKIP LOCKED`** | Embedding is slow and may call a network service; it must not run inside the upload request nor hold DB locks. Writing the document and its job in one transaction means a document can never exist without being scheduled. `SKIP LOCKED` lets any number of workers/instances poll without blocking each other or double-processing; leases recover from crashed workers; backoff + dead letter keep a poison document from looping. |
| **Atomic chunk replacement** | Re-indexing deletes and re-inserts a document's chunks in one transaction under a row lock on the document, and only if the content hash is still the one that was embedded. Readers see the old chunk set until the instant the new one is committed; stale jobs write nothing. |
| **Row-level security** | Per-user isolation is enforced twice: by explicit `owner_uid = ?` predicates in every query and by the database. A forgotten predicate returns nothing instead of leaking another user's notes. |

## Endpoints (all require a Firebase ID token except `/actuator/health`)

| Method & path | Notes |
|---|---|
| `POST /v1/documents` | `Content-Type: text/plain`, `text/markdown` or `text/html` with the text as body (`?title=&sourceType=NOTE\|FILE\|EMAIL\|RECEIPT&externalId=`); or `application/json` `{title,text,sourceType,mimeType,externalId}`; or `multipart/form-data` with part `file` (+ optional `title`, `sourceType` default FILE, `externalId`). **202** `{outcome:"CREATED"\|"UPDATED", document}` (indexing is asynchronous, status `PENDING`), **200** `{outcome:"DUPLICATE"}` when the owner already has identical content (SHA-256 of the extracted, normalised text) or the same `externalId` with the same content. Same `externalId` + new content updates the document in place and re-queues it. 413 over `app.ingest.max-bytes`, 415 for unsupported types (PDF, see below), 409 if the new content equals another document of yours. |
| `PUT /v1/documents/{id}` | JSON `{title?, text, mimeType?}` replace content. |
| `GET /v1/documents`, `GET /v1/documents/{id}` | List (`sourceType`, `limit`, `offset`) / fetch metadata + `status` (`PENDING`, `INDEXED`, `FAILED`) + `chunkCount`. |
| `DELETE /v1/documents/{id}` | 204; chunks and jobs are removed by `ON DELETE CASCADE`. |
| `GET /v1/search?q=&k=&mode=` | `mode=hybrid` (default) `keyword` `semantic`; `k` 1-50 (default 10); filters `sourceType` (repeatable), `from` (inclusive) / `to` (exclusive) ISO-8601 instants on document creation time; `debug=true` adds, per hit, `explain: {ftsRank, semanticRank, ftsScore, semanticSimilarity}` plus the fusion parameters. `q` accepts web-search syntax (`"phrase"`, `-exclude`, `or`). One hit per document (its best chunk) with `score`, `title`, `snippet`. |
| `GET /v1/search/explain?q=...` | Same as search with `debug=true` forced. |

`snippet` is HTML-safe: document text is escaped (`& < >`) before `ts_headline`, and matches are wrapped in `<mark>...</mark>`.

Errors are RFC 9457 `ProblemDetail` (`400` validation, `404` also for other users' ids, `409`, `413`, `415`).

### Extraction

`TextExtractor` beans are picked by media type: plain text (and other `text/*`), Markdown (syntax stripped, words kept), HTML
(scripts/styles/tags removed, entities decoded). **PDF is deliberately an extension point**: register a
`TextExtractor` bean for `application/pdf` (e.g. Apache PDFBox `PDFTextStripper`); until then PDF uploads get a clear 415.
No OCR.

### Chunker

Pure and deterministic. Token = whitespace-delimited word, except each CJK ideograph/kana counts as one token. Paragraphs
(blank lines) -> sentences (after `. ! ? ...` + whitespace, full-width CJK terminators, and every line break) -> greedy packing up to
`app.ingest.chunk-max-tokens` (180). A chunk flushes early at a paragraph boundary when >= 60% full and the next
paragraph would not fit. The next chunk starts with the trailing whole sentences of the previous one that fit in
`chunk-overlap-tokens` (30); a sentence longer than the maximum is cut into disjoint max-size pieces (no overlap
inside such a cut). Chunk text is a verbatim slice of the input; code points are never split.

### Embedders

`Embedder` interface (`embedAll(List<String>)`, `dimension()`). Default: **`HashingEmbedder`** (hashing trick over word unigrams,
bigrams and character trigrams, signed buckets, sub-linear tf, L2-normalised; deterministic across JVMs; pinned by a
golden-value test). It is **lexical, not a language model**: it tolerates typos/inflection but does not know that "car" and
"automobile" are related. Set `app.embedder.http.url` to use **`HttpEmbedder`** (OpenAI-style `POST {model, input:[...]}` ->
`{data:[{index, embedding}]}`), which batches by `app.embedder.http.batch-size`, validates counts and dimension and normalises.
The column is `vector(384)`: the application refuses to start if `app.embedder.dimension` is not 384.

## Row-level security: what it does and does not give

Set-up (migration `V103`): non-superuser role `ask_life_app` (NOLOGIN, NOBYPASSRLS), `ENABLE` + `FORCE ROW LEVEL SECURITY` on
`documents` and `chunks`, policies `owner_uid = current_setting('app.owner_uid', true)` for both `USING` and `WITH CHECK`
(unset -> NULL -> no rows: fail closed). `OwnerScope` opens every transaction with `SET LOCAL ROLE ask_life_app` and
`set_config('app.owner_uid', uid, true)`; both are transaction-local so pooled connections cannot leak an owner.
A superuser or `BYPASSRLS` role ignores RLS, which is why the tests run (and the service should run) as `ask_life_app`; the
tests prove isolation with a real login connection and hand-written `select * from chunks`.
`ingestion_jobs` has no RLS (the worker claims across owners) and holds no document text.

**Threat model.** RLS protects against *application bugs*: a missing `WHERE owner_uid`, a forgotten filter in a new query, a
mis-scoped join. It also limits what a SQL-injection in a repository query could read, *if* the injected SQL cannot change the setting.
It does **not** protect against: anyone with the database superuser/owner credentials, backups or disk snapshots, DBAs, a
compromised application process (it can set `app.owner_uid` to any value, as can any SQL it can execute), or the embedding service
(chunk text is sent to it when `HttpEmbedder` is used). Data is plaintext in Postgres.

**"Encrypted per-user indexes" are NOT built.** Full-text and vector indexes must operate on plaintext (or on embeddings, which leak
much of the content), so encrypting the indexes per user is not possible with Postgres FTS/pgvector. Path to something stronger:
(1) encrypt `documents.content` and `chunks.content` with a per-user data key (envelope encryption, KMS-wrapped, key held only for the
session/request) and keep tsv/embeddings as the only plaintext derivatives; (2) shorten exposure by storing tsv with a keyed
tokenisation (HMAC of lemmas) which supports exact-term search but not stemming/phrase/highlight server-side; (3) for true
confidentiality against the operator, move embedding and search to the client or a TEE and store only ciphertext + client-built index.
Each step trades search quality or server-side snippets for confidentiality.

**RLS and indexes (measured behaviour).** The HNSW index is used for the vector list under RLS. The GIN index on `tsv` is **not** usable by
the RLS-restricted role: `@@` is not "leakproof", so Postgres will not push it below the policy qualification. The keyword list therefore uses the
per-owner btree index (`chunks_owner_idx`) and filters `tsv @@ query` on that owner's rows: cost grows with *one user's* chunk
count, which is fine for personal corpora (thousands to low tens of thousands of chunks) but is the first thing to revisit at scale (options: a
leakproof wrapper function installed by a superuser, or per-owner partitioning). The test `SearchIndexUsageTest` pins this.

## Running locally

```
# Postgres with pgvector on 5433 (the platform docker-compose Postgres must use a pgvector image, e.g. pgvector/pgvector:0.8.0-pg16)
export DB_URL=jdbc:postgresql://localhost:5433/platform DB_USER=platform DB_PASSWORD=platform
export FIREBASE_PROJECT_ID=<your project>
./mvnw -pl ask-your-life spring-boot:run
```
The Flyway user must be able to `CREATE EXTENSION vector` and `CREATE ROLE` (a superuser locally). With a locked-down production login,
create the extension and role `ask_life_app` out of band (the migration skips role creation if it exists) and grant it to the app login.

## Configuration

| Property / env | Default | Meaning |
|---|---|---|
| `DB_URL` `DB_USER` `DB_PASSWORD` | local platform DB | datasource |
| `FIREBASE_PROJECT_ID` | none (required) | accepted token audience |
| `EMBEDDER_URL` (`app.embedder.http.url`) | blank = hashing embedder | HTTP embeddings endpoint |
| `EMBEDDER_MODEL`, `EMBEDDER_API_KEY`, `EMBEDDER_BATCH_SIZE` | blank, blank, 32 | HTTP embedder |
| `app.embedder.dimension` | 384 | must equal the schema |
| `INGEST_SCHEDULER_ENABLED` (`app.ingest.scheduler-enabled`) | true | run the polling worker in this instance |
| `app.ingest.max-bytes` | 2 MiB | largest document |
| `app.ingest.chunk-max-tokens` / `chunk-overlap-tokens` | 180 / 30 | chunking |
| `app.ingest.max-attempts` / `base-backoff` / `max-backoff` / `lease` | 5 / 10s / 15m / 5m | retries, dead letter, crash recovery |
| `app.ingest.poll-interval` / `jobs-per-poll` | 2s / 20 | worker cadence |
| `RLS_ROLE` (`app.rls.role`) | `ask_life_app` | role for `SET LOCAL ROLE`; blank if the datasource already logs in as it |
| `app.search.rrf-k` / `candidate-pool` / `min-semantic-similarity` / `hnsw-ef-search` | 60 / 100 / 0 (off) / 40 | retrieval |

## Tests (real Postgres: `pgvector/pgvector:0.8.0-pg16`, tag verified to pull)

`ChunkerTest`, `HashingEmbedderTest`, `HttpEmbedderTest` (JDK `HttpServer` stub: batching, order, auth header, errors), `TextExtractorsTest`,
`RetryPolicyTest` (unit); `SearchRetrievalTest` (RRF fixture with exact ranks, modes on a corpus, highlighting/escaping, filters),
`IngestionPipelineTest` (dedupe incl. 8 racing posts, replace-on-update, rollback on failure, readers never see a partial chunk set, stale jobs,
retries/backoff/dead letter, lease takeover, 8 threads claiming 120 jobs with no duplicates, 4 workers x 40 documents processed exactly once),
`RlsIsolationTest` (non-superuser role over a real login connection), `DocumentApiTest` (API, validation, user A vs user B),
`SearchIndexUsageTest` (~3k+1k chunks, EXPLAIN asserts HNSW use; no timing assertions), and in `sql-jooq`: `AskLifeSchemaTest`.

## Limitations and next steps

- The default embedder is lexical; semantic quality needs a real model behind `app.embedder.http.url` (not exercised against a real model here).
- English-only stemming (`to_tsvector('english', ...)`, fixed in the generated column). Multilingual needs a per-document language column.
- `ts_headline` is computed on the best chunk only; no cross-chunk highlighting.
- Chunk and document text is stored in the database (no object store); 2 MiB per document by default.
- No PDF/OCR extraction (extension point only). No per-user quotas or rate limits. No metrics beyond actuator health.
- Re-embedding after switching models needs a backfill job (re-queue all documents); the schema has no embedding-model/version column yet.
- The polling worker is simple (fixed delay); a LISTEN/NOTIFY wake-up would cut latency. Jitter is not added to backoff (deterministic for tests).
- `IllegalArgumentException` is mapped to HTTP 400 globally, which is convenient for parameter errors but would also mask a bug that throws it.
