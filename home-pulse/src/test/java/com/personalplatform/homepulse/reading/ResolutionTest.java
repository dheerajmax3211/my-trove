package com.personalplatform.homepulse.reading;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class ResolutionTest {

    @Test
    void bucketIsChosenFromTheRange() {
        assertThat(Resolution.choose(Duration.ofMinutes(5))).isEqualTo(Resolution.RAW);
        assertThat(Resolution.choose(Duration.ofHours(1))).isEqualTo(Resolution.RAW);
        assertThat(Resolution.choose(Duration.ofHours(1).plusSeconds(1))).isEqualTo(Resolution.ONE_MINUTE);
        assertThat(Resolution.choose(Duration.ofDays(2))).isEqualTo(Resolution.ONE_MINUTE);
        assertThat(Resolution.choose(Duration.ofDays(2).plusSeconds(1))).isEqualTo(Resolution.ONE_HOUR);
        assertThat(Resolution.choose(Duration.ofDays(60))).isEqualTo(Resolution.ONE_HOUR);
        assertThat(Resolution.choose(Duration.ofDays(61))).isEqualTo(Resolution.ONE_DAY);
        assertThat(Resolution.choose(Duration.ofDays(400))).isEqualTo(Resolution.ONE_DAY);
    }

    @Test
    void defaultChoiceNeverExceedsThePointCap() {
        for (long minutes : new long[] {1, 59, 60, 61, 600, 2879, 2880, 2881, 86_399, 86_400, 86_401, 576_000}) {
            Duration range = Duration.ofMinutes(minutes);
            assertThat(Resolution.choose(range).pointsFor(range))
                    .as("range %d min", minutes).isLessThanOrEqualTo(Resolution.MAX_POINTS);
        }
    }
}
