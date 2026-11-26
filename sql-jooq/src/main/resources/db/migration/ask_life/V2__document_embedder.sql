-- Which embedder (kind, model, dimension) produced a document's chunk vectors, e.g.
-- 'model2vec:potion-base-2M@389b9f6:64->384' or 'hashing-v1:384'. NULL = indexed before this column existed
-- (always the hashing embedder) or not indexed yet. At startup the service re-queues every INDEXED document whose
-- embedder differs from the running one, so vectors from two models are not mixed for long.
alter table ask_life.documents add column embedder varchar(100);
