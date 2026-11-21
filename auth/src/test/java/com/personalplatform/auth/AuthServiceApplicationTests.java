package com.personalplatform.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@Import({TestcontainersConfiguration.class, StubJwtConfig.class})
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.auth.bootstrap-admin-emails=boss@example.com")
class AuthServiceApplicationTests {

    @Autowired MockMvc mvc;
    @Autowired org.jooq.DSLContext dsl;

    private static String bearer(String uid, String email, boolean verified) {
        String raw = uid + "|" + email + "|" + verified;
        return "Bearer " + java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private String idOf(String authHeader) throws Exception {
        String body = mvc.perform(get("/v1/me").header("Authorization", authHeader))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    void rejectsMissingAndInvalidTokens() throws Exception {
        mvc.perform(get("/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/me").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());
    }

    @Test
    void platformSqlAutoConfigurationRegistersSlowQueryListener() {
        assertThat(dsl.configuration().executeListenerProviders())
                .anyMatch(p -> p.provide() instanceof com.personalplatform.sql.SlowQueryListener);
    }

    @Test
    void healthIsPublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void firstSignInProvisionsUserWithUserRoleOnly() throws Exception {
        mvc.perform(post("/v1/auth/session").header("Authorization", bearer("uid-alice", "alice@example.com", true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("alice@example.com"))
                .andExpect(jsonPath("$.roles", containsInAnyOrder("USER")));
    }

    @Test
    void bootstrapAdminRequiresVerifiedEmail() throws Exception {
        mvc.perform(get("/v1/me").header("Authorization", bearer("uid-fake-boss", "boss@example.com", false)))
                .andExpect(jsonPath("$.roles", not(hasItem("ADMIN"))));
        mvc.perform(get("/v1/me").header("Authorization", bearer("uid-boss", "boss@example.com", true)))
                .andExpect(jsonPath("$.roles", hasItem("ADMIN")));
    }

    @Test
    void adminEndpointsAreForbiddenToPlainUsers() throws Exception {
        String bob = bearer("uid-bob", "bob@example.com", true);
        String bobId = idOf(bob);
        mvc.perform(get("/v1/admin/users/" + bobId).header("Authorization", bob)).andExpect(status().isForbidden());
    }

    @Test
    void adminCanGrantAndRevokeRoles() throws Exception {
        String admin = bearer("uid-boss", "boss@example.com", true);
        idOf(admin);
        String carol = bearer("uid-carol", "carol@example.com", true);
        String carolId = idOf(carol);

        mvc.perform(put("/v1/admin/users/" + carolId + "/roles/ADMIN").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", hasItem("ADMIN")));
        // new role takes effect immediately: roles are read from the DB, not baked into the token
        mvc.perform(get("/v1/admin/users/" + carolId).header("Authorization", carol)).andExpect(status().isOk());

        mvc.perform(delete("/v1/admin/users/" + carolId + "/roles/ADMIN").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", not(hasItem("ADMIN"))));
        mvc.perform(get("/v1/admin/users/" + carolId).header("Authorization", carol)).andExpect(status().isForbidden());
    }

    @Test
    void adminGuardrails() throws Exception {
        String admin = bearer("uid-boss", "boss@example.com", true);
        String adminId = idOf(admin);
        mvc.perform(delete("/v1/admin/users/" + adminId + "/roles/ADMIN").header("Authorization", admin))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/v1/admin/users/" + adminId + "/roles/USER").header("Authorization", admin))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/v1/admin/users/" + adminId + "/roles/NOPE").header("Authorization", admin))
                .andExpect(status().isNotFound());
    }
}
