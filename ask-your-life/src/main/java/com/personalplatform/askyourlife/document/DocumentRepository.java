package com.personalplatform.askyourlife.document;

import static com.personalplatform.sql.jooq.ask_life.ask_life.Tables.DOCUMENTS;
import static com.personalplatform.sql.jooq.ask_life.ask_life.Tables.INGESTION_JOBS;

import com.personalplatform.askyourlife.rls.OwnerScope;
import com.personalplatform.sql.jooq.ask_life.ask_life.tables.records.DocumentsRecord;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

/** All access goes through {@link OwnerScope}; the explicit owner predicates are belt, RLS is the braces. */
@Repository
public class DocumentRepository {

    /** Text and hash to index, read by the worker. */
    public record IndexingInput(UUID id, String contentHash, String content) {}

    private final OwnerScope scope;

    public DocumentRepository(OwnerScope scope) {
        this.scope = scope;
    }

    /** Inserts unless a unique constraint (owner+hash, owner+external id) already holds; true when inserted. */
    public boolean insertIfAbsent(Document d, String content) {
        return scope.call(d.ownerUid(), dsl -> dsl.insertInto(DOCUMENTS)
                .set(DOCUMENTS.ID, d.id())
                .set(DOCUMENTS.OWNER_UID, d.ownerUid())
                .set(DOCUMENTS.SOURCE_TYPE, d.sourceType().name())
                .set(DOCUMENTS.EXTERNAL_ID, d.externalId())
                .set(DOCUMENTS.TITLE, d.title())
                .set(DOCUMENTS.MIME_TYPE, d.mimeType())
                .set(DOCUMENTS.CONTENT_HASH, d.contentHash())
                .set(DOCUMENTS.CONTENT, content)
                .set(DOCUMENTS.STATUS, d.status().name())
                .set(DOCUMENTS.CHUNK_COUNT, 0)
                .set(DOCUMENTS.CREATED_AT, d.createdAt().atOffset(ZoneOffset.UTC))
                .set(DOCUMENTS.UPDATED_AT, d.updatedAt().atOffset(ZoneOffset.UTC))
                .onConflictDoNothing()
                .execute() == 1);
    }

