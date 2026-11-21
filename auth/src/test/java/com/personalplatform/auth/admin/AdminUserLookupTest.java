package com.personalplatform.auth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.auth.AuthIntegrationTest;
import com.personalplatform.auth.TestUsers;
import com.personalplatform.auth.TestUsers.TestUser;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.jooq.DSLContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** {@code GET /v1/admin/users/lookup?ids=...}: names for ids, so admin screens do not show raw UUIDs. */
@AuthIntegrationTest
class AdminUserLookupTest {

    @Autowired MockMvc mvc;
    @Autowired DSLContext dsl;

    private TestUser withRole(String label, String role) throws Exception {
        TestUser u = TestUsers.newUser(mvc, label);
        if (role != null) {
            TestUsers.giveRole(dsl, u, role);
        }
        return u;
    }

    private ResultActions lookup(TestUser who, String ids) throws Exception {
        var req = get("/v1/admin/users/lookup");
        if (ids != null) {
            req = req.queryParam("ids", ids);
        }
        return mvc.perform(who == null ? req : req.header("Authorization", who.bearer()));
    }

    private static String join(List<?> ids) {
        return ids.stream().map(Object::toString).collect(Collectors.joining(","));
    }

    @Test
    void permissionMatrix() throws Exception {
        TestUser target = withRole("target", null);
        lookup(null, target.id().toString()).andExpect(status().isUnauthorized());
        for (String role : new String[] {null, "DEVELOPER"}) {
            lookup(withRole("nope", role), target.id().toString()).andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        }
        for (String role : new String[] {"AUDITOR", "ADMIN"}) {
            lookup(withRole("reader", role), target.id().toString()).andExpect(status().isOk());
        }
        lookup(TestUsers.boss(mvc), target.id().toString()).andExpect(status().isOk());
    }

    @Test
    void returnsIdEmailAndDisplayNameOnly() throws Exception {
        TestUser auditor = withRole("auditor", "AUDITOR");
        TestUser a = withRole("alice", null);
        TestUser b = withRole("bob", null);

        String body = lookup(auditor, a.id() + "," + b.id()).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andReturn().getResponse().getContentAsString();

        List<String> ids = JsonPath.read(body, "$[*].id");
        assertThat(ids).containsExactlyInAnyOrder(a.id().toString(), b.id().toString());
        List<java.util.Map<String, Object>> rows = JsonPath.read(body, "$");
        for (var row : rows) {
            assertThat(row.keySet()).containsExactlyInAnyOrder("id", "email", "displayName");
        }
        List<String> emailOfA = JsonPath.read(body, "$[?(@.id == '" + a.id() + "')].email");
        assertThat(emailOfA).containsExactly(a.email());
        // the Firebase uid is internal and must not appear anywhere in the response
        assertThat(body).doesNotContain(a.uid()).doesNotContain(b.uid()).doesNotContain("firebaseUid");
    }

    @Test
    void unknownIdsAreSimplyOmitted() throws Exception {
        TestUser reader = withRole("reader", "AUDITOR");
        TestUser known = withRole("known", null);
        UUID ghost = UUID.randomUUID();

        lookup(reader, ghost + "," + known.id()).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(known.id().toString()));
        lookup(reader, ghost.toString()).andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test
    void duplicatesAndWhitespaceAreTolerated() throws Exception {
        TestUser reader = withRole("reader", "AUDITOR");
        TestUser u = withRole("dupe", null);
        lookup(reader, u.id() + " , " + u.id() + ",").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void atMostOneHundredIds() throws Exception {
        TestUser reader = withRole("reader", "AUDITOR");
        List<UUID> hundred = IntStream.range(0, 100).mapToObj(i -> UUID.randomUUID()).toList();
        lookup(reader, join(hundred)).andExpect(status().isOk()).andExpect(content().json("[]"));

        List<UUID> over = new ArrayList<>(hundred);
        over.add(UUID.randomUUID());
        lookup(reader, join(over)).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("TOO_MANY_IDS"))
                .andExpect(jsonPath("$.detail").value(containsString("100")));
    }

    @Test
    void malformedOrMissingIdsAreBadRequests() throws Exception {
        TestUser reader = withRole("reader", "AUDITOR");
        TestUser ok = withRole("ok", null);
        lookup(reader, ok.id() + ",not-a-uuid").andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("INVALID_ID"))
                .andExpect(jsonPath("$.detail").value(containsString("not-a-uuid")));
        lookup(reader, "1 or 1=1").andExpect(status().isBadRequest());
        lookup(reader, "").andExpect(status().isBadRequest());
        lookup(reader, " , ").andExpect(status().isBadRequest());
        lookup(reader, null).andExpect(status().isBadRequest());
    }

    @Test
    void theLiteralPathIsNotTreatedAsAUserId() throws Exception {
        // /{id} would reject "lookup" as a malformed UUID; the literal route must win
        lookup(withRole("reader", "AUDITOR"), UUID.randomUUID().toString()).andExpect(status().isOk());
    }
}
