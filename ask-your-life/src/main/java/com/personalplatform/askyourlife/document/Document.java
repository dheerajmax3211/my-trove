package com.personalplatform.askyourlife.document;

import java.time.Instant;
import java.util.UUID;

/** Document metadata (the stored text is deliberately not part of this record). */
public record Document(
        UUID id,
        String ownerUid,
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
        /**
         * Why indexing has not succeeded yet: the last error of the document's unfinished job (a retry is queued, or
         * the job was given up). Null when the document is indexed or has never failed.
         */
        String indexingError) {}
