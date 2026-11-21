-- ask-your-life: documents, chunks and the ingestion job queue.
--
-- Everything here is deliberately plain SQL so that jOOQ's DDL parser can generate classes from it.
-- The pgvector column, the tsvector column, the HNSW/GIN indexes, row-level security and the
-- application role need Postgres-only syntax and live in db/migration/ask_life_ext (versions >= 100).
create schema if not exists ask_life;

create table ask_life.documents (
    id           uuid         not null primary key,
    owner_uid    varchar(128) not null check (length(owner_uid) > 0),
    source_type  varchar(16)  not null check (source_type in ('NOTE', 'FILE', 'EMAIL', 'RECEIPT')),
    external_id  varchar(256),
    title        varchar(500) not null,
    mime_type    varchar(100) not null,
    content_hash char(64)     not null,
    content      text         not null,
    status       varchar(16)  not null check (status in ('PENDING', 'INDEXED', 'FAILED')),
    chunk_count  integer      not null default 0,
    created_at   timestamptz  not null,
    updated_at   timestamptz  not null,
    ingested_at  timestamptz,
    constraint documents_owner_hash_uq unique (owner_uid, content_hash),
    constraint documents_owner_external_uq unique (owner_uid, external_id)
);

create index documents_owner_created_idx on ask_life.documents (owner_uid, created_at desc);

create table ask_life.chunks (
    id          uuid         not null primary key,
    document_id uuid         not null references ask_life.documents (id) on delete cascade,
    -- denormalised from the document so the RLS policy and the search filters need no join
    owner_uid   varchar(128) not null check (length(owner_uid) > 0),
    -- also denormalised: lets filtered nearest-neighbour search run on the chunks table alone (no join),
    -- which keeps the HNSW index usable. Both are immutable on the document.
    source_type varchar(16)  not null,
    doc_created_at timestamptz not null,
    ordinal     integer      not null check (ordinal >= 0),
    content     text         not null,
    token_count integer      not null check (token_count > 0),
    created_at  timestamptz  not null,
    constraint chunks_document_ordinal_uq unique (document_id, ordinal)
);

create index chunks_owner_idx on ask_life.chunks (owner_uid);

-- Outbox / job queue. One row per "index this document at this content hash".
create table ask_life.ingestion_jobs (
    id           uuid         not null primary key,
    document_id  uuid         not null references ask_life.documents (id) on delete cascade,
    owner_uid    varchar(128) not null check (length(owner_uid) > 0),
    content_hash char(64)     not null,
    status       varchar(16)  not null check (status in ('PENDING', 'RUNNING', 'DONE', 'DEAD')),
    attempts     integer      not null default 0,
    max_attempts integer      not null,
    run_at       timestamptz  not null,
    locked_by    varchar(100),
    locked_until timestamptz,
    last_error   text,
    created_at   timestamptz  not null,
    updated_at   timestamptz  not null
);

create index ingestion_jobs_claim_idx on ask_life.ingestion_jobs (status, run_at);
create index ingestion_jobs_document_idx on ask_life.ingestion_jobs (document_id);
