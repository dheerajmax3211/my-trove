package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.support.Q;
import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import com.personalplatform.askyourlife.support.Q;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Loads ~3,000 chunks for one owner plus ~1,000 for others and checks, via EXPLAIN of the real hybrid statement,
 * that the planner can serve it from the HNSW and GIN indexes. No timing assertions (they are flaky): index usage
 * and result correctness are what is asserted.
 */
class SearchIndexUsageTest extends AbstractIntegrationTest {

    private static final Logger LOG = LoggerFactory.getLogger(SearchIndexUsageTest.class);

    @Autowired SearchService search;
    @Autowired SearchRepository repository;
    @Autowired Embedder embedder;

    private static final String[] VOCAB = new Random(7).ints(600, 0, Integer.MAX_VALUE)
            .mapToObj(i -> "w" + Integer.toString(i, 36)).toArray(String[]::new);

    private static String generate(Random rnd, int words, String planted) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < words; i++) {
            sb.append(VOCAB[rnd.nextInt(VOCAB.length)]);
            sb.append(i % 12 == 11 ? ". " : " ");
        }
        return sb.append(planted).toString();
    }

    @Test
    void hybridQueryUsesTheHnswAndGinIndexesAndFindsThePlantedNeedle() {
        Random rnd = new Random(42);
        String needle = "Needle passport renewal appointment tuesday";
        UUID needleDoc = null;
        for (int d = 0; d < 120; d++) {
            String body = d == 77 ? needle : generate(rnd, 3600, "");
            UUID id = ingest("alice", "doc-" + d, body, SourceType.NOTE);
            if (d == 77) {
                needleDoc = id;
            }
        }
        for (int d = 0; d < 40; d++) {
            ingest(d % 2 == 0 ? "bob" : "carol", "other-" + d, generate(rnd, 3600, ""), SourceType.NOTE);
        }
        worker.drain(10_000);

        long alice = Q.val(superDsl, "select count(*) from ask_life.chunks where owner_uid = 'alice'", Long.class);
        long total = count("chunks");
        LOG.info("alice chunks={}, total chunks={}", alice, total);
        assertThat(alice).isBetween(2_000L, 5_000L);
        assertThat(total).isGreaterThan(alice);
        superDsl.execute("vacuum analyze ask_life.chunks");

        // correctness at this size
        for (SearchMode mode : SearchMode.values()) {
            var r = search.search("alice", new SearchQuery("needle passport renewal", 5, mode, Set.of(), null, null), true);
            assertThat(r.hits()).as(mode.name()).isNotEmpty();
            assertThat(r.hits().get(0).documentId()).as(mode.name()).isEqualTo(needleDoc);
        }
        var hybrid = search.search("alice", new SearchQuery("needle passport renewal", 5, SearchMode.HYBRID, Set.of(), null, null), true);
        assertThat(hybrid.hits().get(0).explain().ftsRank()).isEqualTo(1);
        assertThat(hybrid.hits().get(0).explain().semanticRank()).isEqualTo(1);

        // index usage, from EXPLAIN of the exact statements the service runs (as the RLS-restricted role)
        String qText = "needle passport renewal";
        float[] qv = embedder.embed(qText);
        SearchQuery hybridQuery = new SearchQuery(qText, 10, SearchMode.HYBRID, Set.of(), null, null);
        String hybridPlan = repository.explain("alice", hybridQuery, qv, false);
        LOG.info("hybrid plan:\n{}", hybridPlan);
        assertThat(hybridPlan).contains("Index Scan using chunks_embedding_hnsw_idx").doesNotContain("Seq Scan on chunks");

        var semantic = new SearchQuery(qText, 10, SearchMode.SEMANTIC, Set.of(), null, null);
        assertThat(repository.explain("alice", semantic, qv, false)).contains("chunks_embedding_hnsw_idx");
        // filters are applied on the chunks table itself, so the ANN index stays usable
        var filtered = new SearchQuery(qText, 10, SearchMode.SEMANTIC, Set.of(SourceType.NOTE),
                java.time.Instant.parse("2020-01-01T00:00:00Z"), java.time.Instant.parse("2099-01-01T00:00:00Z"));
        assertThat(repository.explain("alice", filtered, qv, false)).contains("chunks_embedding_hnsw_idx");

        // Keyword list under RLS: Postgres may not push the (non-leakproof) @@ operator below the RLS policy, so the
        // GIN index is not usable for the app role; the owner btree index narrows the scan to the caller's rows and
        // tsv is checked as a filter. Without RLS (superuser) the same predicate does use the GIN index.
        var keyword = new SearchQuery(qText, 10, SearchMode.KEYWORD, Set.of(), null, null);
        String keywordPlan = repository.explain("alice", keyword, null, false);
        LOG.info("keyword plan (RLS role):\n{}", keywordPlan);
        assertThat(keywordPlan).contains("chunks_owner_idx").doesNotContain("Seq Scan on chunks");
        String superPlan = String.join("\n", Q.vals(superDsl, "explain select id from ask_life.chunks where tsv @@ websearch_to_tsquery('english', 'needle passport renewal')", String.class));
        LOG.info("keyword plan (superuser, no RLS):\n{}", superPlan);
        assertThat(superPlan).contains("chunks_tsv_gin_idx");
    }

    @Test
    void indexesExistWithTheExpectedAccessMethods() {
        List<String> defs = Q.vals(superDsl, 
                "select indexdef from pg_indexes where schemaname = 'ask_life' and tablename = 'chunks'", String.class);
        assertThat(defs).anyMatch(d -> d.contains("USING hnsw") && d.contains("vector_cosine_ops"));
        assertThat(defs).anyMatch(d -> d.contains("USING gin (tsv)"));
    }
}
