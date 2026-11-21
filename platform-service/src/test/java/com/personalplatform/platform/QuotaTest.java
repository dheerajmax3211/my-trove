package com.personalplatform.platform;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import com.personalplatform.platform.usage.PrincipalType;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class QuotaTest extends AbstractPlatformTest {

    private static final String KEY = "test-internal-key";

    private ResultActions internal(String path) throws Exception {
        return mvc.perform(get(path).header("X-Internal-Key", KEY));
    }

    // ----------------------------------------------------------------- plans

    @Test
    void plansCarryTheSeedValues() throws Exception {
        internal("/internal/v1/plans").andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].plan").value("FREE"))
                .andExpect(jsonPath("$[0].requestsPerMinute").value(120))
                .andExpect(jsonPath("$[0].requestsPerMonth").value(10000))
                .andExpect(jsonPath("$[0].maxApiKeys").value(3))
                .andExpect(jsonPath("$[0].maxWebhooks").value(1))
                .andExpect(jsonPath("$[1].plan").value("PRO"))
                .andExpect(jsonPath("$[1].requestsPerMinute").value(600))
                .andExpect(jsonPath("$[1].requestsPerMonth").value(200000))
                .andExpect(jsonPath("$[1].maxApiKeys").value(10))
                .andExpect(jsonPath("$[1].maxWebhooks").value(5))
                .andExpect(jsonPath("$[2].plan").value("DEVELOPER"))
                .andExpect(jsonPath("$[2].requestsPerMinute").value(1200))
                .andExpect(jsonPath("$[2].requestsPerMonth").value(1000000))
                .andExpect(jsonPath("$[2].maxApiKeys").value(50))
                .andExpect(jsonPath("$[2].maxWebhooks").value(20));
    }

    // ----------------------------------------------------------------- internal key

    @Test
    void aMissingOrWrongKeyIsRejectedWithAProblemBody() throws Exception {
        mvc.perform(get("/internal/v1/plans")).andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401));
        mvc.perform(get("/internal/v1/plans").header("X-Internal-Key", "wrong")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/v1/plans").header("X-Internal-Key", "")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/v1/plans").header("X-Internal-Key", KEY + "x")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/v1/quota/someone")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/v1/quota/someone").header("X-Internal-Key", "wrong")).andExpect(status().isUnauthorized());
    }

    @Test
    void aValidPlatformTokenDoesNotOpenTheInternalApi() throws Exception {
        mvc.perform(get("/internal/v1/plans").with(jwt().authorities(
                new org.springframework.security.core.authority.SimpleGrantedAuthority("usage:read:all"))))
                .andExpect(status().is4xxClientError());
    }

    // ----------------------------------------------------------------- quota

    @Test
    void usedCountsThisCalendarMonthUtcAcrossTheMonthBoundary() throws Exception {
        clock.set(Instant.parse("2031-03-15T10:00:00Z"));
        String p = "quota-user-1";
        store(p, "2031-02-28T23:59:59Z", "shared", 200, 10);      // last second of February: not this month
        store(p, "2031-03-01T00:00:00Z", "shared", 200, 10);      // first second of March
        store(p, "2031-03-05T12:00:00Z", "shared", 500, 10);      // errors count: the request was served
        store(p, "2031-03-14T23:59:59Z", "shared", 200, 10);      // yesterday
        store("quota-other", "2031-03-05T12:00:00Z", "shared", 200, 10);   // another principal
        store(PrincipalType.USER, p, "2031-03-06T12:00:00Z", "shared", 429, 1, true, "FREE");   // rate limited: never served

        internal("/internal/v1/quota/" + p).andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("FREE"))
                .andExpect(jsonPath("$.monthlyLimit").value(10000))
                .andExpect(jsonPath("$.used").value(3));

        // later in the month the count follows the clock; April has not started yet
        clock.set(Instant.parse("2031-04-01T00:00:00Z"));
        internal("/internal/v1/quota/" + p).andExpect(jsonPath("$.used").value(0));
    }

    @Test
    void usedAddsTheDailyAggregateAndTodaysRawRows() throws Exception {
        clock.set(Instant.parse("2031-01-15T10:00:00Z"));   // January: see AbstractPlatformTest on aggregate watermarks
        String p = "quota-user-2";
        store(p, "2031-01-02T08:00:00Z", "shared", 200, 10);
        store(p, "2031-01-02T09:00:00Z", "shared", 200, 10);
        store(p, "2031-01-03T09:00:00Z", "shared", 200, 10);
        // materialize the daily aggregate for January 1..14 (what the refresh policy does with a one day end offset)
        dsl.execute("call refresh_continuous_aggregate('platform.usage_1d', '2031-01-01 00:00:00+00', '2031-01-15 00:00:00+00')");
        long materialized = ((Number) dsl.fetchValue("select count(*) from " + dsl.fetchValue(
                "select materialization_hypertable_schema || '.' || materialization_hypertable_name from "
                        + "timescaledb_information.continuous_aggregates where view_schema = 'platform' and view_name = 'usage_1d'"))).longValue();
        org.assertj.core.api.Assertions.assertThat(materialized).isGreaterThanOrEqualTo(2);

        // today's rows are only raw rows so far
        store(p, "2031-01-15T09:30:00Z", "shared", 200, 10);
        store(p, "2031-01-15T09:45:00Z", "shared", 200, 10);

        internal("/internal/v1/quota/" + p).andExpect(jsonPath("$.used").value(5));
    }

    @Test
    void thePlanComesFromTheLatestEventAndAQueryParameterOverridesIt() throws Exception {
        clock.set(Instant.parse("2031-03-15T10:00:00Z"));
        String p = "quota-user-3";
        store(PrincipalType.USER, p, "2031-03-02T08:00:00Z", "shared", 200, 10, false, "FREE");
        store(PrincipalType.USER, p, "2031-03-03T08:00:00Z", "shared", 200, 10, false, "PRO");

        internal("/internal/v1/quota/" + p).andExpect(jsonPath("$.plan").value("PRO"))
                .andExpect(jsonPath("$.monthlyLimit").value(200000)).andExpect(jsonPath("$.used").value(2));
        internal("/internal/v1/quota/" + p + "?plan=DEVELOPER").andExpect(jsonPath("$.plan").value("DEVELOPER"))
                .andExpect(jsonPath("$.monthlyLimit").value(1000000)).andExpect(jsonPath("$.used").value(2));
        internal("/internal/v1/quota/" + p + "?plan=GOLD").andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
    }

    @Test
    void anUnknownPrincipalIsOnTheFreePlanWithNothingUsed() throws Exception {
        internal("/internal/v1/quota/never-seen").andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("FREE"))
                .andExpect(jsonPath("$.monthlyLimit").value(10000))
                .andExpect(jsonPath("$.used").value(0));
    }
}
