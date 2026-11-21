package com.personalplatform.askyourlife.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Retrieval settings ({@code app.search.*}). */
@ConfigurationProperties(prefix = "app.search")
public record SearchProperties(
        /** Reciprocal Rank Fusion constant: score = sum over lists of 1 / (rrfK + rank). 60 is the usual default. */
        @DefaultValue("60") int rrfK,
        /** Minimum number of candidates taken from each ranked list before fusion (grows with k). */
        @DefaultValue("100") int candidatePool,
        /** Semantic hits with cosine similarity below this are dropped. 0 disables (embedder specific). */
        @DefaultValue("0.0") double minSemanticSimilarity,
        /** pgvector hnsw.ef_search for the query's transaction. */
        @DefaultValue("40") int hnswEfSearch) {}
