package com.personalplatform.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.test.web.servlet.MockMvc;

import static com.personalplatform.sql.jooq.auth.auth.Tables.USERS;
import static com.personalplatform.sql.jooq.auth.auth.Tables.USER_ROLES;

/** Helpers to create signed-in users in tests (stub Firebase tokens, roles granted straight in the database). */
public final class TestUsers {

    /** A signed-in test user: the bearer header value and the internal id. */
    public record TestUser(String uid, String email, String bearer, UUID id) {}

    private TestUsers() {}

    public static String bearer(String uid, String email, boolean verified) {
        String raw = uid + "|" + email + "|" + verified;
        return "Bearer " + Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /** Creates (provisions) a brand-new verified user with a random uid and returns it. */
    public static TestUser newUser(MockMvc mvc, String label) throws Exception {
        String uid = "uid-" + label + "-" + UUID.randomUUID();
        return signIn(mvc, uid, label + "-" + UUID.randomUUID() + "@example.com", true);
    }

    public static TestUser signIn(MockMvc mvc, String uid, String email, boolean verified) throws Exception {
        String bearer = bearer(uid, email, verified);
        String body = mvc.perform(get("/v1/me").header("Authorization", bearer))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return new TestUser(uid, email, bearer, UUID.fromString(JsonPath.read(body, "$.id")));
    }

    /** The bootstrap OWNER configured in {@link AuthIntegrationTest}. */
    public static TestUser boss(MockMvc mvc) throws Exception {
        return signIn(mvc, "uid-boss", "boss@example.com", true);
    }

    /** Grants a role directly in the database (test set-up only; bypasses guardrails and audit). */
    public static void giveRole(DSLContext dsl, TestUser user, String role) {
        dsl.insertInto(USER_ROLES)
                .set(USER_ROLES.USER_ID, user.id())
                .set(USER_ROLES.ROLE_NAME, role)
                .onConflictDoNothing()
                .execute();
    }

    public static void suspendDirectly(DSLContext dsl, TestUser user) {
        dsl.update(USERS).set(USERS.SUSPENDED_AT, java.time.OffsetDateTime.now()).where(USERS.ID.eq(user.id())).execute();
    }
}
