package com.personalplatform.askyourlife.ingest;

import static com.personalplatform.sql.jooq.ask_life.ask_life.Tables.CHUNKS;
import static com.personalplatform.sql.jooq.ask_life.ask_life.Tables.DOCUMENTS;

import com.personalplatform.askyourlife.chunking.TextChunk;
import com.personalplatform.askyourlife.document.DocumentStatus;
import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.rls.OwnerScope;
import com.personalplatform.sql.UuidV7;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.jooq.Field;
import org.jooq.impl.DSL;
import org.jooq.impl.SQLDataType;
import org.springframework.stereotype.Repository;

/** Chunk writes. The pgvector / tsvector columns are not in the generated model, so they are addressed here. */
@Repository
public class ChunkRepository {

    /** The {@code embedding vector(384)} column (added by the ask_life_ext migrations). */
    public static final Field<Object> EMBEDDING = DSL.field(DSL.name("embedding"), SQLDataType.OTHER);

    private static final int INSERT_BATCH = 400;

    private final OwnerScope scope;

    public ChunkRepository(OwnerScope scope) {
        this.scope = scope;
    }

    /** pgvector text form: {@code [0.1,0.2,...]}. */
    public static String vectorLiteral(float[] v) {
        StringBuilder sb = new StringBuilder(v.length * 10).append('[');
        for (int i = 0; i < v.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(v[i]);
        }
        return sb.append(']').toString();
    }

    /**
     * Atomically replaces all chunks of a document, provided its content still has {@code expectedHash}.
     * The document row is locked ({@code FOR UPDATE}) first, so concurrent replacements and edits serialise, and
     * delete + insert + status update happen in one transaction: readers see the old chunk set or the new one,
     * never a mixture or an empty set. Returns false (and writes nothing) when the document is gone or changed.
     */
    public boolean replaceChunks(String ownerUid, UUID documentId, String expectedHash, List<TextChunk> chunks,
            List<float[]> vectors, Instant now) {
        if (chunks.size() != vectors.size()) {
            throw new IllegalArgumentException("one vector per chunk required");
        }
        return scope.call(ownerUid, dsl -> {
            var doc = dsl.select(DOCUMENTS.CONTENT_HASH, DOCUMENTS.SOURCE_TYPE, DOCUMENTS.CREATED_AT)
                    .from(DOCUMENTS)
                    .where(DOCUMENTS.ID.eq(documentId).and(DOCUMENTS.OWNER_UID.eq(ownerUid)))
                    .forUpdate()
                    .fetchOne();
            if (doc == null || !doc.value1().equals(expectedHash)) {
                return false;
            }
            SourceType type = SourceType.valueOf(doc.value2());
            dsl.deleteFrom(CHUNKS).where(CHUNKS.DOCUMENT_ID.eq(documentId)).execute();
            for (int from = 0; from < chunks.size(); from += INSERT_BATCH) {
                int to = Math.min(chunks.size(), from + INSERT_BATCH);
                var insert = dsl.insertInto(CHUNKS)
                        .columns(CHUNKS.ID, CHUNKS.DOCUMENT_ID, CHUNKS.OWNER_UID, CHUNKS.SOURCE_TYPE,
                                CHUNKS.DOC_CREATED_AT, CHUNKS.ORDINAL, CHUNKS.CONTENT, CHUNKS.TOKEN_COUNT,
                                CHUNKS.CREATED_AT, EMBEDDING);
                for (int i = from; i < to; i++) {
                    TextChunk c = chunks.get(i);
                    insert = insert.values(UuidV7.next(), documentId, ownerUid, type.name(), doc.value3(),
                            c.ordinal(), c.text(), c.tokens(), now.atOffset(ZoneOffset.UTC),
                            DSL.field("cast({0} as public.vector)", Object.class,
                                    DSL.val(vectorLiteral(vectors.get(i)))));
                }
                insert.execute();
            }
            dsl.update(DOCUMENTS)
                    .set(DOCUMENTS.STATUS, DocumentStatus.INDEXED.name())
                    .set(DOCUMENTS.CHUNK_COUNT, chunks.size())
                    .set(DOCUMENTS.INGESTED_AT, now.atOffset(ZoneOffset.UTC))
                    .where(DOCUMENTS.ID.eq(documentId))
                    .execute();
            return true;
        });
    }

    public int countForDocument(String ownerUid, UUID documentId) {
        return scope.call(ownerUid, dsl -> dsl.fetchCount(CHUNKS, CHUNKS.DOCUMENT_ID.eq(documentId)));
    }
}
