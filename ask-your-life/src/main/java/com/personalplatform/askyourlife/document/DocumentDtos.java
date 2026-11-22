package com.personalplatform.askyourlife.document;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class DocumentDtos {

    private DocumentDtos() {}

    /** JSON ingestion body. */
    public record CreateDocumentRequest(
            @Size(max = 500) String title,
            @NotBlank String text,
            SourceType sourceType,
            /** text/plain (default), text/markdown or text/html: how {@code text} should be interpreted. */
            @Size(max = 100) String mimeType,
            /** Caller's stable id for this item; re-posting with changed text updates the same document. */
            @Size(max = 256) String externalId) {}

    public record UpdateDocumentRequest(
            @Size(max = 500) String title, @NotBlank String text, @Size(max = 100) String mimeType) {}

    public record DocumentResponse(
            UUID id,
            SourceType sourceType,
            String externalId,
            String title,
            String mimeType,
            String contentHash,
            DocumentStatus status,
            int chunkCount,
            Instant createdAt,
            Instant updatedAt,
            Instant ingestedAt,
            /** Why it is not indexed yet (FAILED: given up; PENDING: a retry is queued). Absent when there is no error. */
            String indexingError) {

        public static DocumentResponse from(Document d) {
            return new DocumentResponse(d.id(), d.sourceType(), d.externalId(), d.title(), d.mimeType(),
                    d.contentHash(), d.status(), d.chunkCount(), d.createdAt(), d.updatedAt(), d.ingestedAt(),
                    d.indexingError());
        }
    }

    public record IngestResponse(String outcome, DocumentResponse document) {}
}
