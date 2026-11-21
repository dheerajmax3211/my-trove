package com.personalplatform.platform.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class UsageEventParserTest {

    private final UsageEventParser parser = new UsageEventParser();

    private static final String ID = "0192f0c2-7a3b-7c1d-8e4f-123456789abc";

    private static String valid(String... overrides) {
        String base = "{\"eventId\":\"" + ID + "\",\"ts\":\"2031-04-01T10:00:00Z\",\"requestId\":\"r1\",\"principalType\":\"USER\","
                + "\"principalId\":\"u1\",\"appId\":null,\"service\":\"shared\",\"method\":\"GET\",\"routeTemplate\":\"/v1/x/{id}\","
                + "\"status\":200,\"latencyMs\":12,\"requestBytes\":1,\"responseBytes\":2,\"plan\":\"PRO\",\"rateLimited\":true}";
        for (int i = 0; i < overrides.length; i += 2) {
            String key = overrides[i];
            String replacement = overrides[i + 1];
            base = base.replaceAll("\"" + key + "\":(\"[^\"]*\"|[^,}]*)", replacement == null ? "\"x\":0" : "\"" + key + "\":" + replacement);
        }
        return base;
    }

    @Test
    void aValidEventIsParsedWithEveryField() {
        UsageEvent e = parser.parse(valid());
        assertThat(e.eventId()).isEqualTo(UUID.fromString(ID));
        assertThat(e.ts()).isEqualTo(Instant.parse("2031-04-01T10:00:00Z"));
        assertThat(e.principalType()).isEqualTo(PrincipalType.USER);
        assertThat(e.principalId()).isEqualTo("u1");
        assertThat(e.appId()).isNull();
        assertThat(e.service()).isEqualTo("shared");
        assertThat(e.routeTemplate()).isEqualTo("/v1/x/{id}");
        assertThat(e.status()).isEqualTo(200);
        assertThat(e.latencyMs()).isEqualTo(12);
        assertThat(e.requestBytes()).isEqualTo(1);
        assertThat(e.responseBytes()).isEqualTo(2);
        assertThat(e.plan()).isEqualTo("PRO");
        assertThat(e.rateLimited()).isTrue();
    }

    @Test
    void optionalFieldsDefaultAndTsMayBeEpochMillisOrAnOffsetDateTime() {
        String minimal = "{\"eventId\":\"" + ID + "\",\"ts\":1932012000000,\"principalType\":\"ANON\",\"principalId\":\"anon:ab12\","
                + "\"service\":\"auth\",\"method\":\"POST\",\"routeTemplate\":\"/v1/token/exchange\",\"status\":401,\"latencyMs\":3}";
        UsageEvent e = parser.parse(minimal);
        assertThat(e.ts()).isEqualTo(Instant.ofEpochMilli(1932012000000L));
        assertThat(e.requestBytes()).isZero();
        assertThat(e.responseBytes()).isZero();
        assertThat(e.plan()).isNull();
        assertThat(e.rateLimited()).isFalse();

        assertThat(parser.parse(valid("ts", "\"2031-04-01T12:00:00+02:00\"")).ts()).isEqualTo(Instant.parse("2031-04-01T10:00:00Z"));
    }

    @Test
    void unknownFieldsAreIgnoredSoTheContractCanGrow() {
        assertThat(parser.parse(valid().replaceAll("}$", ",\"futureField\":{\"a\":1}}"))).isNotNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "not json",
            "[]",
            "\"text\"",
            "null",
            "{}",
            "{\"eventId\":\"nope\"}"})
    void garbageIsRejected(String payload) {
        assertThatThrownBy(() -> parser.parse(payload)).isInstanceOf(InvalidUsageEventException.class);
    }

    @Test
    void nullPayloadIsRejected() {
        assertThatThrownBy(() -> parser.parse(null)).isInstanceOf(InvalidUsageEventException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "eventId|\"not-a-uuid\"",
            "ts|\"yesterday\"",
            "ts|1",                       // epoch millis of 1970: a seconds / millis mix-up, would spray chunks
            "ts|\"1999-01-01T00:00:00Z\"",
            "ts|\"2200-01-01T00:00:00Z\"",
            "principalType|\"ROBOT\"",
            "principalType|\"user\"",
            "principalId|\"\"",
            "service|\"\"",
            "method|\"\"",
            "routeTemplate|\"\"",
            "status|99",
            "status|600",
            "status|\"abc\"",
            "latencyMs|-1",
            "latencyMs|\"slow\"",
            "requestBytes|-5",
            "responseBytes|-5"})
    void fieldViolationsAreRejected(String keyAndValue) {
        String[] kv = keyAndValue.split("\\|", 2);
        assertThatThrownBy(() -> parser.parse(valid(kv[0], kv[1]))).isInstanceOf(InvalidUsageEventException.class);
    }

    @Test
    void overlongValuesAreRejectedInsteadOfFailingTheInsert() {
        assertThatThrownBy(() -> parser.parse(valid("principalId", "\"" + "p".repeat(129) + "\"")))
                .isInstanceOf(InvalidUsageEventException.class);
        assertThatThrownBy(() -> parser.parse(valid("routeTemplate", "\"/" + "r".repeat(256) + "\"")))
                .isInstanceOf(InvalidUsageEventException.class);
    }

    @Test
    void missingRequiredFieldsAreNamedInTheReason() {
        assertThatThrownBy(() -> parser.parse(valid().replace("\"service\":\"shared\",", "")))
                .isInstanceOf(InvalidUsageEventException.class).hasMessageContaining("service");
    }
}
