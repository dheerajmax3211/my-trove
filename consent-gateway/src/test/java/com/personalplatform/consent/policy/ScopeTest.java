package com.personalplatform.consent.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class ScopeTest {

    @Test
    void parsesAndPrintsCanonically() {
        Scope s = Scope.parse("profile.sizes:read");
        assertThat(s.path()).isEqualTo("profile.sizes");
        assertThat(s.action()).isEqualTo("read");
        assertThat(s).hasToString("profile.sizes:read");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", ":read", "profile.sizes", "profile.sizes:", "profile.sizes:write", "profile.sizes:READ",
            "Profile.sizes:read", "profile..sizes:read", ".profile:read", "profile.:read", "profile sizes:read",
            "profile.sizes:read:read", "profile/sizes:read", "profile.*:read", "*:read"})
    void rejectsMalformedScopes(String bad) {
        assertThatThrownBy(() -> Scope.parse(bad)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsNullAndOverlongPaths() {
        assertThatThrownBy(() -> Scope.parse(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Scope.parse("a".repeat(256) + ":read")).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest(name = "{0}:read covers path {1} = {2}")
    @CsvSource({
        "profile.sizes, profile.sizes, true",
        "profile.sizes, profile.sizes.shoe, true",
        "profile.sizes, profile.sizes_secret, false",
        "profile.sizes, profile.sizes_secret.x, false",
        "profile.sizes, profile.sizesx, false",
        "profile.sizes, profile, false",
        "profile, profile.sizes, true",
        "profile.sizes.shoe, profile.sizes, false",
        "a, ab, false",
        "a, a.b, true"
    })
    void coversWholeSegmentsOnly(String scope, String path, boolean expected) {
        assertThat(new Scope(scope, "read").covers(path)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "{0} covers scope {1} = {2}")
    @CsvSource({
        "profile.sizes, profile.sizes.shoe, true",
        "profile.sizes, profile.sizes, true",
        "profile.sizes, profile, false",
        "profile.sizes, profile.sizes_secret, false"
    })
    void coversScopes(String wide, String narrow, boolean expected) {
        assertThat(new Scope(wide, "read").covers(new Scope(narrow, "read"))).isEqualTo(expected);
    }

    @ParameterizedTest(name = "scope {0} overlaps query {1} = {2}")
    @CsvSource({
        "profile.sizes, profile, true",
        "profile.sizes, profile.sizes, true",
        "profile.sizes, profile.sizes.shoe, true",
        "profile.sizes, profile.sizes_secret, false",
        "profile.sizes, profile.size, false",
        "profile.sizes, health, false"
    })
    void overlaps(String scope, String query, boolean expected) {
        assertThat(new Scope(scope, "read").overlaps(query)).isEqualTo(expected);
    }

    @Test
    void timeWindowValidation() {
        ZoneId utc = ZoneId.of("UTC");
        assertThatThrownBy(() -> new TimeWindow(5, 5, utc)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TimeWindow(-1, 5, utc)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TimeWindow(24, 5, utc)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TimeWindow(1, 25, utc)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TimeWindow(1, 2, null)).isInstanceOf(IllegalArgumentException.class);
    }
}
