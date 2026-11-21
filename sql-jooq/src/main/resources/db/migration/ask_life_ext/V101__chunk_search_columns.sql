-- Search columns that jOOQ's parser cannot model; the application addresses them with DSL.field(...).
-- 384 = embedding dimension (fixed by the schema; the embedder dimension must match).
alter table ask_life.chunks add column embedding public.vector(384) not null;

-- Full-text vector maintained by Postgres itself, so it can never drift from the text.
-- The 'english' configuration is part of the contract with the search queries.
alter table ask_life.chunks
    add column tsv tsvector generated always as (to_tsvector('english', content)) stored;