    /** Replaces content and marks the document PENDING; existing chunks stay searchable until reindexed. */
    public void replaceContent(String ownerUid, UUID id, String title, String mimeType, String hash, String content,
            Instant now) {
        scope.run(ownerUid, dsl -> dsl.update(DOCUMENTS)
                .set(DOCUMENTS.TITLE, title)
                .set(DOCUMENTS.MIME_TYPE, mimeType)
                .set(DOCUMENTS.CONTENT_HASH, hash)
                .set(DOCUMENTS.CONTENT, content)
                .set(DOCUMENTS.STATUS, DocumentStatus.PENDING.name())
                .set(DOCUMENTS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(DOCUMENTS.ID.eq(id).and(DOCUMENTS.OWNER_UID.eq(ownerUid)))
                .execute());
    }

    public Optional<Document> findById(String ownerUid, UUID id) {
        return find(ownerUid, DOCUMENTS.ID.eq(id));
    }

    public Optional<Document> findByHash(String ownerUid, String hash) {
        return find(ownerUid, DOCUMENTS.CONTENT_HASH.eq(hash));
    }

    public Optional<Document> findByExternalId(String ownerUid, String externalId) {
        return find(ownerUid, DOCUMENTS.EXTERNAL_ID.eq(externalId));
    }

    private Optional<Document> find(String ownerUid, Condition condition) {
        return scope.call(ownerUid, dsl -> dsl.select(columns())
                .from(DOCUMENTS)
                .where(DOCUMENTS.OWNER_UID.eq(ownerUid).and(condition))
                .fetchOptional(DocumentRepository::map));
    }

    public List<Document> list(String ownerUid, SourceType type, int limit, int offset) {
        return scope.call(ownerUid, dsl -> dsl.select(columns())
                .from(DOCUMENTS)
                .where(DOCUMENTS.OWNER_UID.eq(ownerUid))
                .and(type == null ? org.jooq.impl.DSL.noCondition() : DOCUMENTS.SOURCE_TYPE.eq(type.name()))
                .orderBy(DOCUMENTS.CREATED_AT.desc(), DOCUMENTS.ID.desc())
                .limit(limit)
                .offset(offset)
                .fetch(DocumentRepository::map));
    }

    /** Deletes the document; chunks and jobs go with it (ON DELETE CASCADE). */
    public boolean delete(String ownerUid, UUID id) {
        return scope.call(ownerUid, dsl -> dsl.deleteFrom(DOCUMENTS)
                .where(DOCUMENTS.ID.eq(id).and(DOCUMENTS.OWNER_UID.eq(ownerUid)))
                .execute() == 1);
    }

    public Optional<IndexingInput> loadForIndexing(String ownerUid, UUID id) {
        return scope.call(ownerUid, dsl -> dsl.select(DOCUMENTS.ID, DOCUMENTS.CONTENT_HASH, DOCUMENTS.CONTENT)
                .from(DOCUMENTS)
                .where(DOCUMENTS.ID.eq(id).and(DOCUMENTS.OWNER_UID.eq(ownerUid)))
                .fetchOptional(r -> new IndexingInput(r.value1(), r.value2(), r.value3())));
    }

    /** Marks FAILED, but only if the document still has the content the dead job was for. */
    public void markFailed(String ownerUid, UUID id, String contentHash, Instant now) {
        scope.run(ownerUid, dsl -> dsl.update(DOCUMENTS)
                .set(DOCUMENTS.STATUS, DocumentStatus.FAILED.name())
                .set(DOCUMENTS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(DOCUMENTS.ID.eq(id).and(DOCUMENTS.OWNER_UID.eq(ownerUid))
                        .and(DOCUMENTS.CONTENT_HASH.eq(contentHash)))
                .execute());
    }

    /** The last error of the document's unfinished indexing job (the job queue is not row-scoped: see V1 notes). */
    private static final Field<String> INDEXING_ERROR = DSL.field(
            DSL.select(INGESTION_JOBS.LAST_ERROR)
                    .from(INGESTION_JOBS)
                    .where(INGESTION_JOBS.DOCUMENT_ID.eq(DOCUMENTS.ID))
                    .and(INGESTION_JOBS.STATUS.ne("DONE"))
                    .orderBy(INGESTION_JOBS.UPDATED_AT.desc())
                    .limit(1)).as("indexing_error");

    private static org.jooq.SelectField<?>[] columns() {
        return new org.jooq.SelectField<?>[] {
            DOCUMENTS.ID, DOCUMENTS.OWNER_UID, DOCUMENTS.SOURCE_TYPE, DOCUMENTS.EXTERNAL_ID, DOCUMENTS.TITLE,
            DOCUMENTS.MIME_TYPE, DOCUMENTS.CONTENT_HASH, DOCUMENTS.STATUS, DOCUMENTS.CHUNK_COUNT,
            DOCUMENTS.CREATED_AT, DOCUMENTS.UPDATED_AT, DOCUMENTS.INGESTED_AT, INDEXING_ERROR
        };
    }

    private static Document map(Record r) {
        return new Document(
                r.get(DOCUMENTS.ID),
                r.get(DOCUMENTS.OWNER_UID),
                SourceType.valueOf(r.get(DOCUMENTS.SOURCE_TYPE)),
                r.get(DOCUMENTS.EXTERNAL_ID),
                r.get(DOCUMENTS.TITLE),
                r.get(DOCUMENTS.MIME_TYPE),
                r.get(DOCUMENTS.CONTENT_HASH),
                DocumentStatus.valueOf(r.get(DOCUMENTS.STATUS)),
                r.get(DOCUMENTS.CHUNK_COUNT),
                r.get(DOCUMENTS.CREATED_AT).toInstant(),
                r.get(DOCUMENTS.UPDATED_AT).toInstant(),
                r.get(DOCUMENTS.INGESTED_AT) == null ? null : r.get(DOCUMENTS.INGESTED_AT).toInstant(),
                r.get("indexing_error", String.class));
    }
}
