package com.personalplatform.askyourlife.ingest;

import java.util.UUID;

/** A claimed ingestion job. {@code attempts} already includes the current attempt. */
public record Job(UUID id, UUID documentId, String ownerUid, String contentHash, int attempts, int maxAttempts) {}
