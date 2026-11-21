package com.personalplatform.homepulse.ingest;

/**
 * @param received   readings in the request
 * @param accepted   newly stored
 * @param duplicates already stored (same device and timestamp) and therefore ignored
 * @param rejected   outside the accepted time window (too old / too far in the future)
 */
public record IngestResult(int received, int accepted, int duplicates, int rejected) {}
