package com.personalplatform.askyourlife.search;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.personalplatform.askyourlife.document.SourceType;
import java.time.Instant;
import java.util.UUID;

/**
 * One result: the best-matching chunk of a document.
 *
 * @param snippet HTML-safe excerpt: the text is escaped, matches are wrapped in {@code <mark>...</mark>}
 * @param score   fused score (RRF in hybrid mode; 1/(k+rank) of the single list otherwise)
 * @param explain per-list ranks and raw scores, only when requested
 */
public record SearchHit(
        UUID documentId,
        UUID chunkId,
        String title,
        SourceType sourceType,
        Instant createdAt,
        int chunkOrdinal,
        String snippet,
        double score,
        @JsonInclude(JsonInclude.Include.NON_NULL) Explain explain) {

    /**
     * @param ftsRank            1-based position in the full-text list, null when not in it
     * @param semanticRank       1-based position in the vector list, null when not in it
     * @param ftsScore           ts_rank_cd of the chunk, null when not in the full-text list
     * @param semanticSimilarity cosine similarity, null when not in the vector list
     */
    public record Explain(Integer ftsRank, Integer semanticRank, Double ftsScore, Double semanticSimilarity) {}

    public SearchHit withoutExplain() {
        return new SearchHit(documentId, chunkId, title, sourceType, createdAt, chunkOrdinal, snippet, score, null);
    }
}
