package com.personalplatform.askyourlife.ingest;

import com.personalplatform.askyourlife.chunking.Chunker;
import com.personalplatform.askyourlife.chunking.TextChunk;
import com.personalplatform.askyourlife.config.IngestProperties;
import com.personalplatform.askyourlife.document.DocumentRepository;
import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.rls.OwnerScope;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Executes ingestion jobs: claim, read, chunk, embed, write.
 *
 * <p>The slow part (embedding, possibly a network call) runs with no transaction and no row locks held. The job is
 * protected by its lease instead: if this process dies the lease expires and another worker re-claims it. The
 * final write is one transaction (lock document, check the content hash is still the one we embedded, replace the
 * chunks, mark the job done), so a chunk set is either fully the old one or fully the new one and a job's effect
 * is applied at most once. A job that fails goes back to the queue with exponential backoff until its attempts
 * are used up, then it is dead-lettered and the document is marked FAILED.
 */
@Component
public class IngestionWorker {

    private static final Logger LOG = LoggerFactory.getLogger(IngestionWorker.class);

    private final JobRepository jobs;
    private final DocumentRepository documents;
    private final ChunkRepository chunkRepository;
    private final Chunker chunker;
    private final Embedder embedder;
    private final OwnerScope scope;
    private final Clock clock;
    private final IngestProperties props;
    private final RetryPolicy retry;
    private final String workerId = "worker-" + UUID.randomUUID().toString().substring(0, 8);

    public IngestionWorker(JobRepository jobs, DocumentRepository documents, ChunkRepository chunkRepository,
            Chunker chunker, Embedder embedder, OwnerScope scope, Clock clock, IngestProperties props) {
        this.jobs = jobs;
        this.documents = documents;
        this.chunkRepository = chunkRepository;
        this.chunker = chunker;
        this.embedder = embedder;
        this.scope = scope;
        this.clock = clock;
        this.props = props;
        this.retry = new RetryPolicy(props.maxAttempts(), props.baseBackoff(), props.maxBackoff());
    }

    public String workerId() {
        return workerId;
    }

    /** Handles jobs until none is runnable (or {@code max} were handled). Returns how many were handled. */
    public int drain(int max) {
        int handled = 0;
        while (handled < max && runOnce()) {
            handled++;
        }
        return handled;
    }

    /** Claims and processes one job. Returns false when the queue had nothing runnable. */
    public boolean runOnce() {
        Optional<Job> claimed = jobs.claim(workerId, clock.instant(), props.lease());
        if (claimed.isEmpty()) {
            return false;
        }
        Job job = claimed.get();
        try {
            if (job.attempts() > job.maxAttempts()) {
                // leases kept expiring (worker crashes / timeouts): treat as poison
                throw new IllegalStateException("gave up after " + job.maxAttempts() + " attempts (lease expired)");
            }
            process(job);
        } catch (Exception e) {
            handleFailure(job, e);
        }
        return true;
    }

    private void process(Job job) {
        var input = documents.loadForIndexing(job.ownerUid(), job.documentId());
        if (input.isEmpty() || !input.get().contentHash().equals(job.contentHash())) {
            // document deleted, or edited since: a newer job exists for the new content
            jobs.complete(job.id(), clock.instant());
            return;
        }
        List<TextChunk> chunks = chunker.chunk(input.get().content());
        List<float[]> vectors = embedder.embedAll(chunks.stream().map(TextChunk::text).toList());
        if (vectors.size() != chunks.size()) {
            throw new IllegalStateException("embedder returned " + vectors.size() + " vectors for " + chunks.size() + " chunks");
        }
        Instant now = clock.instant();
        scope.run(job.ownerUid(), dsl -> {
            chunkRepository.replaceChunks(job.ownerUid(), job.documentId(), job.contentHash(), chunks, vectors, now);
            jobs.complete(job.id(), now); // stale or not, this job is finished
        });
    }

    private void handleFailure(Job job, Exception e) {
        Instant now = clock.instant();
        String message = summarise(e);
        try {
            if (retry.exhausted(job.attempts())) {
                LOG.warn("Job {} dead-lettered after {} attempts: {}", job.id(), job.attempts(), message);
                scope.run(job.ownerUid(), dsl -> {
                    documents.markFailed(job.ownerUid(), job.documentId(), job.contentHash(), now);
                    jobs.deadLetter(job.id(), now, message);
                });
            } else {
                Instant runAt = now.plus(retry.backoffAfter(job.attempts()));
                LOG.info("Job {} failed (attempt {}/{}), retrying at {}: {}", job.id(), job.attempts(),
                        job.maxAttempts(), runAt, message);
                jobs.retryLater(job.id(), now, runAt, message);
            }
        } catch (RuntimeException bookkeeping) {
            // leave the job RUNNING: the lease will expire and it will be picked up again
            LOG.error("Could not record failure of job {}", job.id(), bookkeeping);
        }
    }

    private static String summarise(Exception e) {
        String m = e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage());
        return m.length() > 1000 ? m.substring(0, 1000) : m;
    }
}
