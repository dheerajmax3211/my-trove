package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.shared.file.DownloadTokenService;
import com.personalplatform.shared.file.DownloadTokenService.InvalidTokenException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DownloadTokenServiceTest {

    private static final byte[] SECRET = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8);

    private final MutableClock clock = new MutableClock(TestBeans.T0);
    private final DownloadTokenService svc =
            new DownloadTokenService(SECRET, clock, Duration.ofMinutes(10), Duration.ofHours(1));

    @Test
    void roundTrip() {
        UUID id = UUID.randomUUID();
        var issued = svc.issue(id, Duration.ofSeconds(30));
        assertThat(svc.verify(issued.token())).isEqualTo(id);
        assertThat(issued.expiresAt()).isEqualTo(TestBeans.T0.plusSeconds(30));
    }

    @Test
    void expiresExactlyAtTheDeadline() {
        String t = svc.issue(UUID.randomUUID(), Duration.ofSeconds(30)).token();
        clock.advance(Duration.ofSeconds(29));
        svc.verify(t);
        clock.advance(Duration.ofSeconds(1));
        assertThatThrownBy(() -> svc.verify(t)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void differentSecretCannotVerify() {
        String t = svc.issue(UUID.randomUUID(), null).token();
        var other = new DownloadTokenService("ffffffffffffffffffffffffffffffff".getBytes(StandardCharsets.UTF_8), clock,
                Duration.ofMinutes(10), Duration.ofHours(1));
        assertThatThrownBy(() -> other.verify(t)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void malformedInputsAreRejectedUniformly() {
        for (String bad : new String[] {null, "", ".", "a", "a.b", "a.b.c", "!!!.???", "djEuYQ.AAAA"}) {
            assertThatThrownBy(() -> svc.verify(bad)).isInstanceOf(InvalidTokenException.class);
        }
    }

    @Test
    void ttlMustBePositiveAndBounded() {
        assertThatThrownBy(() -> svc.issue(UUID.randomUUID(), Duration.ZERO)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> svc.issue(UUID.randomUUID(), Duration.ofHours(2))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void shortSecretIsRefused() {
        assertThatThrownBy(() -> new DownloadTokenService("short".getBytes(StandardCharsets.UTF_8), clock,
                Duration.ofMinutes(1), Duration.ofHours(1))).isInstanceOf(IllegalArgumentException.class);
    }
}
