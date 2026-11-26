package com.personalplatform.askyourlife.search;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import com.personalplatform.askyourlife.support.GoldSet;
import com.personalplatform.askyourlife.support.ModelFiles;
import com.personalplatform.askyourlife.support.TestBeans;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Spec item 4.B in miniature: the paraphrase gold set through the real pipeline (chunking, pgvector HNSW, Postgres
 * FTS, RRF), measuring recall@3 and MRR (top 10) per mode, once with documents embedded by the hashing stand-in and
 * once by Model2Vec. The numbers are printed and published in ask-your-life/README.md.
 */
class SearchQualityTest extends AbstractIntegrationTest {

    @Autowired SearchService search;

    private Map<String, GoldSet.Scores> measure(Embedder embedder, String label) {
        superDsl.execute("truncate ask_life.documents cascade");
        TestBeans.EMBEDDER.delegateTo(embedder);
        for (GoldSet.Pair p : GoldSet.PAIRS) {
            ingest("alice", p.title(), p.passage(), SourceType.FILE);
        }
        worker.drain(1000);
        Map<String, GoldSet.Scores> out = new LinkedHashMap<>();
        for (SearchMode mode : SearchMode.values()) {
            GoldSet.Scores s = GoldSet.evaluate(q -> search.search("alice",
                    new SearchQuery(q, 10, mode, Set.of(), null, null), false)
                    .hits().stream().map(SearchHit::title).toList());
            out.put(mode.name().toLowerCase(java.util.Locale.ROOT), s);
            System.out.println("[gold-set, database] " + label + " " + mode + ": " + s);
        }
        return out;
    }

    @Test
    void model2vecSemanticAndHybridSearchBeatTheHashingStandIn() {
        Embedder model = ModelFiles.embedder();
        Map<String, GoldSet.Scores> hashing = measure(new HashingEmbedder(384), "hashing");
        Map<String, GoldSet.Scores> m2v = measure(model, "model2vec");

        // keyword search does not depend on the embedder
        assertThat(m2v.get("keyword")).isEqualTo(hashing.get("keyword"));
        // the semantic leg: a clear margin
        assertThat(m2v.get("semantic").recallAt3()).isGreaterThanOrEqualTo(hashing.get("semantic").recallAt3() + 0.3);
        assertThat(m2v.get("semantic").mrr()).isGreaterThanOrEqualTo(hashing.get("semantic").mrr() + 0.3);
        // hybrid (the default mode) gains too, and is at least as good as keyword alone
        assertThat(m2v.get("hybrid").recallAt3()).isGreaterThanOrEqualTo(hashing.get("hybrid").recallAt3() + 0.3);
        assertThat(m2v.get("hybrid").mrr()).isGreaterThanOrEqualTo(m2v.get("keyword").mrr());
    }
}
