package com.personalplatform.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.platform.usage.PrincipalType;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** All test data lives after 2032-01-01 (see {@link AbstractPlatformTest} on aggregate watermarks). */
class AnalyticsTest extends AbstractPlatformTest {

    // design 5.2
    static final List<String> MEMBER = List.of("products:use", "usage:read:self", "connections:manage");
    static final List<String> ADMIN = List.of("products:use", "usage:read:self", "connections:manage", "users:read",
            "users:write", "roles:assign", "usage:read:all", "flags:manage", "audit:read", "apps:read:all", "support:impersonate");
    static final List<String> AUDITOR = List.of("usage:read:all", "users:read", "audit:read", "apps:read:all");
    static final List<String> OWNER = List.of("products:use", "usage:read:self", "usage:read:all", "connections:manage",
            "users:read", "users:write", "roles:assign", "roles:assign:privileged", "plans:manage", "flags:manage",
            "audit:read", "apps:read:all", "support:impersonate");

    private static RequestPostProcessor as(List<String> permissions, String uid) {
        return jwt().jwt(j -> j.subject("firebase-" + uid).claim("uid", uid))
                .authorities(permissions.stream().map(a -> (GrantedAuthority) new SimpleGrantedAuthority(a)).toList());
    }

    private ResultActions summary(RequestPostProcessor who, String query) throws Exception {
        return mvc.perform(get("/v1/usage/summary?" + query).with(who));
    }

    private static String range(String from, String to) {
        return "from=" + from + "&to=" + to;
    }

    // ----------------------------------------------------------------- authorization

