package com.personalplatform.homepulse;

import org.testcontainers.utility.DockerImageName;

/** The TimescaleDB image every home-pulse integration test runs against (pinned; pulled and verified working). */
public final class TimescaleImage {

    public static final String TAG = "timescale/timescaledb:2.32.0-pg16";

    private TimescaleImage() {}

    public static DockerImageName name() {
        return DockerImageName.parse(TAG).asCompatibleSubstituteFor("postgres");
    }
}
