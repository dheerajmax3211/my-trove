package com.personalplatform.askyourlife.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class RetryPolicyTest {

    private final RetryPolicy policy = new RetryPolicy(5, Duration.ofSeconds(10), Duration.ofMinutes(15));

    @Test
    void backoffDoublesAndIsCapped() {
        assertThat(policy.backoffAfter(1)).isEqualTo(Duration.ofSeconds(10));
        assertThat(policy.backoffAfter(2)).isEqualTo(Duration.ofSeconds(20));
        assertThat(policy.backoffAfter(3)).isEqualTo(Duration.ofSeconds(40));
        assertThat(policy.backoffAfter(8)).isEqualTo(Duration.ofMinutes(15));
        assertThat(policy.backoffAfter(500)).isEqualTo(Duration.ofMinutes(15));
    }

    @Test
    void exhaustionIsAtMaxAttempts() {
        assertThat(policy.exhausted(4)).isFalse();
        assertThat(policy.exhausted(5)).isTrue();
    }

    @Test
    void rejectsInvalidConfiguration() {
        assertThatThrownBy(() -> new RetryPolicy(0, Duration.ofSeconds(1), Duration.ofSeconds(2)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RetryPolicy(3, Duration.ofSeconds(5), Duration.ofSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
