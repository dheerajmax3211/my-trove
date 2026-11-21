package com.personalplatform.homepulse.ingest;

import java.time.Instant;

/** One validated sample ready to be stored for a device. */
public record ReadingInput(Instant ts, double watts, Double volts, Double amps) {}
