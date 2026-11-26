package com.personalplatform.askyourlife.config;

import com.personalplatform.askyourlife.embedding.Embedder;

/**
 * Which embedder was asked for and which one runs. {@code fallbackReason} is non-null when model2vec was requested
 * but could not be loaded and the hashing embedder runs instead.
 */
public record EmbedderSelection(EmbedderProperties.Kind requested, Embedder embedder, String fallbackReason) {

    public boolean fallback() {
        return fallbackReason != null;
    }
}
