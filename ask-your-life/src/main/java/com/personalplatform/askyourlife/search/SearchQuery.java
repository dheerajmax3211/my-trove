package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.document.SourceType;
import java.time.Instant;
import java.util.Set;

/**
 * @param from inclusive lower bound on the document's created_at, or null
 * @param to   exclusive upper bound, or null
 */
public record SearchQuery(String text, int k, SearchMode mode, Set<SourceType> sourceTypes, Instant from, Instant to) {

    public SearchQuery {
        sourceTypes = sourceTypes == null ? Set.of() : Set.copyOf(sourceTypes);
    }
}
