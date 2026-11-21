package com.personalplatform.consent.audit;

/**
 * Result of walking one owner's chain. {@code firstBrokenSeq} is the first entry that fails verification (or the first
 * missing entry); {@code headHash} is the tail hash an owner can pin externally to detect later rewrites.
 */
public record ChainReport(
        boolean valid, long entriesChecked, Long firstBrokenSeq, String reason, long headSeq, String headHash) {}
