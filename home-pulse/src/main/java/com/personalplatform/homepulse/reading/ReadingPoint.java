package com.personalplatform.homepulse.reading;

import java.time.Instant;

/** One point of a (possibly downsampled) series. For RAW, avg = min = max = the reading and samples = 1. */
public record ReadingPoint(Instant ts, double avgWatts, double minWatts, double maxWatts, Double avgVolts,
                           Double avgAmps, long samples) {}
