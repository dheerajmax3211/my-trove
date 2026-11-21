package com.personalplatform.homepulse.detect;

import java.time.Instant;

/** One 1-minute bucket of the continuous aggregate: bucket start and mean active power. */
public record MinuteSample(Instant ts, double watts) {}
