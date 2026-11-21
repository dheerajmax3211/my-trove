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
        Instant ingestedAt) {}
