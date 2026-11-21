package com.personalplatform.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.platform.flags.FlagEvaluator;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class FlagsTest extends AbstractPlatformTest {

    // design 5.2
    static final List<String> MEMBER = List.of("products:use", "usage:read:self", "connections:manage");
    static final List<String> DEVELOPER = List.of("products:use", "usage:read:self", "connections:manage", "apps:manage",
            "keys:manage", "webhooks:manage", "sandbox:use", "logs:read:own", "workspaces:manage");
    static final List<String> AUDITOR = List.of("usage:read:all", "users:read", "audit:read", "apps:read:all");
    static final List<String> ADMIN = List.of("products:use", "usage:read:self", "connections:manage", "users:read",
            "users:write", "roles:assign", "usage:read:all", "flags:manage", "audit:read", "apps:read:all", "support:impersonate");
    static final List<String> OWNER = List.of("products:use", "usage:read:self", "usage:read:all", "connections:manage",
            "users:read", "users:write", "roles:assign", "roles:assign:privileged", "plans:manage", "flags:manage",
            "audit:read", "apps:read:all", "support:impersonate");

    @BeforeEach
    void emptyFlags() {
        dsl.execute("delete from platform.feature_flags");
    }

    private static RequestPostProcessor as(List<String> permissions, String uid, String plan, List<String> roles) {
        return jwt().jwt(j -> {
            j.subject("firebase-" + uid);
            if (uid != null) j.claim("uid", uid);
            if (plan != null) j.claim("plan", plan);
            j.claim("roles", roles);
        }).authorities(permissions.stream().map(a -> (GrantedAuthority) new SimpleGrantedAuthority(a)).toList());
    }

    private static RequestPostProcessor admin() {
        return as(ADMIN, "admin-1", "PRO", List.of("MEMBER", "ADMIN"));
    }

    private static RequestPostProcessor caller(String uid, String plan, String... roles) {
        return as(MEMBER, uid, plan, List.of(roles));
    }

    private static String body(String key, boolean enabled, Object rollout, String plans, String roles) {
        return "{\"key\":" + (key == null ? "null" : "\"" + key + "\"") + ",\"description\":\"d\",\"enabled\":" + enabled
                + ",\"rolloutPercent\":" + rollout
                + (plans == null ? "" : ",\"allowedPlans\":" + plans)
                + (roles == null ? "" : ",\"allowedRoles\":" + roles) + "}";
    }

    private ResultActions create(RequestPostProcessor who, String json) throws Exception {
        return mvc.perform(post("/v1/flags").with(who).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private void createOk(String key, boolean enabled, int rollout, String plans, String roles) throws Exception {
        create(admin(), body(key, enabled, rollout, plans, roles)).andExpect(status().isCreated());
    }

    private Map<String, Boolean> evaluate(RequestPostProcessor who) throws Exception {
        String json = mvc.perform(get("/v1/flags/evaluate").with(who)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.flags");
    }

    // ----------------------------------------------------------------- authorization

    @Test
    void personaMatrixForTheAdminEndpoints() throws Exception {
        createOk("existing", true, 100, null, null);
        String payload = body("persona-flag", true, 50, null, null);

        for (var persona : Map.of("MEMBER", MEMBER, "DEVELOPER", DEVELOPER, "AUDITOR", AUDITOR).entrySet()) {
            var who = as(persona.getValue(), "p-" + persona.getKey(), "FREE", List.of(persona.getKey()));
            mvc.perform(get("/v1/flags").with(who)).andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(403));
            mvc.perform(post("/v1/flags").with(who).contentType(MediaType.APPLICATION_JSON).content(payload))
                    .andExpect(status().isForbidden());
            mvc.perform(put("/v1/flags/existing").with(who).contentType(MediaType.APPLICATION_JSON).content(payload))
                    .andExpect(status().isForbidden());
            mvc.perform(delete("/v1/flags/existing").with(who)).andExpect(status().isForbidden());
            // everyone signed in may ask what is on for themselves
            mvc.perform(get("/v1/flags/evaluate").with(who)).andExpect(status().isOk());
        }
        assertThat(dsl.fetchValue("select count(*) from platform.feature_flags")).isEqualTo(1L);   // nothing was written

        for (var persona : Map.of("ADMIN", ADMIN, "OWNER", OWNER).entrySet()) {
            var who = as(persona.getValue(), "p-" + persona.getKey(), "PRO", List.of(persona.getKey()));
            String key = "by-" + persona.getKey().toLowerCase();
            mvc.perform(get("/v1/flags").with(who)).andExpect(status().isOk());
            create(who, body(key, true, 10, null, null)).andExpect(status().isCreated());
            mvc.perform(put("/v1/flags/" + key).with(who).contentType(MediaType.APPLICATION_JSON)
                    .content(body(key, false, 20, null, null))).andExpect(status().isOk());
            mvc.perform(delete("/v1/flags/" + key).with(who)).andExpect(status().isNoContent());
        }
    }

    @Test
    void anonymousCallersAreRejectedEverywhere() throws Exception {
        mvc.perform(get("/v1/flags")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/flags/evaluate")).andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        mvc.perform(post("/v1/flags").contentType(MediaType.APPLICATION_JSON).content(body("x", true, 1, null, null)))
                .andExpect(status().isUnauthorized());
    }

    // ----------------------------------------------------------------- CRUD

    @Test
    void createListUpdateDeleteRoundTrip() throws Exception {
        create(admin(), body("new-ui", true, 25, "[\"PRO\",\"DEVELOPER\"]", "[\"ADMIN\"]"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.key").value("new-ui"))
                .andExpect(jsonPath("$.description").value("d"))
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.rolloutPercent").value(25))
                .andExpect(jsonPath("$.allowedPlans[0]").value("PRO"))
                .andExpect(jsonPath("$.allowedPlans[1]").value("DEVELOPER"))
                .andExpect(jsonPath("$.allowedRoles[0]").value("ADMIN"))
                .andExpect(jsonPath("$.updatedBy").value("admin-1"))
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.updatedAt").isNotEmpty());
        createOk("a-second", false, 0, null, null);

        mvc.perform(get("/v1/flags").with(admin())).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].key").value("a-second"))      // ordered by key
                .andExpect(jsonPath("$[0].allowedPlans", hasSize(0)))   // null and empty both mean "no restriction"
                .andExpect(jsonPath("$[1].key").value("new-ui"));

        mvc.perform(put("/v1/flags/new-ui").with(as(OWNER, "owner-1", "PRO", List.of("OWNER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"changed\",\"enabled\":false,\"rolloutPercent\":75,\"allowedPlans\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").value("changed"))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.rolloutPercent").value(75))
                .andExpect(jsonPath("$.allowedPlans", hasSize(0)))
                .andExpect(jsonPath("$.allowedRoles", hasSize(0)))
                .andExpect(jsonPath("$.updatedBy").value("owner-1"));

        mvc.perform(delete("/v1/flags/new-ui").with(admin())).andExpect(status().isNoContent());
        mvc.perform(get("/v1/flags").with(admin())).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void duplicateKeyIsAConflictAndUnknownKeysAreNotFound() throws Exception {
        createOk("dupe", true, 100, null, null);
        create(admin(), body("dupe", false, 5, null, null)).andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(containsString("dupe")));
        mvc.perform(put("/v1/flags/ghost").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(body("ghost", true, 5, null, null))).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        mvc.perform(delete("/v1/flags/ghost").with(admin())).andExpect(status().isNotFound());
        assertThat(dsl.fetchValue("select rollout_percent from platform.feature_flags where key = 'dupe'")).isEqualTo((short) 100);
    }

    @Test
    void keysAreValidatedAsProblemBodies() throws Exception {
        for (String bad : List.of("Upper", "-leading", ".dot", "has space", "UPPER", "x".repeat(65), "", "slash/key")) {
            create(admin(), body(bad, true, 10, null, null)).andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(400));
        }
        create(admin(), body(null, true, 10, null, null)).andExpect(status().isBadRequest());
        create(admin(), "{\"description\":\"no key\"}").andExpect(status().isBadRequest());
        for (String good : List.of("a", "0", "a.b-c_d", "x".repeat(64))) {
            create(admin(), body(good, true, 10, null, null)).andExpect(status().isCreated());
        }
    }

    @Test
    void otherInputIsValidated() throws Exception {
        for (Object rollout : List.of(-1, 101, 1000, "\"half\"")) {
            create(admin(), body("bad-rollout", true, rollout, null, null)).andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        }
        create(admin(), body("bad-plan", true, 10, "[\"pro plan\"]", null)).andExpect(status().isBadRequest());
        create(admin(), body("bad-plan", true, 10, "[\"\"]", null)).andExpect(status().isBadRequest());
        create(admin(), body("bad-role", true, 10, null, "[\"lower\"]")).andExpect(status().isBadRequest());
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 21; i++) many.add("\"R" + i + "\"");
        create(admin(), body("too-many", true, 10, null, "[" + String.join(",", many) + "]")).andExpect(status().isBadRequest());
        create(admin(), "{\"key\":\"long-desc\",\"description\":\"" + "x".repeat(501) + "\"}").andExpect(status().isBadRequest());
        create(admin(), "{not json").andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        // a body key that disagrees with the path is a client mistake, not a rename
        createOk("path-key", true, 10, null, null);
        mvc.perform(put("/v1/flags/path-key").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(body("other-key", true, 10, null, null))).andExpect(status().isBadRequest());
        assertThat(dsl.fetchValue("select count(*) from platform.feature_flags")).isEqualTo(1L);
    }

    @Test
    void omittedOptionalFieldsDefaultToOffFullRolloutAndNoRestrictions() throws Exception {
        create(admin(), "{\"key\":\"defaults\"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.description").value(""))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.rolloutPercent").value(100))
                .andExpect(jsonPath("$.allowedPlans", hasSize(0)));
    }

    // ----------------------------------------------------------------- evaluation

    @Test
    void theBucketAlgorithmIsPinned() {
        // first four bytes of SHA-256(uid + ":" + key), unsigned, mod 100; other services may rely on this
        assertThat(FlagEvaluator.bucket("user-1", "new-ui")).isEqualTo(67);
        assertThat(FlagEvaluator.bucket("00000000-0000-0000-0000-000000000001", "beta.search")).isEqualTo(92);
    }

    @Test
    void evaluationIsDeterministicPerUser() throws Exception {
        createOk("sticky", true, 50, null, null);
        for (int u = 0; u < 40; u++) {
            var who = caller("sticky-user-" + u, "FREE", "MEMBER");
            boolean first = evaluate(who).get("sticky");
            for (int i = 0; i < 4; i++) {
                assertThat(evaluate(who).get("sticky")).as("user %d, call %d", u, i).isEqualTo(first);
            }
            assertThat(first).isEqualTo(FlagEvaluator.bucket("sticky-user-" + u, "sticky") < 50);
        }
    }

    @Test
    void rolloutPercentageLandsWithinFivePointsOfTheConfiguredValue() throws Exception {
        for (int percent : List.of(10, 50, 80)) {
            String key = "rollout-" + percent;
            createOk(key, true, percent, null, null);
            int on = 0;
            for (int u = 0; u < 1000; u++) {
                if (evaluate(caller("synthetic-uid-" + u, "FREE", "MEMBER")).get(key)) on++;
            }
            assertThat(on / 10.0).as("share of 1000 users on for %d%%", percent).isBetween(percent - 5.0, percent + 5.0);
        }
    }

    @Test
    void rolloutBoundsAreExact() throws Exception {
        createOk("none", true, 0, null, null);
        createOk("all", true, 100, null, null);
        for (int u = 0; u < 200; u++) {
            Map<String, Boolean> flags = evaluate(caller("bound-" + u, "FREE", "MEMBER"));
            assertThat(flags.get("none")).isFalse();
            assertThat(flags.get("all")).isTrue();
        }
    }

    @Test
    void aDisabledFlagIsOffRegardlessOfRollout() throws Exception {
        createOk("off-full", false, 100, null, null);
        createOk("off-gated", false, 100, "[\"FREE\"]", "[\"MEMBER\"]");
        for (int u = 0; u < 50; u++) {
            Map<String, Boolean> flags = evaluate(caller("off-" + u, "FREE", "MEMBER"));
            assertThat(flags).containsEntry("off-full", false).containsEntry("off-gated", false);
        }
    }

    @Test
    void planGating() throws Exception {
        createOk("paid-only", true, 100, "[\"PRO\",\"DEVELOPER\"]", null);
        assertThat(evaluate(caller("g1", "PRO", "MEMBER"))).containsEntry("paid-only", true);
        assertThat(evaluate(caller("g1", "DEVELOPER", "MEMBER"))).containsEntry("paid-only", true);
        assertThat(evaluate(caller("g1", "FREE", "MEMBER"))).containsEntry("paid-only", false);
        assertThat(evaluate(as(MEMBER, "g1", null, List.of("MEMBER")))).as("no plan claim").containsEntry("paid-only", false);
    }

    @Test
    void roleGating() throws Exception {
        createOk("staff-only", true, 100, null, "[\"ADMIN\",\"OWNER\"]");
        assertThat(evaluate(caller("r1", "FREE", "MEMBER", "ADMIN"))).containsEntry("staff-only", true);
        assertThat(evaluate(caller("r1", "FREE", "OWNER"))).containsEntry("staff-only", true);
        assertThat(evaluate(caller("r1", "FREE", "MEMBER", "DEVELOPER"))).containsEntry("staff-only", false);
        assertThat(evaluate(caller("r1", "FREE"))).as("no roles").containsEntry("staff-only", false);
        assertThat(evaluate(as(MEMBER, "r1", "FREE", null))).as("no roles claim").containsEntry("staff-only", false);
    }

    @Test
    void planAndRoleAndRolloutMustAllPass() throws Exception {
        createOk("strict", true, 100, "[\"PRO\"]", "[\"DEVELOPER\"]");
        assertThat(evaluate(caller("s1", "PRO", "DEVELOPER"))).containsEntry("strict", true);
        assertThat(evaluate(caller("s1", "PRO", "MEMBER"))).containsEntry("strict", false);
        assertThat(evaluate(caller("s1", "FREE", "DEVELOPER"))).containsEntry("strict", false);
    }

    @Test
    void theUidClaimIsUsedAndTheSubjectIsTheFallback() throws Exception {
        createOk("who", true, 50, null, null);
        // find a uid that is in and one that is out so the assertion cannot pass by accident
        String in = null, out = null;
        for (int i = 0; in == null || out == null; i++) {
            if (FlagEvaluator.bucket("fb-" + i, "who") < 50) in = "fb-" + i; else out = "fb-" + i;
        }
        var subjectOnly = jwt().jwt(j -> j.subject("firebase-subject"));
        var withUid = jwt().jwt(j -> j.subject("firebase-subject").claim("uid", "the-uid"));
        assertThat(evaluate(withUid).get("who")).isEqualTo(FlagEvaluator.bucket("the-uid", "who") < 50);
        assertThat(evaluate(subjectOnly).get("who")).isEqualTo(FlagEvaluator.bucket("firebase-subject", "who") < 50);
        assertThat(evaluate(caller(in, "FREE")).get("who")).isTrue();
        assertThat(evaluate(caller(out, "FREE")).get("who")).isFalse();
    }

    @Test
    void deletedFlagsDisappearFromEvaluation() throws Exception {
        createOk("short-lived", true, 100, null, null);
        createOk("keeper", true, 100, null, null);
        assertThat(evaluate(caller("d1", "FREE", "MEMBER"))).containsEntry("short-lived", true).containsEntry("keeper", true);
        mvc.perform(delete("/v1/flags/short-lived").with(admin())).andExpect(status().isNoContent());
        Map<String, Boolean> after = evaluate(caller("d1", "FREE", "MEMBER"));
        assertThat(after).containsEntry("keeper", true).doesNotContainKey("short-lived");
    }

    @Test
    void withNoFlagsTheAnswerIsAnEmptyMap() throws Exception {
        mvc.perform(get("/v1/flags/evaluate").with(caller("e1", "FREE", "MEMBER"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.flags").isMap())
                .andExpect(jsonPath("$.flags").isEmpty());
    }

    // ----------------------------------------------------------------- audit trail

    @Test
    void everyChangeIsAppendedToTheAuditTrailAndSurvivesDeletion() throws Exception {
        dsl.execute("select 1");
        long before = (Long) dsl.fetchValue("select count(*) from platform.flag_audit where flag_key = 'audited'");
        create(admin(), body("audited", true, 10, null, null)).andExpect(status().isCreated());
        mvc.perform(put("/v1/flags/audited").with(as(OWNER, "owner-1", "PRO", List.of("OWNER")))
                .contentType(MediaType.APPLICATION_JSON).content(body("audited", false, 20, null, null))).andExpect(status().isOk());
        mvc.perform(delete("/v1/flags/audited").with(admin())).andExpect(status().isNoContent());

        var rows = dsl.fetch("select action, actor, detail->>'enabled' as enabled, detail->>'rolloutPercent' as rollout "
                + "from platform.flag_audit where flag_key = 'audited' order by id");
        assertThat(rows).hasSize((int) before + 3);
        assertThat(rows.map(r -> r.get("action") + "/" + r.get("actor") + "/" + r.get("enabled") + "/" + r.get("rollout")))
                .containsExactly("CREATE/admin-1/true/10", "UPDATE/owner-1/false/20", "DELETE/admin-1/false/20");
    }

    @Test
    void rejectedChangesLeaveNoAuditRows() throws Exception {
        long before = (Long) dsl.fetchValue("select count(*) from platform.flag_audit");
        create(admin(), body("Bad Key", true, 10, null, null)).andExpect(status().isBadRequest());
        mvc.perform(delete("/v1/flags/ghost").with(admin())).andExpect(status().isNotFound());
        mvc.perform(post("/v1/flags").with(as(MEMBER, "m", "FREE", List.of("MEMBER"))).contentType(MediaType.APPLICATION_JSON)
                .content(body("nope", true, 10, null, null))).andExpect(status().isForbidden());
        assertThat(dsl.fetchValue("select count(*) from platform.flag_audit")).isEqualTo(before);
    }
}
