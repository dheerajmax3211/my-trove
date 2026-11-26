package com.personalplatform.askyourlife.embedding;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.askyourlife.support.GoldSet;
import com.personalplatform.askyourlife.support.ModelFiles;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Pure vector ranking (exact cosine, no database) on the paraphrase gold set: Model2Vec against the hashing stand-in.
 * The database-level comparison including hybrid search is {@code SearchQualityTest}.
 */
class EmbedderQualityTest {

    private static GoldSet.Scores score(Embedder e) {
        List<float[]> passages = e.embedAll(GoldSet.PAIRS.stream().map(GoldSet.Pair::passage).toList());
        return GoldSet.evaluate(q -> {
            float[] qv = e.embed(q);
            return java.util.stream.IntStream.range(0, passages.size()).boxed()
                    .sorted(Comparator.comparingDouble((Integer i) -> -Embedder.cosine(qv, passages.get(i))))
                    .map(i -> GoldSet.PAIRS.get(i).title())
                    .toList();
        });
    }

    @Test
    void model2vecBeatsTheHashingStandInByAClearMargin() {
        Model2VecEmbedder model = ModelFiles.embedder();
        GoldSet.Scores hashing = score(new HashingEmbedder(384));
        GoldSet.Scores m2v = score(model);
        System.out.println("[gold-set, exact cosine] hashing " + hashing + " | model2vec " + m2v);
        assertThat(m2v.recallAt3()).isGreaterThanOrEqualTo(hashing.recallAt3() + 0.3);
        assertThat(m2v.mrr()).isGreaterThanOrEqualTo(hashing.mrr() + 0.3);
    }
}
