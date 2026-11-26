package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.document.SourceType;
import java.util.List;
import java.util.UUID;

/**
 * Extractive answer: the best-matching sentence(s) quoted verbatim from the top results, each with its citation.
 * Nothing is generated or paraphrased; {@code text} is the cited sentences joined by a space.
 *
 * @param score relevance of the best sentence (cosine to the question plus a small word-overlap bonus)
 */
public record Answer(String text, List<Citation> sentences, double score) {

    /** One quoted sentence and where it comes from (document, chunk). */
    public record Citation(String text, UUID documentId, String title, SourceType sourceType, UUID chunkId,
            int chunkOrdinal) {}
}
