package com.personalplatform.consent.policy;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.consent.policy.Decision.Effect;
import com.personalplatform.consent.policy.Decision.Reason;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** Table-driven: each row is (name, grant tweak, attempt, instant, expected reason). No Spring, no DB, no clock. */
class PolicyEngineTest {

    static final Instant NOW = Instant.parse("2026-01-15T14:00:00Z");
    static final String CLIENT = "cl_shoes";
    static final PolicyEngine ENGINE = new PolicyEngine();

    static PolicyGrant baseGrant() {
        return new PolicyGrant(
                UUID.randomUUID(),
                CLIENT,
                Set.of(Scope.parse("profile.sizes:read")),
                "sizing",
                NOW.plusSeconds(3600),
                3,
                0,
                null,
                Sensitivity.SENSITIVE,
                null);
    }

    static PolicyGrant with(UnaryOperator<PolicyGrant> f) {
        return f.apply(baseGrant());
    }

    static AccessAttempt exact(String path) {
        return AccessAttempt.exact(CLIENT, path, null);
    }

    record Row(String name, PolicyGrant grant, AccessAttempt attempt, Instant now, Reason expected) {
        @Override
        public String toString() {
            return name;
        }
    }

    static Row row(String name, PolicyGrant g, AccessAttempt a, Reason expected) {
        return new Row(name, g, a, NOW, expected);
    }

