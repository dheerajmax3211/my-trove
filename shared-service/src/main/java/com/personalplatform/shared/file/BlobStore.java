package com.personalplatform.shared.file;

import java.io.IOException;
import java.io.InputStream;

/**
 * Where file bytes live. The service only stores metadata in Postgres; swap the implementation (S3, GCS, ...) without
 * touching callers. Keys are opaque, server-generated strings (never client-supplied).
 */
public interface BlobStore {

    /** Stores the stream under {@code key} (overwriting) and returns the number of bytes written. */
    long put(String key, InputStream data) throws IOException;

    /** Opens the blob; throws {@link java.nio.file.NoSuchFileException} when missing. */
    InputStream open(String key) throws IOException;

    /** @return true if something was deleted. */
    boolean delete(String key) throws IOException;

    boolean exists(String key);
}
