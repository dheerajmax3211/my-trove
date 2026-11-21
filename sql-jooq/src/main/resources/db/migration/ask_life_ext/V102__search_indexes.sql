create index chunks_tsv_gin_idx on ask_life.chunks using gin (tsv);

-- Approximate nearest neighbour on cosine distance (the embedder emits unit vectors).
create index chunks_embedding_hnsw_idx on ask_life.chunks
    using hnsw (embedding public.vector_cosine_ops) with (m = 16, ef_construction = 64);
