package com.personalplatform.askyourlife.ingest;

import static com.personalplatform.sql.jooq.ask_life.ask_life.Tables.INGESTION_JOBS;

import com.personalplatform.askyourlife.rls.OwnerScope;
import com.personalplatform.sql.UuidV7;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

/**
 * The outbox / job queue. Producers enqueue inside the same transaction that writes the document, so a
 * document without a job (or vice versa) cannot exist. Consumers claim with
 * {@code FOR UPDATE SKIP LOCKED}: concurrent workers never block on, nor take, the same row.
 */
@Repository
public class JobRepository {

    private final OwnerScope scope;

    public JobRepository(OwnerScope scope) {
        this.scope = scope;
    }

    /** Enqueue; must be called inside the owner-scoped transaction that wrote the document. */
    public UUID enqueue(String ownerUid, UUID documentId, String contentHash, int maxAttempts, Instant now) {
        UUID id = UuidV7.next();
        scope.run(ownerUid, dsl -> dsl.insertInto(INGESTION_JOBS)
                .set(INGESTION_JOBS.ID, id)
                .set(INGESTION_JOBS.DOCUMENT_ID, documentId)
                .set(INGESTION_JOBS.OWNER_UID, ownerUid)
                .set(INGESTION_JOBS.CONTENT_HASH, contentHash)
                .set(INGESTION_JOBS.STATUS, "PENDING")
                .set(INGESTION_JOBS.MAX_ATTEMPTS, maxAttempts)
                .set(INGESTION_JOBS.RUN_AT, now.atOffset(ZoneOffset.UTC))
                .set(INGESTION_JOBS.CREATED_AT, now.atOffset(ZoneOffset.UTC))
                .set(INGESTION_JOBS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .execute());
        return id;
    }

    /**
     * Claims the next runnable job: PENDING and due, or RUNNING with an expired lease (its worker died).
     * One atomic UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING.
     */
    public Optional<Job> claim(String workerId, Instant now, Duration lease) {
        var nowTs = now.atOffset(ZoneOffset.UTC);
        return scope.callWithoutOwner(dsl -> {
            var next = dsl.select(INGESTION_JOBS.ID)
                    .from(INGESTION_JOBS)
                    .where(INGESTION_JOBS.STATUS.eq("PENDING").and(INGESTION_JOBS.RUN_AT.le(nowTs))
                            .or(INGESTION_JOBS.STATUS.eq("RUNNING").and(INGESTION_JOBS.LOCKED_UNTIL.lt(nowTs))))
                    .orderBy(INGESTION_JOBS.RUN_AT, INGESTION_JOBS.ID)
                    .limit(1)
                    .forUpdate()
                    .skipLocked();
            return dsl.update(INGESTION_JOBS)
                    .set(INGESTION_JOBS.STATUS, "RUNNING")
                    .set(INGESTION_JOBS.ATTEMPTS, INGESTION_JOBS.ATTEMPTS.plus(1))
                    .set(INGESTION_JOBS.LOCKED_BY, workerId)
                    .set(INGESTION_JOBS.LOCKED_UNTIL, now.plus(lease).atOffset(ZoneOffset.UTC))
                    .set(INGESTION_JOBS.UPDATED_AT, nowTs)
                    .where(INGESTION_JOBS.ID.eq(DSL.field(next)))
                    .returning(INGESTION_JOBS.ID, INGESTION_JOBS.DOCUMENT_ID, INGESTION_JOBS.OWNER_UID,
                            INGESTION_JOBS.CONTENT_HASH, INGESTION_JOBS.ATTEMPTS, INGESTION_JOBS.MAX_ATTEMPTS)
                    .fetchOptional()
                    .map(r -> new Job(r.getId(), r.getDocumentId(), r.getOwnerUid(), r.getContentHash(),
                            r.getAttempts(), r.getMaxAttempts()));
        });
    }

    public void complete(UUID jobId, Instant now) {
        scope.callWithoutOwner(dsl -> dsl.update(INGESTION_JOBS)
                .set(INGESTION_JOBS.STATUS, "DONE")
                .set(INGESTION_JOBS.LOCKED_BY, (String) null)
                .set(INGESTION_JOBS.LOCKED_UNTIL, (java.time.OffsetDateTime) null)
                .set(INGESTION_JOBS.LAST_ERROR, (String) null)
                .set(INGESTION_JOBS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(INGESTION_JOBS.ID.eq(jobId))
                .execute());
    }

    /** Returns the job to the queue to run again at {@code runAt}. */
    public void retryLater(UUID jobId, Instant now, Instant runAt, String error) {
        scope.callWithoutOwner(dsl -> dsl.update(INGESTION_JOBS)
                .set(INGESTION_JOBS.STATUS, "PENDING")
                .set(INGESTION_JOBS.RUN_AT, runAt.atOffset(ZoneOffset.UTC))
                .set(INGESTION_JOBS.LOCKED_BY, (String) null)
                .set(INGESTION_JOBS.LOCKED_UNTIL, (java.time.OffsetDateTime) null)
                .set(INGESTION_JOBS.LAST_ERROR, error)
                .set(INGESTION_JOBS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(INGESTION_JOBS.ID.eq(jobId))
                .execute());
    }

    /** Dead-letter: the job stays in the table with its last error and is never claimed again. */
    public void deadLetter(UUID jobId, Instant now, String error) {
        scope.callWithoutOwner(dsl -> dsl.update(INGESTION_JOBS)
                .set(INGESTION_JOBS.STATUS, "DEAD")
                .set(INGESTION_JOBS.LOCKED_BY, (String) null)
                .set(INGESTION_JOBS.LOCKED_UNTIL, (java.time.OffsetDateTime) null)
                .set(INGESTION_JOBS.LAST_ERROR, error)
                .set(INGESTION_JOBS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(INGESTION_JOBS.ID.eq(jobId))
                .execute());
    }

    public Map<String, Integer> countByStatus() {
        return scope.callWithoutOwner(dsl -> dsl.select(INGESTION_JOBS.STATUS, DSL.count())
                .from(INGESTION_JOBS)
                .groupBy(INGESTION_JOBS.STATUS)
                .fetch()
                .stream()
                .collect(Collectors.toMap(r -> r.value1(), r -> r.value2())));
    }
}