    static Stream<Row> table() {
        return Stream.of(
                // --- deny by default
                row("null grant is denied", null, exact("profile.sizes.shoe"), Reason.NO_GRANT),
                row("grant without scopes is denied", with(g -> new PolicyGrant(g.id(), CLIENT, Set.of(), "sizing", g.expiresAt(), 3, 0, null, Sensitivity.SENSITIVE, null)),
                        exact("profile.sizes"), Reason.SCOPE_NOT_GRANTED),
                row("null attempt is denied", baseGrant(), null, Reason.INVALID_REQUEST),
                row("invalid path is denied", baseGrant(), exact("Profile.Sizes"), Reason.INVALID_REQUEST),
                row("path with empty segment is denied", baseGrant(), exact("profile..sizes"), Reason.INVALID_REQUEST),
                row("empty path is denied", baseGrant(), exact(""), Reason.INVALID_REQUEST),
                row("null path is denied", baseGrant(), exact(null), Reason.INVALID_REQUEST),

                // --- scopes: exact + descendants only, whole segments
                row("exact scope path is allowed", baseGrant(), exact("profile.sizes"), Reason.OK),
                row("descendant is allowed", baseGrant(), exact("profile.sizes.shoe"), Reason.OK),
                row("deep descendant is allowed", baseGrant(), exact("profile.sizes.shoe.eu"), Reason.OK),
                row("sibling sharing a string prefix is denied", baseGrant(), exact("profile.sizes_secret"), Reason.SCOPE_NOT_GRANTED),
                row("descendant of the look-alike sibling is denied", baseGrant(), exact("profile.sizes_secret.code"), Reason.SCOPE_NOT_GRANTED),
                row("path continuing the last segment is denied", baseGrant(), exact("profile.sizesx"), Reason.SCOPE_NOT_GRANTED),
                row("shorter prefix of the segment is denied", baseGrant(), exact("profile.size"), Reason.SCOPE_NOT_GRANTED),
                row("parent of the scope is denied for exact reads", baseGrant(), exact("profile"), Reason.SCOPE_NOT_GRANTED),
                row("unrelated path is denied", baseGrant(), exact("health.allergies"), Reason.SCOPE_NOT_GRANTED),

                // --- scope narrowing: a narrower approved scope never leaks the wider area
                row("narrowed scope allows its own subtree",
                        with(g -> new PolicyGrant(g.id(), CLIENT, Set.of(Scope.parse("profile.sizes.shoe:read")), "sizing", g.expiresAt(), 3, 0, null, Sensitivity.SENSITIVE, null)),
                        exact("profile.sizes.shoe.eu"), Reason.OK),
                row("narrowed scope denies its sibling",
                        with(g -> new PolicyGrant(g.id(), CLIENT, Set.of(Scope.parse("profile.sizes.shoe:read")), "sizing", g.expiresAt(), 3, 0, null, Sensitivity.SENSITIVE, null)),
                        exact("profile.sizes.shirt"), Reason.SCOPE_NOT_GRANTED),
                row("any one of several scopes is enough",
                        with(g -> new PolicyGrant(g.id(), CLIENT, Set.of(Scope.parse("profile.sizes:read"), Scope.parse("health.allergies:read")), "sizing", g.expiresAt(), 3, 0, null, Sensitivity.SENSITIVE, null)),
                        exact("health.allergies.nuts"), Reason.OK),

                // --- prefix queries
                row("query over a parent of a scope is allowed (filtered later)", baseGrant(), AccessAttempt.query(CLIENT, "profile", null), Reason.OK),
                row("query over the scope is allowed", baseGrant(), AccessAttempt.query(CLIENT, "profile.sizes", null), Reason.OK),
                row("query with no path means 'what I may see'", baseGrant(), AccessAttempt.query(CLIENT, null, null), Reason.OK),
                row("query over a look-alike sibling is denied", baseGrant(), AccessAttempt.query(CLIENT, "profile.sizes_secret", null), Reason.SCOPE_NOT_GRANTED),
                row("query over an unrelated tree is denied", baseGrant(), AccessAttempt.query(CLIENT, "address", null), Reason.SCOPE_NOT_GRANTED),

                // --- client binding
                row("another client cannot use the grant", baseGrant(), AccessAttempt.exact("cl_other", "profile.sizes.shoe", null), Reason.CLIENT_MISMATCH),

                // --- revocation
                row("revoked grant is denied", with(g -> withRevoked(g, NOW.minusSeconds(1))), exact("profile.sizes.shoe"), Reason.GRANT_REVOKED),
                row("revoked at exactly now is denied", with(g -> withRevoked(g, NOW)), exact("profile.sizes.shoe"), Reason.GRANT_REVOKED),
                row("revocation scheduled in the future does not apply yet", with(g -> withRevoked(g, NOW.plusSeconds(60))), exact("profile.sizes.shoe"), Reason.OK),
                row("revocation wins over expiry in the reason", with(g -> withRevoked(withExpiry(g, NOW.minusSeconds(10)), NOW.minusSeconds(5))), exact("profile.sizes.shoe"), Reason.GRANT_REVOKED),

                // --- expiry (boundary conditions)
                row("one second before expiry is allowed", with(g -> withExpiry(g, NOW.plusSeconds(1))), exact("profile.sizes.shoe"), Reason.OK),
                row("exactly at expiry is denied", with(g -> withExpiry(g, NOW)), exact("profile.sizes.shoe"), Reason.GRANT_EXPIRED),
                row("after expiry is denied", with(g -> withExpiry(g, NOW.minusSeconds(1))), exact("profile.sizes.shoe"), Reason.GRANT_EXPIRED),
                row("grant without expiry is denied (fail closed)", with(g -> withExpiry(g, null)), exact("profile.sizes.shoe"), Reason.GRANT_EXPIRED),

                // --- max_reads
                row("unused budget is allowed", with(g -> withReads(g, 3, 0)), exact("profile.sizes.shoe"), Reason.OK),
                row("last read of the budget is allowed", with(g -> withReads(g, 3, 2)), exact("profile.sizes.shoe"), Reason.OK),
                row("budget used up is denied", with(g -> withReads(g, 3, 3)), exact("profile.sizes.shoe"), Reason.MAX_READS_EXHAUSTED),
                row("budget overshoot is denied", with(g -> withReads(g, 3, 7)), exact("profile.sizes.shoe"), Reason.MAX_READS_EXHAUSTED),
                row("unlimited reads are allowed", with(g -> withReads(g, null, 100_000)), exact("profile.sizes.shoe"), Reason.OK),
                row("single-read grant, first read", with(g -> withReads(g, 1, 0)), exact("profile.sizes.shoe"), Reason.OK),
                row("single-read grant, second read", with(g -> withReads(g, 1, 1)), exact("profile.sizes.shoe"), Reason.MAX_READS_EXHAUSTED),

                // --- time windows (NOW = 14:00 UTC = 09:00 in New York in January)
                row("inside a UTC window", with(g -> withWindow(g, new TimeWindow(9, 17, ZoneId.of("UTC")))), exact("profile.sizes.shoe"), Reason.OK),
                row("window start is inclusive", with(g -> withWindow(g, new TimeWindow(14, 18, ZoneId.of("UTC")))), exact("profile.sizes.shoe"), Reason.OK),
                row("window end is exclusive", with(g -> withWindow(g, new TimeWindow(10, 14, ZoneId.of("UTC")))), exact("profile.sizes.shoe"), Reason.OUTSIDE_ALLOWED_HOURS),
                row("outside a UTC window", with(g -> withWindow(g, new TimeWindow(18, 23, ZoneId.of("UTC")))), exact("profile.sizes.shoe"), Reason.OUTSIDE_ALLOWED_HOURS),
                row("window is evaluated in its own zone (09:00 NY is inside 9-17)", with(g -> withWindow(g, new TimeWindow(9, 17, ZoneId.of("America/New_York")))), exact("profile.sizes.shoe"), Reason.OK),
                row("same instant is outside 10-17 New York", with(g -> withWindow(g, new TimeWindow(10, 17, ZoneId.of("America/New_York")))), exact("profile.sizes.shoe"), Reason.OUTSIDE_ALLOWED_HOURS),
                row("midnight-wrapping window excludes the afternoon", with(g -> withWindow(g, new TimeWindow(22, 6, ZoneId.of("UTC")))), exact("profile.sizes.shoe"), Reason.OUTSIDE_ALLOWED_HOURS),
                row("until-midnight window (end 24) includes 14:00", with(g -> withWindow(g, new TimeWindow(12, 24, ZoneId.of("UTC")))), exact("profile.sizes.shoe"), Reason.OK),

                // --- purpose
                row("matching purpose is allowed", baseGrant(), AccessAttempt.exact(CLIENT, "profile.sizes.shoe", "sizing"), Reason.OK),
                row("different purpose is denied", baseGrant(), AccessAttempt.exact(CLIENT, "profile.sizes.shoe", "marketing"), Reason.PURPOSE_MISMATCH),

                // --- evaluation order: state is checked before scope
                row("expired grant reports expiry even for an out-of-scope path", with(g -> withExpiry(g, NOW.minusSeconds(1))), exact("health.allergies"), Reason.GRANT_EXPIRED));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("table")
    void decides(Row row) {
        Decision d = ENGINE.evaluate(row.grant(), row.attempt(), row.now());
        assertThat(d.reason()).as(row.name()).isEqualTo(row.expected());
        assertThat(d.effect()).isEqualTo(row.expected() == Reason.OK ? Effect.ALLOW : Effect.DENY);
        assertThat(d.message()).isNotBlank();
    }

    @Test
    void nullClockIsDeniedNotAnException() {
        assertThat(ENGINE.evaluate(baseGrant(), exact("profile.sizes"), null).effect()).isEqualTo(Effect.DENY);
    }

    // ---- per-attribute release filter (sensitivity ceiling + scope)

    static Stream<Arguments> releaseTable() {
        return Stream.of(
                Arguments.of("covered + below ceiling", "profile.sizes.shoe", Sensitivity.PERSONAL, true),
                Arguments.of("covered + exactly at ceiling", "profile.sizes.shoe", Sensitivity.SENSITIVE, true),
                Arguments.of("covered but above ceiling", "profile.sizes.shoe", Sensitivity.RESTRICTED, false),
                Arguments.of("look-alike sibling", "profile.sizes_secret.code", Sensitivity.PUBLIC, false),
                Arguments.of("parent path", "profile", Sensitivity.PUBLIC, false),
                Arguments.of("invalid path", "Profile..", Sensitivity.PUBLIC, false));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("releaseTable")
    void mayRelease(String name, String path, Sensitivity s, boolean expected) {
        assertThat(ENGINE.mayRelease(baseGrant(), path, s)).as(name).isEqualTo(expected);
    }

    @Test
    void mayReleaseDeniesNulls() {
        assertThat(ENGINE.mayRelease(null, "profile.sizes", Sensitivity.PUBLIC)).isFalse();
        assertThat(ENGINE.mayRelease(baseGrant(), null, Sensitivity.PUBLIC)).isFalse();
        assertThat(ENGINE.mayRelease(baseGrant(), "profile.sizes", null)).isFalse();
    }

    // ---- helpers building modified copies of the immutable grant

    static PolicyGrant withRevoked(PolicyGrant g, Instant at) {
        return new PolicyGrant(g.id(), g.clientId(), g.scopes(), g.purpose(), g.expiresAt(), g.maxReads(), g.readsUsed(), at, g.maxSensitivity(), g.window());
    }

    static PolicyGrant withExpiry(PolicyGrant g, Instant at) {
        return new PolicyGrant(g.id(), g.clientId(), g.scopes(), g.purpose(), at, g.maxReads(), g.readsUsed(), g.revokedAt(), g.maxSensitivity(), g.window());
    }

    static PolicyGrant withReads(PolicyGrant g, Integer max, int used) {
        return new PolicyGrant(g.id(), g.clientId(), g.scopes(), g.purpose(), g.expiresAt(), max, used, g.revokedAt(), g.maxSensitivity(), g.window());
    }

    static PolicyGrant withWindow(PolicyGrant g, TimeWindow w) {
        return new PolicyGrant(g.id(), g.clientId(), g.scopes(), g.purpose(), g.expiresAt(), g.maxReads(), g.readsUsed(), g.revokedAt(), g.maxSensitivity(), w);
    }
}
