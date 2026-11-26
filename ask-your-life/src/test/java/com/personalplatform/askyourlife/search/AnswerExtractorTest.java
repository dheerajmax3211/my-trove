package com.personalplatform.askyourlife.search;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import com.personalplatform.askyourlife.support.ModelFiles;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AnswerExtractorTest {

    private static SearchHit hit(String title, UUID chunk, int ordinal) {
        return new SearchHit(UUID.randomUUID(), chunk, title, SourceType.FILE, Instant.EPOCH, ordinal, "", 1.0, null);
    }

    @Test
    void quotesTheBestSentenceVerbatimWithItsCitation() {
        UUID c1 = UUID.randomUUID();
        UUID c2 = UUID.randomUUID();
        SearchHit lease = hit("Lease", c1, 2);
        SearchHit other = hit("Gym", c2, 0);
        Map<UUID, String> text = Map.of(
                c1, "The tenancy runs for twelve months. Rent of 950 is due on the first of each month. Pets need consent.",
                c2, "Gym membership renews in May.");
        Answer a = new AnswerExtractor(new HashingEmbedder(384), 0.2).extract("when is the rent due", null,
                List.of(lease, other), text);
        assertThat(a).isNotNull();
        assertThat(a.sentences().get(0).text()).isEqualTo("Rent of 950 is due on the first of each month.");
        assertThat(a.sentences().get(0).documentId()).isEqualTo(lease.documentId());
        assertThat(a.sentences().get(0).chunkId()).isEqualTo(c1);
        assertThat(a.sentences().get(0).chunkOrdinal()).isEqualTo(2);
        assertThat(a.sentences().get(0).title()).isEqualTo("Lease");
        assertThat(a.text()).startsWith("Rent of 950 is due");
        assertThat(a.sentences()).hasSizeLessThanOrEqualTo(2);
    }

    @Test
    void noAnswerWhenNothingClearsTheBarOrThereAreNoHits() {
        UUID c = UUID.randomUUID();
        AnswerExtractor x = new AnswerExtractor(new HashingEmbedder(384), 0.45);
        assertThat(x.extract("boiler pressure", null, List.of(hit("Recipe", c, 0)),
                Map.of(c, "Whisk the eggs with sugar. Bake for twenty minutes."))).isNull();
        assertThat(x.extract("anything", null, List.of(), Map.of())).isNull();
        assertThat(x.extract("anything", null, List.of(hit("Empty", c, 0)), Map.of(c, "  ... "))).isNull();
    }

    @Test
    void onlyTheTopThreeHitsAreQuoted() {
        List<SearchHit> hits = new java.util.ArrayList<>();
        Map<UUID, String> text = new java.util.HashMap<>();
        for (int i = 0; i < 4; i++) {
            UUID c = UUID.randomUUID();
            hits.add(hit("Doc" + i, c, 0));
            text.put(c, i == 3 ? "The boiler pressure valve was replaced." : "Unrelated note number " + i + ".");
        }
        assertThat(new AnswerExtractor(new HashingEmbedder(384), 0.2).extract("boiler pressure valve", null, hits, text))
                .isNull();
    }

    @Test
    void withTheRealModelAParaphrasedQuestionFindsTheRightLine() {
        UUID c = UUID.randomUUID();
        SearchHit h = hit("Car policy", c, 0);
        Answer a = new AnswerExtractor(ModelFiles.embedder(), 0.45).extract("vehicle insurance renewal date", null,
                List.of(h), Map.of(c, "Your automobile policy covers collision and theft. "
                        + "Annual premium 612 euros, renewal due in October. Keep this letter for your records."));
        assertThat(a).isNotNull();
        assertThat(a.sentences().get(0).text()).isEqualTo("Annual premium 612 euros, renewal due in October.");
    }
}
