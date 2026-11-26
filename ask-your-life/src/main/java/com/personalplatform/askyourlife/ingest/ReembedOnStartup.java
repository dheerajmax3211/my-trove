package com.personalplatform.askyourlife.ingest;

import static com.personalplatform.sql.jooq.ask_life.ask_life.Tables.DOCUMENTS;
import static com.personalplatform.sql.jooq.ask_life.ask_life.Tables.INGESTION_JOBS;

import com.personalplatform.askyourlife.config.IngestProperties;
import com.personalplatform.askyourlife.document.DocumentStatus;
import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.rls.OwnerScope;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.jooq.impl.DSL;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Re-embeds documents whose vectors came from another embedder than the running one.
 *
 * <p>Every indexed document records {@code documents.embedder} ({@link Embedder#id()}). At startup this queues an
 * ordinary ingestion job (same content hash) for each INDEXED document with a different or unknown embedder that has
 * no job pending, so the normal worker re-chunks and re-embeds it; its old chunks stay searchable until the atomic
 * swap. Until the backlog drains, those documents' vectors live in the old space and rank poorly in the semantic
 * list (keyword search is unaffected).
 *
 * <p>Row-level security holds: owners are listed from the job queue (no RLS, no text; every document has had at
 * least one job) and each owner's documents are read inside that owner's scope.
 */
@Component
public class ReembedOnStartup {

    private static final Logger LOG = LoggerFactory.getLogger(ReembedOnStartup.class);

    private final OwnerScope scope;
    private final JobRepository jobs;
    private final Embedder embedder;
    private final IngestProperties props;
    private final Clock clock;
    private final boolean enabled;

    public ReembedOnStartup(OwnerScope scope, JobRepository jobs, Embedder embedder, IngestProperties props,
            Clock clock, @Value("${app.embedder.reembed-on-startup:true}") boolean enabled) {
        this.scope = scope;
        this.jobs = jobs;
        this.embedder = embedder;
        this.props = props;
        this.clock = clock;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    void onReady() {
        if (!enabled) {
            return;
        }
        try {
            int n = requeueStale();
            if (n > 0) {
                LOG.info("Queued {} document(s) for re-embedding with {}", n, embedder.id());
            }
        } catch (RuntimeException e) {
            LOG.error("Could not queue documents for re-embedding", e);
        }
    }

    /** Queues a job for every INDEXED document not embedded by the running embedder. Returns how many. */
    public int requeueStale() {
        String current = embedder.id();
        List<String> owners = scope.callWithoutOwner(dsl -> dsl.selectDistinct(INGESTION_JOBS.OWNER_UID)
                .from(INGESTION_JOBS)
                .fetch(INGESTION_JOBS.OWNER_UID));
        int queued = 0;
        for (String owner : owners) {
            queued += scope.call(owner, dsl -> {
                var stale = dsl.select(DOCUMENTS.ID, DOCUMENTS.CONTENT_HASH)
                        .from(DOCUMENTS)
                        .where(DOCUMENTS.OWNER_UID.eq(owner))
                        .and(DOCUMENTS.STATUS.eq(DocumentStatus.INDEXED.name()))
                        .and(DOCUMENTS.EMBEDDER.isDistinctFrom(current))
                        .andNotExists(DSL.selectOne().from(INGESTION_JOBS)
                                .where(INGESTION_JOBS.DOCUMENT_ID.eq(DOCUMENTS.ID))
                                .and(INGESTION_JOBS.STATUS.in("PENDING", "RUNNING")))
                        .fetch();
                Instant now = clock.instant();
                stale.forEach(r -> jobs.enqueue(owner, r.value1(), r.value2(), props.maxAttempts(), now));
                return stale.size();
            });
        }
        return queued;
    }
}