    @Test
    void personaMatrix() throws Exception {
        String q = range("2032-01-01T00:00:00Z", "2032-01-02T00:00:00Z");
        for (var persona : Map.of("ADMIN", ADMIN, "AUDITOR", AUDITOR, "OWNER", OWNER).entrySet()) {
            var who = as(persona.getValue(), "p-" + persona.getKey());
            mvc.perform(get("/v1/usage/summary?" + q).with(who)).andExpect(status().isOk());
            mvc.perform(get("/v1/usage/top-users?" + q).with(who)).andExpect(status().isOk());
            mvc.perform(get("/v1/usage/me?" + q).with(who)).andExpect(status().isOk());
        }
        var member = as(MEMBER, "p-member");
        for (String platformWide : List.of("/v1/usage/summary?", "/v1/usage/top-users?")) {
            mvc.perform(get(platformWide + q).with(member)).andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(403));
        }
        mvc.perform(get("/v1/usage/me?" + q).with(member)).andExpect(status().isOk());
        // a principal with no usage permission at all (a DEVELOPER-less API key, say) sees nothing
        var nothing = as(List.of("products:use"), "p-nothing");
        mvc.perform(get("/v1/usage/me?" + q).with(nothing)).andExpect(status().isForbidden());
        mvc.perform(get("/v1/usage/summary?" + q).with(nothing)).andExpect(status().isForbidden());
    }

    @Test
    void noTokenIsA401ProblemBody() throws Exception {
        for (String path : List.of("/v1/usage/summary", "/v1/usage/top-users", "/v1/usage/me")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(401));
        }
    }

    @Test
    void healthIsPublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isNotFound()); // health is served on the private management port only (ObservabilityExposureTest)
    }

    // ----------------------------------------------------------------- me

    @Test
    void meNeverLeaksAnotherPrincipalEvenWithPrincipalIdSet() throws Exception {
        String a = "me-a-" + UUID.randomUUID();
        String b = "me-b-" + UUID.randomUUID();
        for (int i = 0; i < 3; i++) {
            store(a, "2032-02-01T10:0" + i + ":00Z", "shared", 200, 10);
        }
        for (int i = 0; i < 5; i++) {
            store(b, "2032-02-01T11:0" + i + ":00Z", "shared", 200, 10);
        }
        String q = range("2032-02-01T00:00:00Z", "2032-02-02T00:00:00Z");

        mvc.perform(get("/v1/usage/me?" + q).with(as(MEMBER, a))).andExpect(jsonPath("$.totalRequests").value(3));
        // asking for someone else changes nothing
        mvc.perform(get("/v1/usage/me?" + q + "&principalId=" + b).with(as(MEMBER, a)))
                .andExpect(jsonPath("$.totalRequests").value(3));
        // even a caller with usage:read:all gets only their own numbers from /me
        mvc.perform(get("/v1/usage/me?" + q + "&principalId=" + b).with(as(ADMIN, a)))
                .andExpect(jsonPath("$.totalRequests").value(3));
        mvc.perform(get("/v1/usage/me?" + q).with(as(MEMBER, b))).andExpect(jsonPath("$.totalRequests").value(5));
        // the summary endpoint honours principalId for those allowed to ask
        summary(as(ADMIN, "admin-x"), q + "&principalId=" + b).andExpect(jsonPath("$.totalRequests").value(5));
    }

    @Test
    void meScopesToTheUidClaimAndFallsBackToTheSubject() throws Exception {
        String uid = "uid-" + UUID.randomUUID();
        String sub = "sub-" + UUID.randomUUID();
        store(uid, "2032-02-03T10:00:00Z", "shared", 200, 10);
        store(sub, "2032-02-03T10:00:00Z", "shared", 200, 10);
        store(sub, "2032-02-03T10:01:00Z", "shared", 200, 10);
        String q = range("2032-02-03T00:00:00Z", "2032-02-04T00:00:00Z");

        // uid claim wins over the subject
        mvc.perform(get("/v1/usage/me?" + q).with(jwt().jwt(j -> j.subject(sub).claim("uid", uid))
                .authorities(new SimpleGrantedAuthority("usage:read:self")))).andExpect(jsonPath("$.totalRequests").value(1));
        // no uid claim: the subject
        mvc.perform(get("/v1/usage/me?" + q).with(jwt().jwt(j -> j.subject(sub))
                .authorities(new SimpleGrantedAuthority("usage:read:self")))).andExpect(jsonPath("$.totalRequests").value(2));
    }

    // ----------------------------------------------------------------- summary numbers

    @Test
    void knownEventsGiveExactTotalsErrorRateBreakdownsAndAPercentileWithinOneBucket() throws Exception {
        String svc = "svc-" + UUID.randomUUID();
        String other = "other-" + UUID.randomUUID();
        // 100 requests: 80 x 200 and 10 x 404 at 20 ms, 5 x 500 at 300 ms, 5 x 503 at 800 ms; spread over two days
        for (int i = 0; i < 100; i++) {
            int status = i < 80 ? 200 : i < 90 ? 404 : i < 95 ? 500 : 503;
            int latency = i < 90 ? 20 : i < 95 ? 300 : 800;
            String user = "u" + (i % 3);   // three distinct users
            String day = i % 2 == 0 ? "2032-03-01" : "2032-03-02";
            store(user, day + "T10:" + String.format("%02d", i % 60) + ":00Z", svc, status, latency);
        }
        // noise that must not count: other service, an API key and an anonymous caller on the same service
        store("u0", "2032-03-01T10:00:00Z", other, 200, 10);
        store(PrincipalType.API_KEY, "key-1", "2032-03-01T11:00:00Z", svc, 200, 20, false, "PRO");
        store(PrincipalType.ANON, "anon:abc", "2032-03-01T11:00:00Z", svc, 401, 20, false, null);

        MvcResult r = summary(as(ADMIN, "admin-1"), range("2032-03-01T00:00:00Z", "2032-03-03T00:00:00Z") + "&service=" + svc)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRequests").value(102))
                .andExpect(jsonPath("$.activeUsers").value(3))
                .andExpect(jsonPath("$.byService", hasSize(1)))
                .andExpect(jsonPath("$.byService[0].service").value(svc))
                .andExpect(jsonPath("$.byService[0].requests").value(102))
                .andExpect(jsonPath("$.byService[0].errors").value(10))
                .andExpect(jsonPath("$.byStatusClass['2xx']").value(81))
                .andExpect(jsonPath("$.byStatusClass['4xx']").value(11))
                .andExpect(jsonPath("$.byStatusClass['5xx']").value(10))
                .andExpect(jsonPath("$.byStatusClass['3xx']").doesNotExist())
                .andExpect(jsonPath("$.resolution").value("1h"))
                .andReturn();
        String body = r.getResponse().getContentAsString();
        // errors are 5xx: 10 of 102
        assertThat(JsonPath.<Number>read(body, "$.errorRate").doubleValue()).isCloseTo(10 / 102.0, org.assertj.core.data.Offset.offset(1e-9));
        // 82 requests at 20 ms (bucket 10..25), 5 at 300 (250..500), 5 at 800 (500..1000), then noise at 20: p50 in 10..25, p95 in 250..500
        double p50 = JsonPath.<Number>read(body, "$.p50Ms").doubleValue();
        double p95 = JsonPath.<Number>read(body, "$.p95Ms").doubleValue();
        assertThat(p50).isBetween(10.0, 25.0);
        assertThat(p95).isBetween(250.0, 500.0);
        // time series: one point per hour bucket that saw traffic, in order, requests and 5xx per point
        List<String> ts = JsonPath.read(body, "$.series[*].ts");
        assertThat(ts).isSorted();
        long requests = JsonPath.<List<Number>>read(body, "$.series[*].requests").stream().mapToLong(Number::longValue).sum();
        long errors = JsonPath.<List<Number>>read(body, "$.series[*].errors").stream().mapToLong(Number::longValue).sum();
        assertThat(requests).isEqualTo(102);
        assertThat(errors).isEqualTo(10);
    }

    @Test
    void anEmptyRangeIsZeroesAndNoPercentiles() throws Exception {
        summary(as(ADMIN, "admin-2"), range("2032-04-01T00:00:00Z", "2032-04-02T00:00:00Z") + "&service=nobody-" + UUID.randomUUID())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRequests").value(0))
                .andExpect(jsonPath("$.errorRate").value(0.0))
                .andExpect(jsonPath("$.p50Ms").value(nullValue()))
                .andExpect(jsonPath("$.p95Ms").value(nullValue()))
                .andExpect(jsonPath("$.activeUsers").value(0))
                .andExpect(jsonPath("$.byService", hasSize(0)))
                .andExpect(jsonPath("$.series", hasSize(0)));
    }

    @Test
    void theRangeSelectsTheAggregate() throws Exception {
        var who = as(ADMIN, "admin-3");
        String svc = "&service=none-" + UUID.randomUUID();
        // at most 3 hours: one-minute buckets
        summary(who, range("2032-05-01T00:00:00Z", "2032-05-01T01:00:00Z") + svc).andExpect(jsonPath("$.resolution").value("1m"));
        summary(who, range("2032-05-01T00:00:00Z", "2032-05-01T03:00:00Z") + svc).andExpect(jsonPath("$.resolution").value("1m"));
        // up to 14 days: hourly
        summary(who, range("2032-05-01T00:00:00Z", "2032-05-01T03:00:01Z") + svc).andExpect(jsonPath("$.resolution").value("1h"));
        summary(who, range("2032-05-01T00:00:00Z", "2032-05-15T00:00:00Z") + svc).andExpect(jsonPath("$.resolution").value("1h"));
        // beyond: daily
        summary(who, range("2032-05-01T00:00:00Z", "2032-05-15T00:00:01Z") + svc).andExpect(jsonPath("$.resolution").value("1d"));
        summary(who, range("2032-01-01T00:00:00Z", "2032-12-31T00:00:00Z") + svc).andExpect(jsonPath("$.resolution").value("1d"));
        // the same holds for /me and top-users
        mvc.perform(get("/v1/usage/me?" + range("2032-05-01T00:00:00Z", "2032-05-01T01:00:00Z")).with(who))
                .andExpect(jsonPath("$.resolution").value("1m"));
    }

    @Test
    void aShortRangeThatReachesBeyondTheMinuteRetentionFallsBackToTheCoarserAggregate() throws Exception {
        // "now" is 2032-06-30; one-minute rollups are only kept 30 days, so an hour-long window in early May must use hours
        clock.set(Instant.parse("2032-06-30T00:00:00Z"));
        summary(as(ADMIN, "admin-4"), range("2032-05-01T00:00:00Z", "2032-05-01T01:00:00Z") + "&service=x")
                .andExpect(jsonPath("$.resolution").value("1h"));
        // and a short window beyond the hourly retention (one year) uses days
        clock.set(Instant.parse("2034-01-01T00:00:00Z"));
        summary(as(ADMIN, "admin-4"), range("2032-05-01T00:00:00Z", "2032-05-01T01:00:00Z") + "&service=x")
                .andExpect(jsonPath("$.resolution").value("1d"));
    }

    @Test
    void oneMinuteAndDailySeriesCarryAlignedBucketTimestamps() throws Exception {
        String svc = "svc-" + UUID.randomUUID();
        store("u1", "2032-07-01T10:00:10Z", svc, 200, 10);
        store("u1", "2032-07-01T10:00:50Z", svc, 500, 10);
        store("u1", "2032-07-01T10:05:00Z", svc, 200, 10);
        store("u1", "2032-07-02T09:00:00Z", svc, 200, 10);

        // 1 hour window: 1 minute buckets
        summary(as(ADMIN, "admin-5"), range("2032-07-01T10:00:00Z", "2032-07-01T11:00:00Z") + "&service=" + svc)
                .andExpect(jsonPath("$.resolution").value("1m"))
                .andExpect(jsonPath("$.series", hasSize(2)))
                .andExpect(jsonPath("$.series[0].ts").value("2032-07-01T10:00:00Z"))
                .andExpect(jsonPath("$.series[0].requests").value(2))
                .andExpect(jsonPath("$.series[0].errors").value(1))
                .andExpect(jsonPath("$.series[1].ts").value("2032-07-01T10:05:00Z"));
        // 20 day window: daily buckets (the range start is floored to the bucket)
        summary(as(ADMIN, "admin-5"), range("2032-06-20T12:00:00Z", "2032-07-10T00:00:00Z") + "&service=" + svc)
                .andExpect(jsonPath("$.resolution").value("1d"))
                .andExpect(jsonPath("$.series", hasSize(2)))
                .andExpect(jsonPath("$.series[0].ts").value("2032-07-01T00:00:00Z"))
                .andExpect(jsonPath("$.series[0].requests").value(3))
                .andExpect(jsonPath("$.series[1].ts").value("2032-07-02T00:00:00Z"));
    }

    @Test
    void withoutARangeTheLast24HoursBeforeNowAreUsed() throws Exception {
        clock.set(Instant.parse("2032-08-10T12:00:00Z"));
        String svc = "svc-" + UUID.randomUUID();
        store("u1", "2032-08-10T11:30:00Z", svc, 200, 10);     // in
        store("u1", "2032-08-09T13:00:00Z", svc, 200, 10);     // in (23 h ago)
        store("u1", "2032-08-08T10:00:00Z", svc, 200, 10);     // out
        summary(as(ADMIN, "admin-6"), "service=" + svc).andExpect(jsonPath("$.totalRequests").value(2))
                .andExpect(jsonPath("$.to").value("2032-08-10T12:00:00Z"))
                .andExpect(jsonPath("$.from").value("2032-08-09T12:00:00Z"));
    }

    // ----------------------------------------------------------------- top users

    @Test
    void topUsersRankPrincipalsByRequestsExcludingAnonymousCallers() throws Exception {
        for (int i = 0; i < 5; i++) {
            store("top-a", "2032-09-01T10:0" + i + ":00Z", "shared", i == 0 ? 500 : 200, 10);
        }
        for (int i = 0; i < 3; i++) {
            store("top-b", "2032-09-01T11:0" + i + ":00Z", "home-pulse", 200, 10);
        }
        for (int i = 0; i < 3; i++) {
            store("top-c", "2032-09-01T12:0" + i + ":00Z", "shared", 200, 10);
        }
        store(PrincipalType.API_KEY, "key-top", "2032-09-01T13:00:00Z", "shared", 200, 10, false, "PRO");
        for (int i = 0; i < 9; i++) {
            store(PrincipalType.ANON, "anon:zzz", "2032-09-01T14:0" + i + ":00Z", "shared", 401, 10, false, null);
        }
        String q = range("2032-09-01T00:00:00Z", "2032-09-02T00:00:00Z");

        mvc.perform(get("/v1/usage/top-users?" + q).with(as(ADMIN, "admin-7"))).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(4)))
                .andExpect(jsonPath("$[0].principalId").value("top-a"))
                .andExpect(jsonPath("$[0].principalType").value("USER"))
                .andExpect(jsonPath("$[0].requests").value(5))
                .andExpect(jsonPath("$[0].errors").value(1))
                // ties broken by principal id
                .andExpect(jsonPath("$[1].principalId").value("top-b"))
                .andExpect(jsonPath("$[2].principalId").value("top-c"))
                .andExpect(jsonPath("$[3].principalId").value("key-top"))
                .andExpect(jsonPath("$[3].principalType").value("API_KEY"));
        mvc.perform(get("/v1/usage/top-users?limit=2&" + q).with(as(AUDITOR, "auditor-1")))
                .andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$[1].principalId").value("top-b"));
    }

    // ----------------------------------------------------------------- bad input

    @Test
    void invalidParametersAreProblemBodies() throws Exception {
        var who = as(ADMIN, "admin-8");
        for (String bad : List.of(
                range("2032-01-02T00:00:00Z", "2032-01-01T00:00:00Z"),      // from after to
                range("2032-01-01T00:00:00Z", "2032-01-01T00:00:00Z"),      // empty
                range("2030-01-01T00:00:00Z", "2032-01-01T00:00:00Z"),      // more than a year
                "from=yesterday&to=today")) {
            summary(who, bad).andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(400));
        }
        String q = range("2032-01-01T00:00:00Z", "2032-01-02T00:00:00Z");
        for (String limit : List.of("0", "-1", "101", "abc")) {
            mvc.perform(get("/v1/usage/top-users?limit=" + limit + "&" + q).with(who)).andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        }
    }
}
