package com.personalplatform.platform.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Signing and verification of deliveries (W4 item 4): HMAC-SHA256 over "timestamp.body", bounded replay window. */
class WebhookSignatureTest {

    static final String SECRET = "whsec_test_secret";
    static final String BODY = "{\"eventId\":\"e1\",\"type\":\"reminder.created\"}";
    static final long NOW = 1_900_000_000L;

    @Test
    void aSignatureVerifiesForTheSecretTimestampAndBodyItWasMadeFor() {
        String header = WebhookSignature.sign(SECRET, NOW, BODY);
        assertThat(header).matches("t=1900000000,v1=[0-9a-f]{64}");
        assertThat(WebhookSignature.verify(header, SECRET, BODY, NOW, 300)).isTrue();
        assertThat(WebhookSignature.verify(header, SECRET, BODY, NOW + 300, 300)).as("at the edge of the window").isTrue();
    }

    @Test
    void aTamperedBodyWrongSecretOrStaleTimestampIsRefused() {
        String header = WebhookSignature.sign(SECRET, NOW, BODY);
        assertThat(WebhookSignature.verify(header, SECRET, BODY.replace("e1", "e2"), NOW, 300)).isFalse();
        assertThat(WebhookSignature.verify(header, "whsec_other", BODY, NOW, 300)).isFalse();
        assertThat(WebhookSignature.verify(header, SECRET, BODY, NOW + 301, 300)).as("outside the window").isFalse();
        assertThat(WebhookSignature.verify(header, SECRET, BODY, NOW - 301, 300)).as("from the future, outside the window").isFalse();
    }

    @Test
    void aMalformedHeaderIsRefusedNotThrown() {
        assertThat(WebhookSignature.verify(null, SECRET, BODY, NOW, 300)).isFalse();
        assertThat(WebhookSignature.verify("", SECRET, BODY, NOW, 300)).isFalse();
        assertThat(WebhookSignature.verify("t=abc,v1=00", SECRET, BODY, NOW, 300)).isFalse();
        assertThat(WebhookSignature.verify("v1=00", SECRET, BODY, NOW, 300)).isFalse();
    }

    @Test
    void secretsAreUniqueAndPrefixed() {
        String a = WebhookSignature.newSecret();
        assertThat(a).startsWith("whsec_").hasSizeGreaterThan(30);
        assertThat(WebhookSignature.newSecret()).isNotEqualTo(a);
    }

    @Test
    void theRetryScheduleIsOneFiveThirtyMinutesTwoHoursTwelveHoursThenDead() {
        assertThat(RetryPolicy.MAX_ATTEMPTS).isEqualTo(6);
        assertThat(RetryPolicy.afterFailure(1)).contains(Duration.ofMinutes(1));
        assertThat(RetryPolicy.afterFailure(2)).contains(Duration.ofMinutes(5));
        assertThat(RetryPolicy.afterFailure(3)).contains(Duration.ofMinutes(30));
        assertThat(RetryPolicy.afterFailure(4)).contains(Duration.ofHours(2));
        assertThat(RetryPolicy.afterFailure(5)).contains(Duration.ofHours(12));
        assertThat(RetryPolicy.afterFailure(6)).isEqualTo(Optional.empty());
        assertThatThrownBy(() -> RetryPolicy.afterFailure(0)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theEventCatalogueIsTheFourDomainEvents() {
        assertThat(WebhookEvents.TYPES).containsExactlyInAnyOrder(
                "reminder.created", "approval.decided", "consent.granted", "consent.revoked");
    }
}
