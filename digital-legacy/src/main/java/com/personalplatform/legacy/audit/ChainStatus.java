package com.personalplatform.legacy.audit;

/** Result of recomputing a vault's audit hash chain. */
public record ChainStatus(boolean intact, long length, String headHash, Long firstBadSeq) {}
