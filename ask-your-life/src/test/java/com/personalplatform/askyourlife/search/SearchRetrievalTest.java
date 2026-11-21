package com.personalplatform.askyourlife.search;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import com.personalplatform.askyourlife.support.ScriptedEmbedder;
import com.personalplatform.askyourlife.support.TestBeans;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SearchRetrievalTest extends AbstractIntegrationTest {

    @Autowired SearchService search;

    private SearchService.Response run(String owner, String q, SearchMode mode) {
        return search.search(owner, new SearchQuery(q, 10, mode, Set.of(), null, null), true);
    }

    private static List<String> titles(SearchService.Response r) {
        return r.hits().stream().map(SearchHit::title).toList();
    }

    // ---- RRF -------------------------------------------------------------------------------------------

    /**
     * Fixture with exactly controlled ranks (query = "alpha"; vectors scripted so cosine similarity to the query is
     * C .995 > B .866 > D .436 > A 0):
     *
     *   doc | full-text rank | semantic rank | RRF (k=60)
     *   A   | 1 (5x alpha)   | 4             | 1/61 + 1/64 = 0.03201
     *   B   | 2 (2x alpha)   | 2             | 1/62 + 1/62 = 0.03226   <- mid in both lists wins
     *   D   | 3 (1x alpha)   | 3             | 1/63 + 1/63 = 0.03175
     *   C   | none           | 1             | 1/61        = 0.01639   <- first in ONE list only: last
     */
    @Test
    void reciprocalRankFusionRewardsAgreementOverASingleFirstPlace() {
        var e = TestBeans.EMBEDDER;
        e.fix("alpha", ScriptedEmbedder.axis(0, -1, 0));
        e.fix("alpha alpha alpha alpha alpha", ScriptedEmbedder.axis(7, -1, 0));
        e.fix("alpha alpha beta", ScriptedEmbedder.axis(0, 1, 0.5));
        e.fix("alpha delta epsilon zeta eta theta", ScriptedEmbedder.axis(0, 2, 0.9));
        e.fix("gamma kappa", ScriptedEmbedder.axis(0, 3, 0.1));
        ingest("alice", "A", "alpha alpha alpha alpha alpha", SourceType.NOTE);
        ingest("alice", "B", "alpha alpha beta", SourceType.NOTE);
        ingest("alice", "D", "alpha delta epsilon zeta eta theta", SourceType.NOTE);
        ingest("alice", "C", "gamma kappa", SourceType.NOTE);
        worker.drain(100);

        SearchService.Response r = run("alice", "alpha", SearchMode.HYBRID);

        assertThat(titles(r)).containsExactly("B", "A", "D", "C");
        var byTitle = r.hits().stream().collect(java.util.stream.Collectors.toMap(SearchHit::title, h -> h));
        assertThat(byTitle.get("A").explain().ftsRank()).isEqualTo(1);
        assertThat(byTitle.get("A").explain().semanticRank()).isEqualTo(4);
        assertThat(byTitle.get("B").explain().ftsRank()).isEqualTo(2);
        assertThat(byTitle.get("B").explain().semanticRank()).isEqualTo(2);
        assertThat(byTitle.get("D").explain().ftsRank()).isEqualTo(3);
        assertThat(byTitle.get("D").explain().semanticRank()).isEqualTo(3);
        assertThat(byTitle.get("C").explain().ftsRank()).isNull();
        assertThat(byTitle.get("C").explain().semanticRank()).isEqualTo(1);

        assertThat(byTitle.get("A").score()).isCloseTo(1.0 / 61 + 1.0 / 64, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(byTitle.get("B").score()).isCloseTo(2.0 / 62, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(byTitle.get("D").score()).isCloseTo(2.0 / 63, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(byTitle.get("C").score()).isCloseTo(1.0 / 61, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(r.debug().rrfK()).isEqualTo(60);
        assertThat(byTitle.get("B").explain().semanticSimilarity()).isCloseTo(0.866, org.assertj.core.data.Offset.offset(0.001));
    }

    @Test
    void singleListModesUseTheSameRanksOfThatListOnly() {
        var e = TestBeans.EMBEDDER;
        e.fix("alpha", ScriptedEmbedder.axis(0, -1, 0));
        e.fix("alpha alpha alpha alpha alpha", ScriptedEmbedder.axis(7, -1, 0));
        e.fix("alpha alpha beta", ScriptedEmbedder.axis(0, 1, 0.5));
        e.fix("gamma kappa", ScriptedEmbedder.axis(0, 3, 0.1));
        ingest("alice", "A", "alpha alpha alpha alpha alpha", SourceType.NOTE);
        ingest("alice", "B", "alpha alpha beta", SourceType.NOTE);
        ingest("alice", "C", "gamma kappa", SourceType.NOTE);
        worker.drain(100);

        assertThat(titles(run("alice", "alpha", SearchMode.KEYWORD))).containsExactly("A", "B");
        assertThat(titles(run("alice", "alpha", SearchMode.SEMANTIC))).containsExactly("C", "B", "A");
        SearchHit first = run("alice", "alpha", SearchMode.KEYWORD).hits().get(0);
        assertThat(first.score()).isCloseTo(1.0 / 61, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(first.explain().semanticRank()).isNull();
    }

    // ---- modes on a small realistic corpus ------------------------------------------------------------

    private void realisticCorpus() {
        ingest("alice", "Green Market receipt", "Receipt from Green Market: apples, bread, milk. Total 23.40", SourceType.RECEIPT);
        ingest("alice", "Mortgage statement", "Mortgage statement for March: principal and interest payment due on the first", SourceType.EMAIL);
        ingest("alice", "Planning meeting", "Notes on the quarterly planning meeting: roadmap, hiring, budget", SourceType.NOTE);
        ingest("alice", "Sourdough", "Sourdough starter feeding schedule: flour and water every twelve hours", SourceType.NOTE);
        ingest("alice", "Dentist", "Dentist appointment confirmation for Tuesday at 3pm", SourceType.EMAIL);
        worker.drain(100);
    }

    @Test
    void keywordSemanticAndHybridBehaveDifferentlyAndSensibly() {
        realisticCorpus();

        // exact word: keyword is precise (1 hit), semantic always returns neighbours (all 5), hybrid ranks the hit first
        var kw = run("alice", "bread", SearchMode.KEYWORD);
        var sem = run("alice", "bread", SearchMode.SEMANTIC);
        var hyb = run("alice", "bread", SearchMode.HYBRID);
        assertThat(titles(kw)).containsExactly("Green Market receipt");
        assertThat(sem.hits()).hasSize(5);
        assertThat(titles(sem).get(0)).isEqualTo("Green Market receipt");
        assertThat(hyb.hits()).hasSize(5);
        assertThat(titles(hyb).get(0)).isEqualTo("Green Market receipt");
        assertThat(hyb.hits().get(0).score()).isGreaterThan(kw.hits().get(0).score()); // both lists agree

        // typo: no full-text match at all, but the character n-gram embedding still finds it
        assertThat(run("alice", "recipt", SearchMode.KEYWORD).hits()).isEmpty();
        assertThat(titles(run("alice", "recipt", SearchMode.SEMANTIC)).get(0)).isEqualTo("Green Market receipt");
        assertThat(titles(run("alice", "recipt", SearchMode.HYBRID)).get(0)).isEqualTo("Green Market receipt");

        // inflection handled by full-text stemming: "payments" -> mortgage statement (which says "payment")
        assertThat(titles(run("alice", "payments", SearchMode.KEYWORD))).containsExactly("Mortgage statement");

        // web-search syntax: exclusion and phrases are honoured by the keyword list
        assertThat(titles(run("alice", "\"planning meeting\"", SearchMode.KEYWORD))).containsExactly("Planning meeting");
        assertThat(run("alice", "planning -budget", SearchMode.KEYWORD).hits()).isEmpty();
    }

    @Test
    void snippetsHighlightMatchesAndNeverContainRawMarkup() {
        ingest("alice", "Hostile", "<script>alert(1)</script> I bought bread & butter <b>today</b>", SourceType.NOTE);
        worker.drain(10);
        SearchHit hit = run("alice", "bread", SearchMode.KEYWORD).hits().get(0);
        assertThat(hit.snippet()).contains("<mark>bread</mark>");
        assertThat(hit.snippet()).doesNotContain("<script>", "<b>", "</script>").contains("&lt;/script&gt;");
        assertThat(hit.snippet()).contains("&amp;");
    }

    @Test
    void filtersBySourceTypeAndDateRange() {
        TestBeans.CLOCK.set(Instant.parse("2026-01-10T00:00:00Z"));
        ingest("alice", "Old receipt", "coffee receipt january", SourceType.RECEIPT);
        TestBeans.CLOCK.set(Instant.parse("2026-03-10T00:00:00Z"));
        ingest("alice", "Mid note", "coffee note march", SourceType.NOTE);
        TestBeans.CLOCK.set(Instant.parse("2026-05-10T00:00:00Z"));
        ingest("alice", "New receipt", "coffee receipt may", SourceType.RECEIPT);
        worker.drain(100);

        SearchQuery base = new SearchQuery("coffee", 10, SearchMode.HYBRID, Set.of(), null, null);
        assertThat(titles(search.search("alice", base, false))).hasSize(3);

        var receipts = new SearchQuery("coffee", 10, SearchMode.HYBRID, Set.of(SourceType.RECEIPT), null, null);
        assertThat(titles(search.search("alice", receipts, false))).containsExactlyInAnyOrder("Old receipt", "New receipt");

        var window = new SearchQuery("coffee", 10, SearchMode.HYBRID, Set.of(),
                Instant.parse("2026-02-01T00:00:00Z"), Instant.parse("2026-04-01T00:00:00Z"));
        assertThat(titles(search.search("alice", window, false))).containsExactly("Mid note");

        var both = new SearchQuery("coffee", 10, SearchMode.SEMANTIC, Set.of(SourceType.RECEIPT),
                Instant.parse("2026-02-01T00:00:00Z"), null);
        assertThat(titles(search.search("alice", both, false))).containsExactly("New receipt");

        // 'to' is exclusive, 'from' inclusive
        var edge = new SearchQuery("coffee", 10, SearchMode.KEYWORD, Set.of(),
                Instant.parse("2026-03-10T00:00:00Z"), Instant.parse("2026-05-10T00:00:00Z"));
        assertThat(titles(search.search("alice", edge, false))).containsExactly("Mid note");
    }

    @Test
    void oneHitPerDocumentEvenWhenManyChunksMatch() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 60; i++) {
            sb.append("Paragraph ").append(i).append(" mentions the passport renewal appointment in detail and more words to pad.\n\n");
        }
        UUID id = ingest("alice", "Long", sb.toString(), SourceType.NOTE);
        worker.drain(10);
        assertThat(count("chunks")).isGreaterThan(3);
        var r = run("alice", "passport", SearchMode.HYBRID);
        assertThat(r.hits()).hasSize(1);
        assertThat(r.hits().get(0).documentId()).isEqualTo(id);
    }

    @Test
    void searchIgnoresOtherOwnersAndAnEmptyCorpusReturnsNothing() {
        assertThat(run("alice", "anything", SearchMode.HYBRID).hits()).isEmpty();
        ingestAndIndex("bob", "Bob secret", "bob private bread recipe", SourceType.NOTE);
        for (SearchMode m : SearchMode.values()) {
            assertThat(run("alice", "bread recipe", m).hits()).isEmpty();
        }
        assertThat(run("bob", "bread recipe", SearchMode.HYBRID).hits()).hasSize(1);
    }
}
