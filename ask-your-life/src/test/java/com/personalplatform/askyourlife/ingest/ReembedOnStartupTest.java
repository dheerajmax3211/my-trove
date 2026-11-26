package com.personalplatform.askyourlife.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import com.personalplatform.askyourlife.support.Q;
import com.personalplatform.askyourlife.support.TestBeans;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Documents record which embedder produced their vectors; a model change re-embeds them exactly once. */
class ReembedOnStartupTest extends AbstractIntegrationTest {

    @Autowired ReembedOnStartup reembed;

    private String embedderOf(UUID id) {
        return Q.val(superDsl, "select embedder from ask_life.documents where id = ?", String.class, id);
    }

    @Test
    void indexingRecordsTheEmbedderId() {
        UUID id = ingestAndIndex("alice", "Rent", "Rent for June paid to the landlord.", SourceType.NOTE);
        assertThat(embedderOf(id)).isEqualTo("scripted:384");
    }

    @Test
    void aChangedEmbedderRequeuesEveryOwnersIndexedDocumentsOnceAndTheWorkerReembedsThem() {
        UUID a = ingestAndIndex("alice", "Rent", "Rent for June paid to the landlord.", SourceType.NOTE);
        UUID b = ingestAndIndex("bob", "Boiler", "Boiler service receipt.", SourceType.RECEIPT);
        superDsl.execute("update ask_life.documents set embedder = null where id = ?", b); // pre-V2 row
        assertThat(reembed.requeueStale()).as("nothing stale for alice").isEqualTo(1);
        worker.drain(100);
        assertThat(embedderOf(b)).isEqualTo("scripted:384");

        TestBeans.EMBEDDER.id = "model2vec:test:64->384";
        int callsBefore = TestBeans.EMBEDDER.totalCalls.get();
        assertThat(reembed.requeueStale()).isEqualTo(2);
        assertThat(reembed.requeueStale()).as("already queued: not queued twice").isZero();
        assertThat(worker.drain(100)).isEqualTo(2);
        assertThat(TestBeans.EMBEDDER.totalCalls.get()).isGreaterThan(callsBefore);
        assertThat(embedderOf(a)).isEqualTo("model2vec:test:64->384");
        assertThat(embedderOf(b)).isEqualTo("model2vec:test:64->384");
        assertThat(Q.val(superDsl, "select count(*) from ask_life.documents where status = 'INDEXED'", Long.class)).isEqualTo(2);
        assertThat(reembed.requeueStale()).isZero();
    }

    @Test
    void pendingAndFailedDocumentsAreLeftAlone() {
        ingest("alice", "Queued", "Not indexed yet.", SourceType.NOTE); // PENDING with its own job
        TestBeans.EMBEDDER.id = "other:384";
        assertThat(reembed.requeueStale()).isZero();
    }
}
